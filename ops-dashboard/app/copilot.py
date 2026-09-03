"""Nexus Copilot (v4) — hardened ops copilot.

Changes vs v3 (from gpt-5.6-sol security review 2026-08-17):
- Approvals moved from in-memory dict → SQLite (copilot_pending), survive restarts,
  TTL enforced atomically inside the claim (single writer lock via core.db()).
- Ownership enforced: only the creating user (or admin) may approve.
- Atomic claim: row SELECT+expiry-check+DELETE inside one locked transaction —
  concurrent double-approve executes exactly once.
- ok:False + error on raised actions (no more false success); denied/expired/reauth
  all audited.
- Run IDs are secrets.token_urlsafe(16) (128 bits).
- Agent names enum-validated (AGENTS) before any docker op.
- docker_prune is IMAGES-ONLY (volumes.prune() removed — data safety).
- Host-level actions require password re-auth (reauth flag; verified server-side).
- Rate limit per operator (10 chats/min) + cost/token accounting in copilot_usage.
- Timestamp+TZ injected into the system prompt; guardrails hardened.
- New READ tools: host disk, docker stats, caddy cert status, audit log, github state.
- New ACTION tools: vps_restart_service (caddy only), vps_reload_caddy — both
  reauth-gated. CUT per review: host_shell, vps_reboot, apt-in-chat.
- Post-approval synthesis: one small LLM pass explains the action result.
- Results include structured tables for the frontend (mini-tables, escaped client-side).
- MAX_ITERS 6→4; tool results truncated to 4000 chars.
"""
import datetime, json, os, secrets, socket, ssl, time, urllib.request
from collections import deque

from . import core, dockerio, metrics as hostmetrics

MODEL = os.environ.get("NEXUS_COPILOT_MODEL", "deepseek-v4-flash")
BASE_URL = os.environ.get("NEXUS_COPILOT_BASE_URL", "https://opencode.ai/zen/go/v1")
MAX_ITERS = 4
APPROVAL_TTL = 600            # 10 minutes
CHAT_RATE_LIMIT = 10          # chats / minute / operator
HOST_REAUTH_TOOLS = {"vps_restart_service", "vps_reload_caddy"}

AGENTS = ("hermes-agent", "hermes-assistant", "hermes-pentest", "hermes-marketing", "hermes-trader", "belya", "charness")
SERVICES = {"sophia-caddy"}    # the Caddy container (label stays "caddy" für users)
GH_OWNER = "M4F-S"
DOCKER = dockerio.client

# per-user chat timestamps (single-process; guarded by core.LOCK)
_chat_times = {}


def _key():
    k = os.environ.get("OPENCODE_GO_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
    if not k:
        raise RuntimeError("no copilot API key configured (OPENCODE_GO_API_KEY/OPENROUTER_API_KEY)")
    return k


def _log_usage(user, run_type, status, usage=None):
    try:
        pt = int((usage or {}).get("prompt_tokens") or 0)
        ct = int((usage or {}).get("completion_tokens") or 0)
        # rough cost: $0.25/M prompt, $0.75/M completion for v4-flash class
        cost = (pt * 0.25 + ct * 0.75) / 1_000_000
        with core.db() as c:
            c.execute("INSERT INTO copilot_usage(ts,user,run_type,status,prompt_tokens,completion_tokens,cost_us) "
                      "VALUES(?,?,?,?,?,?,?)",
                      (int(time.time()), user, run_type, status, pt, ct, cost))
    except Exception:
        pass


def _llm(messages, tools, max_tokens=1500):
    body = {"model": MODEL, "messages": messages, "tools": tools,
            "tool_choice": "auto", "max_tokens": max_tokens,
            "temperature": 0.2}
    req = urllib.request.Request(
        BASE_URL.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {_key()}", "Content-Type": "application/json",
                 "User-Agent": "nexus-dashboard/1.0"},
        method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read().decode())
    return j["choices"][0]["message"], j.get("usage") or {}


def rate_limit_hit(username: str) -> bool:
    now = time.time()
    with core.LOCK:
        q = _chat_times.setdefault(username, deque())
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= CHAT_RATE_LIMIT:
            return True
        q.append(now)
        return False


