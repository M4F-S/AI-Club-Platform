"""Nexus FastAPI app: auth, fleet, controls, logs, metrics, backups, cron, updates, alerts."""
import asyncio, json, os, threading, time
from pathlib import Path

from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import core, dockerio, metrics as hostmetrics
from . import copilot

app = FastAPI(title="Nexus", docs_url=None, redoc_url=None)
STATIC = Path(__file__).resolve().parent.parent / "static"
METRICS_INTERVAL = 30

_fleet_cache = {"ts": 0.0, "data": None}

# ---------- auth ----------
class LoginIn(BaseModel):
    username: str
    password: str

def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"

def _require_user(request: Request, min_role: str = "readonly"):
    token = request.cookies.get("nexus_session")
    s = core.get_session(token)
    if not s:
        raise HTTPException(401, "Not logged in")
    roles = {"readonly": 0, "operator": 1, "admin": 2}
    if roles.get(s["role"], -1) < roles[min_role]:
        raise HTTPException(403, "Insufficient role")
    return s

def _audit(request: Request, action: str, target=None, detail=None):
    s = core.get_session(request.cookies.get("nexus_session"))
    core.audit(s["username"] if s else "?", action, target, detail)

@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response):
    ip = _client_ip(request)
    ok, msg = core.rate_limit_check(ip)
    if not ok:
        raise HTTPException(429, msg)
    user = core.get_user(body.username.strip())
    valid = user is not None and core.verify_password(body.password, user["pw_hash"])
    core.rate_limit_record(ip, valid)
    if not valid:
        core.audit(body.username, "login_failed")
        raise HTTPException(401, "Invalid username or password")
    token = core.create_session(user["id"])
    core.audit(user["username"], "login", detail=f"ip={ip}")
    response.set_cookie("nexus_session", token, httponly=True, samesite="lax",
                        secure=core.SECURE_COOKIE, max_age=core.SESSION_TTL, path="/")
    return {"ok": True, "username": user["username"], "role": user["role"]}

@app.post("/api/logout")
def logout(request: Request):
    core.destroy_session(request.cookies.get("nexus_session", ""))
    return {"ok": True}

@app.get("/api/me")
def me(request: Request):
    s = core.get_session(request.cookies.get("nexus_session"))
    if not s:
        raise HTTPException(401, "Not logged in")
    return {"username": s["username"], "role": s["role"]}

# ---------- fleet ----------
@app.get("/api/fleet")
def fleet(request: Request):
    _require_user(request)
    now = time.time()
    _fc = globals().get("_fleet_cache") or {"ts": 0.0, "data": None}
    if now - _fc.get("ts", 0) < 8 and _fc.get("data") is not None:
        return _fc["data"]
    from concurrent.futures import ThreadPoolExecutor
    agents = dockerio.fleet()
    def enrich(a):
        if a["status"] == "running":
            a["stats"] = dockerio.agent_stats(a["name"])
            a["heartbeat_ts"] = dockerio.agent_gateway_log_mtime(a["name"])
        else:
            a["stats"] = None
            a["heartbeat_ts"] = None
        a["home"] = dockerio.agent_home(a["name"])
        with core.db() as c:
            reg = c.execute("SELECT * FROM registry WHERE container=?", (a["name"],)).fetchone()
        a["friendly"] = reg["friendly"] if reg and reg["friendly"] else dockerio.friendly_name(a["name"])
        a["color"] = reg["color"] if reg and reg["color"] else None
        return a
    with ThreadPoolExecutor(max_workers=len(agents) or 1) as ex:
        agents = list(ex.map(enrich, agents))
    payload = {"agents": agents}
    globals()["_fleet_cache"] = {"ts": now, "data": payload}
    return payload

@app.get("/api/agents/{name}")
def agent_detail(name: str, request: Request):
    _require_user(request)
    c = dockerio.get_agent(name)
    if not c:
        raise HTTPException(404, "agent not found")
    status = getattr(c, "status", "unknown")
    detail = {
        "name": c.name,
        "id": c.id,
        "status": status,
        "arch": getattr(c, "arch", "native_c" if name in dockerio.NATIVE_C_NAMES else "container"),
        "version": dockerio.agent_version(name) if status == "running" else None,
        "model": dockerio.agent_model(name) if status == "running" else None,
        "bot": dockerio.agent_bot_info(name) if status == "running" else None,
        "home": dockerio.agent_home(name),
        "cron": dockerio.agent_cron(name) if status == "running" else [],
        "memory_stats": dockerio.belya_memory_stats() if name in dockerio.NATIVE_C_NAMES else None,
        "stats": dockerio.agent_stats(name) if status == "running" else None,
    }
    return detail