def _validate_agent(name):
    if not isinstance(name, str) or name not in AGENTS:
        raise ValueError(f"unknown agent '{name}' (must be one of {', '.join(AGENTS)})")


def _host_run(cmd, timeout=25, read_only=True):
    """Run a fixed-command container against the host filesystem (RO mount).
    The HOST-GATEKEEPER pattern from review: no SSH key, no free argv beyond the
    caller, no docker/apt inside — read-only host FS via docker.sock only."""
    try:
        c = DOCKER.containers.run(
            "alpine:latest", ["sh", "-c", cmd], detach=True,
            volumes={"/": {"bind": "/hostroot", "mode": "ro" if read_only else "rw"}},
            network_disabled=True, mem_limit="128m", pids_limit=64,
            read_only=True, tmpfs={"/tmp": "size=8m"})
        try:
            rc = c.wait(timeout=timeout)
            out = c.logs().decode("utf-8", "replace").strip()[:4000]
            return out, None
        except Exception as e:
            c.remove(force=True)
            return None, str(e)
        finally:
            try:
                c.remove(force=True)
            except Exception:
                pass
    except Exception as e:
        return None, str(e)[:200]


def _exec_in(container, argv, timeout=15):
    try:
        c = DOCKER.containers.get(container)
        r = c.exec_run(argv, demux=False)
        out = r.output.decode("utf-8", "replace") if isinstance(r.output, bytes) else str(r.output)
        return out.strip()[:3000], (None if r.exit_code == 0 else r.exit_code)
    except Exception as e:
        return None, str(e)[:200]


# ================= READ TOOLS (inline, no state change) =================
def _t_fleet(args):
    agents = dockerio.fleet()
    out = []
    for a in agents:
        st = dockerio.agent_stats(a["name"]) if a["status"] == "running" else None
        out.append({"name": a["name"], "status": a["status"], "uptime_s": a["uptime_s"],
                    "heartbeat_ts": dockerio.agent_gateway_log_mtime(a["name"]) if a["status"] == "running" else None,
                    "cpu_pct": (st or {}).get("cpu_pct"), "mem_used": (st or {}).get("mem_used"),
                    "mem_total": (st or {}).get("mem_total")})
    return {"agents": out}


def _t_agent(args):
    name = str(args.get("agent", ""))
    _validate_agent(name)
    c = dockerio.get_agent(name)
    if not c:
        return {"error": "agent not found"}
    return {"name": c.name, "status": c.status,
            "version": dockerio.agent_version(name) if c.status == "running" else None,
            "model": dockerio.agent_model(name) if c.status == "running" else None,
            "bot": dockerio.agent_bot_info(name) if c.status == "running" else None,
            "cron_count": len(dockerio.agent_cron(name)) if c.status == "running" else 0,
            "home": dockerio.agent_home(name)}


def _t_logs(args):
    name = str(args.get("agent", ""))
    _validate_agent(name)
    tail = min(int(args.get("tail", 40)), 300)
    data = dockerio.agent_gateway_log(name, tail)
    return {"agent": name, "lines": (data or "").splitlines()[-tail:]}


def _t_metrics(args):
    hm = hostmetrics.host_metrics()
    agents = dockerio.fleet()
    up = sum(1 for a in agents if a["status"] == "running")
    return {"host": {"cpu_pct": hm.get("cpu_pct"), "mem_pct": (hm.get("mem") or {}).get("pct"),
                     "load": hm.get("load"), "disk": hm.get("disk"),
                     "uptime_s": hm.get("uptime_s")},
            "agents_up": up, "agents_total": len(agents)}


def _t_containers(args):
    return dockerio.all_containers()


def _t_cron(args):
    out = {}
    for a in dockerio.fleet():
        if a["status"] == "running":
            out[a["name"]] = dockerio.agent_cron(a["name"])
    return out


def _t_backups(args):
    return dockerio.list_backups()


def _t_versions(args):
    return {"latest": dockerio.latest_hermes_release(),
            "agents": [{"name": a["name"], "image": a["image"]} for a in dockerio.fleet()]}


def _t_host_disk(args):
    out, err = _host_run("df -h /hostroot | tail -n +2; echo ---; du -sh /hostroot/root/.hermes /hostroot/opt/hermes-assistant /hostroot/opt/data 2>/dev/null | sort -rh | head -6")
    if err:
        return {"error": err}
    return {"df": out}


def _t_docker_stats(args):
    try:
        conts = DOCKER.containers.list()
        rows = []
        for c in conts[:14]:
            try:
                s = c.stats(stream=False)
                if not isinstance(s, dict) and hasattr(s, "__next__"):
                    s = next(s)
                if not isinstance(s, dict) and isinstance(s, (list, tuple)) and s:
                    s = dict(s[0])
                cpu = s.get("cpu_stats", {}).get("cpu_usage", {})
                pcu = s.get("precpu_stats", {}).get("cpu_usage", {})
                sysu = s.get("cpu_stats", {}).get("system_cpu_usage") or 0
                psys = s.get("precpu_stats", {}).get("system_cpu_usage") or 0
                online = s.get("cpu_stats", {}).get("online_cpus") or 1
                dt = sysu - psys
                cpu_pct = (cpu.get("total_usage", 0) - pcu.get("total_usage", 0)) / dt * online * 100 if dt > 0 else 0
                mem = s.get("memory_stats", {})
                mem_pct = mem.get("usage", 0) / mem.get("limit", 1) * 100 if mem.get("limit") else 0
                rows.append({"name": c.name, "cpu_pct": round(cpu_pct, 1),
                             "mem_pct": round(mem_pct, 1), "status": c.status})
            except Exception:
                continue
        rows.sort(key=lambda r: r["cpu_pct"], reverse=True)
        return {"containers": rows[:10]}
    except Exception as e:
        return {"error": str(e)[:200]}


def _t_caddy_cert(args):
    out = {}
    for host in ("ops.42berlinaiclub.de", "42berlinaiclub.de"):
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((host, 443), timeout=6) as sock:
                with ctx.wrap_socket(sock, server_hostname=host) as tls:
                    cert = tls.getpeercert()
            not_after = datetime.datetime.strptime(str(cert["notAfter"]), "%b %d %H:%M:%S %Y %Z")
            days = (not_after - datetime.datetime.utcnow()).days
            out[host] = {"expires": not_after.strftime("%Y-%m-%d"), "days_left": days}
        except Exception as e:
            out[host] = {"error": str(e)[:120]}
    tgt = "sophia-caddy"
    try:
        c = DOCKER.containers.get(tgt)
        out["caddy_container"] = {"status": c.status}
    except Exception as e:
        out["caddy_container"] = {"error": str(e)[:120]}
    return out


def _t_audit(args):
    limit = min(int(args.get("limit", 20)), 100)
    with core.db() as c:
        rows = c.execute("SELECT ts,user,action,target,detail FROM audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"entries": [{"ts": r["ts"], "user": r["user"], "action": r["action"],
                         "target": r["target"], "detail": (r["detail"] or "")[:160]} for r in rows]}


def _t_github(args):
    headers = {"User-Agent": "nexus-dashboard/1.0", "Accept": "application/vnd.github+json"}
    tok = os.environ.get("GH_TOKEN") or (open("/app/.gh_token").read().strip() if os.path.exists("/app/.gh_token") else None)
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    out = {"repos": []}
    # fine-grained PAT has per-repo scope (cannot list orgs) → query known repos
    for repo in ("Apobase", "nexus-dashboard", "old-vault"):
        try:
            req = urllib.request.Request(f"https://api.github.com/repos/{GH_OWNER}/{repo}",
                                         headers=headers)
            with urllib.request.urlopen(req, timeout=8) as r:
                rp = json.loads(r.read().decode())
            out["repos"].append({"name": rp.get("name"), "pushed_at": rp.get("pushed_at"),
                                 "private": rp.get("private"), "open_issues": rp.get("open_issues_count")})
        except Exception as e:
            out["repos"].append({"name": repo, "error": str(e)[:80]})
    return out