@app.post("/api/agents/{name}/control")
def agent_control(name: str, action: str, request: Request):
    s = _require_user(request, "operator")
    if action not in ("start", "stop", "restart"):
        raise HTTPException(400, "bad action")
    c = dockerio.get_agent(name)
    if not c:
        raise HTTPException(404, "agent not found")
    try:
        if action == "restart":
            c.restart(timeout=30)
        elif action == "start":
            c.start()
        else:
            c.stop(timeout=30)
    except Exception as e:
        _audit(request, f"agent_{action}", name, f"FAILED: {str(e)[:120]}")
        raise HTTPException(500, str(e)[:160])
    _audit(request, f"agent_{action}", name)
    return {"ok": True, "action": action}

@app.get("/api/agents/{name}/logs")
async def agent_logs(name: str, request: Request, tail: int = 200):
    _require_user(request)
    c = dockerio.get_agent(name)
    if not c or c.status != "running":
        raise HTTPException(404, "agent not running")
    return Response(content=dockerio.agent_gateway_log(name, tail),
                    media_type="text/plain")

@app.get("/api/agents/{name}/logstream")
async def agent_logstream(name: str, request: Request):
    """SSE live tail of the gateway log file, polled."""
    _require_user(request)
    c = dockerio.get_agent(name)
    if not c or c.status != "running":
        raise HTTPException(404, "agent not running")

    async def gen():
        last = None
        yield "data: connected\n\n"
        while True:
            try:
                lines = dockerio.agent_gateway_log(name, 50) or ""
                # find first new line vs last snapshot
                if last is None:
                    for ln in lines.splitlines()[-20:]:
                        yield f"data: {json.dumps({'line': ln})}\n\n"
                else:
                    idx = lines.find(last)
                    new_part = lines[idx + len(last):] if idx >= 0 else lines
                    for ln in new_part.splitlines():
                        if ln.strip():
                            yield f"data: {json.dumps({'line': ln})}\n\n"
                snapshot = lines[-500:]
                last = snapshot
            except Exception as e:
                yield f"data: {json.dumps({'line': f'[stream error] {str(e)[:120]}'})}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ---------- VPS metrics ----------
_mc_cache = None
_mc_ts = 0.0

@app.get("/api/metrics/current")
def metrics_current(request: Request):
    _require_user(request)
    now = time.time()
    if now - globals()["_mc_ts"] < 8.0 and globals()["_mc_cache"] is not None:
        return globals()["_mc_cache"]
    # Host values come from the background poller's latest DB sample (<=30s
    # old) instead of re-sampling CPU live (which sleeps ~2.4s per call).
    hm = None
    with core.db() as c:
        row = c.execute("""SELECT cpu, mem_used, mem_total, disk_used, disk_total,
                                  load1, load5, load15 FROM metrics
                           ORDER BY ts DESC LIMIT 1""").fetchone()
    if row:
        hm = {
            "cpu_pct": row["cpu"],
            "mem": {"used": row["mem_used"], "total": row["mem_total"],
                    "pct": round(100.0 * row["mem_used"] / row["mem_total"], 1) if row["mem_total"] else 0},
            "load": [row["load1"], row["load5"], row["load15"]],
            "load1": row["load1"], "load5": row["load5"], "load15": row["load15"],
            "disk": [{"path": "/", "used": row["disk_used"], "total": row["disk_total"],
                      "pct": round(100.0 * row["disk_used"] / row["disk_total"], 1) if row["disk_total"] else 0}],
        }
    agents = dockerio.fleet()
    up = sum(1 for a in agents if a["status"] == "running")
    out = {"host": hm, "agents_up": up, "agents_total": len(agents),
           "containers": dockerio.all_containers(cache_ms=8000)}
    globals()["_mc_cache"] = out
    globals()["_mc_ts"] = time.time()   # stamp AFTER compute, not before
    return out

@app.get("/api/metrics/history")
def metrics_history(request: Request, hours: int = 24):
    _require_user(request)
    since = int(time.time()) - hours * 3600
    with core.db() as c:
        rows = c.execute("""SELECT ts, cpu, mem_used, mem_total, disk_used, disk_total,
                                   load1, load5, load15, containers_up, agents_up
                            FROM metrics WHERE ts>=? ORDER BY ts""", (since,)).fetchall()
    return {"points": [dict(r) for r in rows]}

# ---------- containers ----------
@app.get("/api/containers")
def containers(request: Request):
    _require_user(request)
    return {"containers": dockerio.all_containers(cache_ms=8000)}
    return {"containers": dockerio.all_containers()}

# ---------- backups ----------
class BackupIn(BaseModel):
    agent: str
class RestoreIn(BaseModel):
    agent: str
    file: str

@app.get("/api/backups")
def backups_list(request: Request):
    _require_user(request)
    return {"backups": dockerio.list_backups()}