# ================= ACTION TOOLS (approval-gated, audited) =================
def _a_restart(args):
    name = str(args.get("agent", ""))
    _validate_agent(name)
    c = dockerio.get_agent(name)
    if not c:
        return {"error": "agent not found"}
    c.restart(timeout=30)
    return {"ok": True, "action": "restart", "agent": name}


def _a_stop(args):
    name = str(args.get("agent", ""))
    _validate_agent(name)
    c = dockerio.get_agent(name)
    if not c:
        return {"error": "agent not found"}
    c.stop(timeout=30)
    return {"ok": True, "action": "stop", "agent": name}


def _a_start(args):
    name = str(args.get("agent", ""))
    _validate_agent(name)
    c = dockerio.get_agent(name)
    if not c:
        return {"error": "agent not found"}
    c.start()
    return {"ok": True, "action": "start", "agent": name}


def _a_backup(args):
    name = str(args.get("agent", ""))
    _validate_agent(name)
    return dockerio.backup_agent(name)


def _a_prune(args):
    """IMAGES-ONLY per review — volumes.prune() removed (data safety)."""
    r1 = DOCKER.images.prune(filters={"dangling": True})
    return {"images_reclaimed": r1.get("SpaceReclaimed", 0),
            "images_deleted": len(r1.get("ImagesDeleted") or [])}


def _a_restart_service(args):
    svc = str(args.get("service", ""))
    if svc == "caddy":
        svc = "sophia-caddy"
    if svc not in SERVICES:
        raise ValueError(f"service must be one of: {', '.join(sorted(SERVICES))}")
    c = DOCKER.containers.get(svc)
    c.restart(timeout=30)
    return {"ok": True, "action": "restart_service", "service": svc, "status": c.status}


def _a_reload_caddy(args):
    """validate-then-reload inside the caddy container (docker exec, no host ssh)."""
    out, err = _exec_in("sophia-caddy", ["caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"])
    if err:
        return {"error": f"config invalid: {out or err}"}
    out2, err2 = _exec_in("sophia-caddy", ["caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"])
    if err2:
        return {"error": f"reload failed: {out2 or err2}"}
    return {"ok": True, "action": "reload_caddy", "validate": "ok", "reload": out2 or "ok"}


# ================= tool registry + schema =================
READ_TOOLS = {
    "get_fleet_status": _t_fleet, "get_agent_info": _t_agent, "get_agent_logs": _t_logs,
    "get_host_metrics": _t_metrics, "get_containers": _t_containers,
    "get_cron_jobs": _t_cron, "get_backups": _t_backups, "get_versions": _t_versions,
    "get_host_disk": _t_host_disk, "get_docker_stats": _t_docker_stats,
    "get_caddy_status": _t_caddy_cert, "get_audit_log": _t_audit, "get_github_state": _t_github,
}
ACTION_TOOLS = {
    "restart_agent": _a_restart, "stop_agent": _a_stop, "start_agent": _a_start,
    "run_backup": _a_backup, "docker_prune": _a_prune,
    "vps_restart_service": _a_restart_service, "vps_reload_caddy": _a_reload_caddy,
}

AGENT_ENUM = {"type": "string", "enum": list(AGENTS), "description": "agent container name"}


def _fn(name, desc, params, required=()):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": params, "required": list(required)}}}


def _tools_schema():
    return [
        _fn("get_fleet_status", "List all Hermes agent containers: status, uptime, heartbeat, per-agent CPU/mem when running.", {}),
        _fn("get_agent_info", "Details for one agent: version, model, telegram bot, cron count, home.", {"agent": AGENT_ENUM}, ["agent"]),
        _fn("get_agent_logs", "Tail the gateway log of an agent (look for crash reasons).", {"agent": AGENT_ENUM, "tail": {"type": "integer", "description": "lines, default 40"}}, ["agent"]),
        _fn("get_host_metrics", "VPS CPU/RAM/disk/load/uptime and agent up counts.", {}),
        _fn("get_containers", "List all Docker containers with status and restart policy.", {}),
        _fn("get_cron_jobs", "List cron jobs per agent.", {}),
        _fn("get_backups", "List backup files on the host.", {}),
        _fn("get_versions", "Hermes latest release vs running agent images.", {}),
        _fn("get_host_disk", "Host disk usage: df -h and top directories.", {}),
        _fn("get_docker_stats", "Live Docker CPU/mem stats for running containers (top 10 by CPU).", {}),
        _fn("get_caddy_status", "Caddy HTTPS cert expiry for dashboard domains + caddy container status.", {}),
        _fn("get_audit_log", "Recent dashboard audit entries.", {"limit": {"type": "integer", "description": "default 20"}}),
        _fn("get_github_state", "GitHub org repos with last push dates.", {}),
        _fn("restart_agent", "Restart an agent container. STATE-CHANGING — requires user approval.", {"agent": AGENT_ENUM}, ["agent"]),
        _fn("stop_agent", "Stop an agent container. STATE-CHANGING — requires user approval.", {"agent": AGENT_ENUM}, ["agent"]),
        _fn("start_agent", "Start an agent container (e.g. fix after offline). STATE-CHANGING — requires user approval.", {"agent": AGENT_ENUM}, ["agent"]),
        _fn("run_backup", "Back up an agent home to /root/backups-<ts>/ on the host. STATE-CHANGING — requires approval.", {"agent": AGENT_ENUM}, ["agent"]),
        _fn("docker_prune", "Prune DANGLING IMAGES only (never volumes). STATE-CHANGING — requires approval.", {}),
        _fn("vps_restart_service", "Restart a non-agent service container (only 'caddy'). STATE-CHANGING — approval + password re-auth.", {"service": {"type": "string", "enum": ["caddy"]}}, ["service"]),
        _fn("vps_reload_caddy", "Validate Caddyfile then reload caddy. STATE-CHANGING — approval + password re-auth.", {}),
    ]


TOOLS = _tools_schema()


def _system_prompt():
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=2)))
    return (
        "You are Flower, the ops copilot for the Nexus dashboard on a multi-agent VPS. "
        f"Current time: {now.strftime('%Y-%m-%d %H:%M')} Europe/Berlin (UTC+2). "
        "The active fleet includes Hermes containerized agents (Toy, Old, Pencil, Candy, Coin) and the native C99 Autonomous Agent (CHarness at /opt/charness). "
        "READ tools (status/logs/metrics/containers/cron/backups/versions/disk/docker-stats/caddy/audit/github) "
        "run automatically — use them freely to ground every answer. "
        "ACTION tools (restart/stop/start/backup/prune/vps_restart_service/vps_reload_caddy) NEVER run inline: "
        "call the tool and the system will ask the user for approval. "
        "Guardrails: never claim you executed an action you did not run; never reveal keys, tokens, env or .env "
        "material; never invent data — if a tool fails, say so; prefer read tools; max 3 action approvals per run. "
        "Be concise. Answer in the user's language. For an offline agent, suggest 'fix <agent>' phrasing and "
        "diagnose before proposing any action."
    )


def _make_pending(tool, args, username, label):
    rid = secrets.token_urlsafe(16)
    with core.db() as c:
        c.execute("INSERT INTO copilot_pending(run_id,tool,args,user,ts,label,reauth) VALUES(?,?,?,?,?,?,?)",
                  (rid, tool, json.dumps(args)[:2000], username, int(time.time()), label,
                   1 if tool in HOST_REAUTH_TOOLS else 0))
    return {"run_id": rid, "tool": tool, "args": args, "label": label,
            "expires_at": int(time.time()) + APPROVAL_TTL, "reauth": tool in HOST_REAUTH_TOOLS}


def _label(fname, fargs):
    names = {"restart_agent": "Restart agent", "stop_agent": "Stop agent",
             "start_agent": "Start agent", "run_backup": "Back up agent",
             "docker_prune": "Docker prune (images only)",
             "vps_restart_service": "Restart service", "vps_reload_caddy": "Reload Caddy"}
    target = fargs.get("agent") or fargs.get("service", "")
    return f"{names.get(fname, fname)} {target}".strip()