@app.post("/api/backups/run")
def backups_run(body: BackupIn, request: Request):
    _require_user(request, "operator")
    res = dockerio.backup_agent(body.agent)
    _audit(request, "backup_run", body.agent, res.get("file") or res.get("error"))
    if not res.get("ok"):
        raise HTTPException(500, res.get("error", "backup failed"))
    return res

@app.post("/api/backups/restore")
def backups_restore(body: RestoreIn, request: Request):
    _require_user(request, "operator")
    res = dockerio.restore_agent(body.agent, body.file)
    _audit(request, "backup_restore", body.agent, body.file + (" OK" if res.get("ok") else " FAIL"))
    if not res.get("ok"):
        raise HTTPException(500, res.get("error", "restore failed"))
    return res

# ---------- cron / updates ----------
@app.get("/api/cron")
def cron(request: Request):
    _require_user(request)
    out = {}
    for a in dockerio.fleet():
        if a["status"] == "running":
            out[a["name"]] = dockerio.agent_cron(a["name"])
    return out

@app.get("/api/updates")
def updates(request: Request):
    _require_user(request)
    latest = dockerio.latest_hermes_release()
    agents = []
    for a in dockerio.fleet():
        agents.append({"name": a["name"], "image": a["image"],
                       "image_created": dockerio.image_created(a["image"])})
    return {"latest": latest, "agents": agents}

# ---------- audit ----------
@app.get("/api/audit")
def audit_log(request: Request, limit: int = 100):
    _require_user(request)
    with core.db() as c:
        rows = c.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"audit": [dict(r) for r in rows]}

# ---------- users (admin) ----------
class UserIn(BaseModel):
    username: str
    password: str
    role: str = "operator"

@app.get("/api/users")
def users_list(request: Request):
    _require_user(request, "admin")
    with core.db() as c:
        rows = c.execute("SELECT id, username, role, created_at FROM users ORDER BY id").fetchall()
    return {"users": [dict(r) for r in rows]}

@app.post("/api/users")
def users_create(body: UserIn, request: Request):
    _require_user(request, "admin")
    if body.role not in ("admin", "operator", "readonly"):
        raise HTTPException(400, "bad role")
    if len(body.password) < 8:
        raise HTTPException(400, "password too short")
    if not core.create_user(body.username.strip(), body.password, body.role):
        raise HTTPException(409, "username exists")
    _audit(request, "user_create", body.username, body.role)
    return {"ok": True}

@app.delete("/api/users/{uid}")
def users_delete(uid: int, request: Request):
    s = _require_user(request, "admin")
    if int(uid) == s["user_id"]:
        raise HTTPException(400, "cannot delete yourself")
    core.delete_user(uid)
    _audit(request, "user_delete", str(uid))
    return {"ok": True}

@app.post("/api/users/{uid}/role")
def users_role(uid: int, role: str, request: Request):
    _require_user(request, "admin")
    if role not in ("admin", "operator", "readonly"):
        raise HTTPException(400, "bad role")
    core.set_user_role(uid, role)
    _audit(request, "user_role", str(uid), role)
    return {"ok": True}

@app.post("/api/password")
def change_password(body: dict, request: Request):
    s = _require_user(request)
    old = body.get("old", "")
    new = body.get("new", "")
    if len(new) < 8:
        raise HTTPException(400, "password too short")
    with core.db() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (s["user_id"],)).fetchone()
    if not core.verify_password(old, row["pw_hash"]):
        raise HTTPException(401, "old password wrong")
    with core.db() as c:
        c.execute("UPDATE users SET pw_hash=? WHERE id=?", (core.hash_password(new), s["user_id"]))
    _audit(request, "password_change", s["username"])
    return {"ok": True}

# ---------- registry (admin) ----------
class RegistryIn(BaseModel):
    friendly: str = ""
    color: str = ""

@app.post("/api/registry/{container}")
def registry_set(container: str, body: RegistryIn, request: Request):
    _require_user(request, "admin")
    with core.db() as c:
        c.execute("""INSERT INTO registry(container,friendly,color) VALUES(?,?,?)
                     ON CONFLICT(container) DO UPDATE SET friendly=?, color=?""",
                  (container, body.friendly[:40], body.color[:12], body.friendly[:40], body.color[:12]))
    _audit(request, "registry_set", container, body.friendly)
    return {"ok": True}

# ---------- alerts ----------
@app.get("/api/alerts")
def alerts(request: Request):
    _require_user(request)
    agents = dockerio.fleet()
    down = [{"name": a["name"], "status": a["status"]} for a in agents if a["status"] != "running"]
    return {"down": down}

# ---------- copilot (v4) ----------
class CopilotChatIn(BaseModel):
    message: str
    history: list = []