# ================= chat loop =================
def chat(user_message: str, history: list, username: str) -> dict:
    if rate_limit_hit(username):
        raise RuntimeError("rate limited (10 chats/min) — slow down")
    messages = [{"role": "system", "content": _system_prompt()}]
    messages.extend(history[-10:] if history else [])
    messages.append({"role": "user", "content": user_message})
    last_read = None
    for _ in range(MAX_ITERS):
        msg, usage = _llm(messages, TOOLS)
        _log_usage(username, "chat", "ok", usage)
        if not msg.get("tool_calls"):
            return {"answer": msg.get("content", ""), "pending": None,
                    "tables": _tables_from(last_read) if last_read else []}
        results = []
        for tc in msg["tool_calls"]:
            try:
                fname = tc["function"]["name"]
                fargs = json.loads(tc["function"].get("arguments") or "{}")
            except Exception:
                fname, fargs = "?", {}
            if fname in ACTION_TOOLS:
                pending = _make_pending(fname, fargs, username, _label(fname, fargs))
                return {"answer": None, "pending": pending,
                        "tables": _tables_from(last_read) if last_read else []}
            if fname in READ_TOOLS:
                try:
                    res = READ_TOOLS[fname](fargs)
                except Exception as e:
                    res = {"error": str(e)[:200]}
                last_read = (fname, fargs, res)
                results.append({"tool_call_id": tc["id"], "role": "tool",
                                "content": json.dumps(res, default=str)[:4000]})
            else:
                results.append({"tool_call_id": tc["id"], "role": "tool",
                                "content": json.dumps({"error": "unknown tool"})})
        messages.append(msg)
        messages.extend(results)
    return {"answer": "I could not complete that in one pass. Try rephrasing.", "pending": None,
            "tables": _tables_from(last_read) if last_read else []}