class CopilotApproveIn(BaseModel):
    run_id: str
    approve: bool
    password: str = ""

_ORIGIN_OK = {"https://ops.42berlinaiclub.de", "http://127.0.0.1:8644", "http://localhost:8644"}

def _origin_ok(request: Request) -> bool:
    site = request.headers.get("sec-fetch-site") or ""
    if site and site in ("same-origin", "none"):
        return True
    origin = request.headers.get("origin") or ""
    if not origin:
        return True  # curl / server-to-server
    return origin in _ORIGIN_OK

def _copilot_guard(request: Request):
    s = _require_user(request, "operator")
    if not _origin_ok(request):
        raise HTTPException(403, "Cross-origin request rejected")
    return s

@app.post("/api/copilot/chat")
def copilot_chat(body: CopilotChatIn, request: Request):
    s = _copilot_guard(request)
    try:
        res = copilot.chat(body.message[:2000], body.history, s["username"])
    except RuntimeError as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        _audit(request, "copilot_error", detail=str(e)[:200])
        raise HTTPException(500, f"Copilot error: {str(e)[:160]}")
    _audit(request, "copilot_chat", detail=body.message[:120])
    return res

@app.post("/api/copilot/approve")
def copilot_approve(body: CopilotApproveIn, request: Request):
    s = _copilot_guard(request)
    res = copilot.approve(body.run_id, body.approve, s["username"], s["role"], body.password)
    return res

@app.get("/api/copilot/pending")
def copilot_pending(request: Request):
    s = _copilot_guard(request)
    return {"pending": copilot.pending_list(s["username"], s["role"])}

@app.post("/api/copilot/stream")
async def copilot_stream(body: CopilotChatIn, request: Request):
    """SSE streaming with JSON fallback. Streams the final answer text as
    word deltas; tool-loop result arrives first, then the text streams."""
    s = _copilot_guard(request)
    try:
        res = copilot.chat(body.message[:2000], body.history, s["username"])
    except RuntimeError as e:
        raise HTTPException(429, str(e))
    except Exception as e:
        _audit(request, "copilot_error", detail=str(e)[:200])
        raise HTTPException(500, f"Copilot error: {str(e)[:160]}")
    _audit(request, "copilot_chat", detail=body.message[:120])

    async def gen():
        async def emit(obj):
            yield f"data: {json.dumps(obj, default=str)}\n\n"
        if res.get("pending"):
            async for ev in emit({"type": "pending", "pending": res["pending"], "tables": res.get("tables", [])}):
                yield ev
            async for ev in emit({"type": "done"}):
                yield ev
            return
        async for ev in emit({"type": "tool_result", "tables": res.get("tables", [])}):
            yield ev
        text = res.get("answer") or ""
        words = text.split(" ")
        for i in range(0, len(words), 3):
            if await request.is_disconnected():
                return
            chunk = " ".join(words[i:i + 3])
            async for ev in emit({"type": "delta", "text": chunk + (" " if i + 3 < len(words) else "")}):
                yield ev
            await asyncio.sleep(0.02)
        async for ev in emit({"type": "done"}):
            yield ev

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ---------- static / health ----------
@app.get("/api/health")
def health():
    return {"ok": True, "time": int(time.time())}

@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache", "Expires": "0",
    })

class _NoCacheStatic(StaticFiles):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._h = {"Cache-Control": "no-cache, no-store, must-revalidate"}
    def file_response(self, *a, **kw):
        resp = super().file_response(*a, **kw)
        resp.headers.update(self._h)
        return resp

app.mount("/static", _NoCacheStatic(directory=str(STATIC)), name="static")

# ---------- metrics background poller ----------
def _metrics_loop():
    while True:
        try:
            hm = hostmetrics.host_metrics()
            agents = dockerio.fleet()
            up = sum(1 for a in agents if a["status"] == "running")
            conts = dockerio.all_containers()
            disk = (hm.get("disk") or [{}])[0]
            with core.db() as c:
                c.execute("""INSERT INTO metrics(ts,cpu,mem_used,mem_total,disk_used,disk_total,
                             load1,load5,load15,containers_up,agents_up)
                             VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                          (int(time.time()), hm.get("cpu_pct"),
                           (hm.get("mem") or {}).get("used"),
                           (hm.get("mem") or {}).get("total"),
                           disk.get("used"), disk.get("total"),
                           hm.get("load1"), hm.get("load5"), hm.get("load15"),
                           sum(1 for c in conts if c["running"]), up))
                c.execute("DELETE FROM metrics WHERE ts<?", (int(time.time()) - 48 * 3600,))
        except Exception:
            pass
        time.sleep(METRICS_INTERVAL)

def _start_poller():
    t = threading.Thread(target=_metrics_loop, daemon=True)
    t.start()

core.init_db()
_start_poller()