def approve(run_id: str, approve_ok: bool, username: str, role: str, password: str = "") -> dict:
    with core.db() as c:
        row = c.execute("SELECT * FROM copilot_pending WHERE run_id=?", (run_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "approval not found or already resolved"}
        if row["user"] != username and role != "admin":
            return {"ok": False, "error": "this approval belongs to another user"}
        expired = int(time.time()) - row["ts"] > APPROVAL_TTL
        c.execute("DELETE FROM copilot_pending WHERE run_id=?", (run_id,))
        info = (row["tool"], row["args"], row["label"], bool(row["reauth"]), expired)
        # NOTE: nothing that re-enters core.db() may run inside this with-block
        # (core.db() uses a non-reentrant LOCK → deadlock)
    tool, args_s, label, want_reauth, expired = info
    if expired:
        core.audit(username, "copilot_expired", tool, args_s[:200])
        return {"ok": False, "error": "approval expired"}
    args = json.loads(args_s)
    if not approve_ok:
        core.audit(username, "copilot_denied", tool, args_s[:300])
        return {"ok": False, "denied": True, "tool": tool, "label": label}
    if want_reauth:
        u = core.get_user(username)
        if not u or not core.verify_password(password or "", u["pw_hash"]):
            core.audit(username, "copilot_reauth_failed", tool, args_s[:300])
            return {"ok": False, "error": "re-authentication failed (wrong password)"}
    fn = ACTION_TOOLS.get(tool)
    if not fn:
        return {"ok": False, "error": "unknown tool"}
    try:
        res = fn(args)
    except Exception as e:
        core.audit(username, "copilot_action", tool, args_s[:300] + " → FAILED")
        _log_usage(username, "action", "failed")
        return {"ok": False, "error": str(e)[:200], "tool": tool, "label": label}
    core.audit(username, "copilot_action", tool, args_s[:300] + " → " + json.dumps(res, default=str)[:300])
    summary = _synthesize(tool, args, res, username)
    return {"ok": True, "tool": tool, "result": res, "label": label, "summary": summary}


def _synthesize(tool, args, res, username) -> str | None:
    try:
        msg, usage = _llm([
            {"role": "system", "content": "You summarize ops action results for a dashboard. 2-3 short human lines, no JSON, no markdown headers."},
            {"role": "user", "content": f"Action {tool} args={json.dumps(args)} result={json.dumps(res, default=str)[:1500]}. Summarize what happened."},
        ], [], max_tokens=300)
        _log_usage(username, "synthesis", "ok", usage)
        return (msg.get("content") or "").strip()[:600] or None
    except Exception:
        return None


# ================= mini-tables =================
def _tables_from(last_read):
    if not last_read:
        return []
    fname, fargs, res = last_read
    try:
        if fname == "get_fleet_status":
            return [{"title": "Fleet", "columns": ["Agent", "Status", "Uptime(s)", "CPU%", "Mem%"],
                     "rows": [[a.get("name"), a.get("status"), a.get("uptime_s"),
                               _pct(a.get("cpu_pct")), _pct(a.get("mem_used"), a.get("mem_total"))]
                              for a in (res.get("agents") or [])]}]
        if fname == "get_docker_stats":
            return [{"title": "Docker stats", "columns": ["Container", "CPU%", "Mem%", "Status"],
                     "rows": [[c.get("name"), c.get("cpu_pct"), c.get("mem_pct"), c.get("status")]
                              for c in (res.get("containers") or [])]}]
        if fname == "get_containers":
            rows = []
            for c in (res or [])[:14]:
                if isinstance(c, dict):
                    rows.append([c.get("name"), c.get("status", c.get("state")), c.get("image", "").split("/")[-1][:28]])
            return [{"title": "Containers", "columns": ["Name", "Status", "Image"], "rows": rows}]
        if fname == "get_cron_jobs":
            rows = []
            for agent, jobs in (res or {}).items():
                for j in (jobs or [])[:6]:
                    if isinstance(j, dict):
                        rows.append([agent, str(j.get("id"))[:10], j.get("schedule", j.get("name", ""))])
            return [{"title": "Cron", "columns": ["Agent", "ID", "Schedule"], "rows": rows[:12]}]
        if fname == "get_host_metrics":
            h = res.get("host") or {}
            return [{"title": "Host", "columns": ["Metric", "Value"],
                     "rows": [["CPU%", h.get("cpu_pct")], ["Mem%", h.get("mem_pct")],
                              ["Load", h.get("load")], ["Uptime(s)", h.get("uptime_s")],
                              ["Agents up", f"{res.get('agents_up')}/{res.get('agents_total')}"]]}]
        if fname == "get_caddy_status":
            rows = []
            for host, v in res.items():
                if isinstance(v, dict):
                    rows.append([host, v.get("days_left") if "days_left" in v else v, v.get("expires", "")])
            return [{"title": "Caddy/SSL", "columns": ["Target", "Days left", "Expires"], "rows": rows}]
        if fname == "get_audit_log":
            return [{"title": "Audit", "columns": ["Time", "User", "Action"],
                     "rows": [[e.get("ts"), e.get("user"), e.get("action")] for e in (res.get("entries") or [])[:10]]}]
    except Exception:
        return []
    return []


def _pct(v, total=None):
    if v is None:
        return "—"
    if total:
        try:
            return f"{round(float(v) / float(total) * 100)}%"
        except Exception:
            return str(v)
    return f"{round(float(v))}%"


# ================= pending list for the drawer =================
def pending_list(username: str, role: str) -> list:
    with core.db() as c:
        rows = c.execute("SELECT run_id,tool,args,user,ts,label,reauth FROM copilot_pending "
                         "WHERE ts > ? ORDER BY ts DESC LIMIT 20", (int(time.time()) - APPROVAL_TTL,)).fetchall()
    out = []
    for r in rows:
        if r["user"] != username and role != "admin":
            continue
        out.append({"run_id": r["run_id"], "tool": r["tool"], "label": r["label"],
                    "user": r["user"], "created_at": r["ts"],
                    "expires_at": r["ts"] + APPROVAL_TTL,
                    "reauth": bool(r["reauth"]),
                    "args": json.loads(r["args"])})
    return out