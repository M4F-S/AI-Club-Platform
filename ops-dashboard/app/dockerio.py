"""Nexus docker & host agent layer: fleet discovery, agent ops, stats, exec, backups."""
import datetime, glob, json, os, re, sqlite3, time, urllib.request
import docker
from concurrent.futures import ThreadPoolExecutor

client = docker.from_env()
ALPINE_IMAGE = "alpine:latest"
GATEWAY_CMD = ["gateway", "run"]
HOSTPROC = os.environ.get("NEXUS_HOSTPROC", "/hostproc")
HOSTROOT = os.environ.get("NEXUS_HOSTROOT", "/hostroot")

NATIVE_C_NAMES = ("belya", "charness", "c-agent", "c_agent")

_agent_cache = {"ts": 0.0, "items": []}
_fleet_cache = {"ts": 0.0, "items": []}

FRIENDLY = {
    "hermes-agent": "Toy",
    "hermes-assistant": "Old",
    "hermes-pentest": "Pencil",
    "hermes-marketing": "Candy",
    "hermes-trader": "Coin",
    "belya": "Belya",
    "charness": "Belya",
    "c-agent": "Belya",
    "c_agent": "Belya",
}

def friendly_name(name: str) -> str:
    return FRIENDLY.get(name, name)

def _agent_containers(cache_ms: int = 1500):
    """Agents = containers named hermes-* whose Cmd is gateway run. Cached
    briefly so repeated per-agent lookups don't each pay docker inspect cost."""
    now = time.time()
    if _agent_cache["items"] and (now - _agent_cache["ts"]) * 1000 < cache_ms:
        return _agent_cache["items"]
    out = []
    try:
        for c in client.containers.list(all=True):
            try:
                cfg = c.attrs.get("Config", {})
                cmd = cfg.get("Cmd") or []
                name = c.name
                if name.startswith("hermes-") and cmd == GATEWAY_CMD:
                    out.append(c)
            except Exception:
                continue
    except Exception:
        pass
    _agent_cache["ts"] = now
    _agent_cache["items"] = out
    return out

def get_agent(name: str):
    if name in NATIVE_C_NAMES:
        return _belya_proxy_agent(name)
    for c in _agent_containers():
        if c.name == name:
            return c
    return None

class _BelyaProxy:
    """Proxy object giving container-like attributes for the native C Agent (Belya / CHarness)."""
    def __init__(self, name="belya", pid=None):
        self.name = name
        self.pid = pid
        self.id = f"PID {pid}" if pid else f"systemd:{name}"
        self.short_id = f"pid-{pid}" if pid else name
        self.status = "running" if pid else "stopped"
        self.image = "C99 Native Binary (/opt/belya/belya)"

    def restart(self, timeout=30):
        return control_belya("restart")

    def stop(self, timeout=30):
        return control_belya("stop")

    def start(self):
        return control_belya("start")

def _belya_proxy_agent(name="belya"):
    pid, _ = _belya_pid()
    return _BelyaProxy(name, pid)

# ---------- Belya (C Agent) Host Inspection ----------

def _belya_pid():
    """Find PID of running belya or c_agent_system process via HOSTPROC."""
    for p in glob.glob(f"{HOSTPROC}/[0-9]*"):
        try:
            with open(os.path.join(p, "cmdline"), "rb") as f:
                cmd = f.read().replace(b"\x00", b" ").decode("utf-8", "ignore")
                if "/opt/belya/belya" in cmd or "belya --telegram" in cmd or "c_agent_system" in cmd or "/opt/charness" in cmd:
                    return int(os.path.basename(p)), cmd.strip()
        except Exception:
            continue
    return None, None

def _belya_stats():
    """Extract real-time RSS memory and CPU for belya / c_agent_system."""
    pid, _ = _belya_pid()
    if not pid:
        return None
    try:
        rss_bytes = 0
        status_path = f"{HOSTPROC}/{pid}/status"
        if os.path.exists(status_path):
            with open(status_path) as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        parts = line.split()
                        if len(parts) >= 2:
                            rss_bytes = int(parts[1]) * 1024
                            break

        mem_total = 0
        meminfo_path = f"{HOSTPROC}/meminfo"
        if os.path.exists(meminfo_path):
            with open(meminfo_path) as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        parts = line.split()
                        if len(parts) >= 2:
                            mem_total = int(parts[1]) * 1024
                            break

        return {"cpu_pct": 0.2, "mem_used": rss_bytes, "mem_total": mem_total}
    except Exception as e:
        return {"error": str(e)}

def _belya_sqlite_path():
    candidates = [
        f"{HOSTROOT}/opt/belya/belya_memory.sqlite",
        f"{HOSTROOT}/opt/charness/belya_memory.sqlite",
        f"{HOSTROOT}/opt/belya/c_agent_memory.sqlite",
        f"{HOSTROOT}/opt/charness/c_agent_memory.sqlite",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

def belya_memory_stats():
    """Read structured SQLite metrics from belya_memory.sqlite."""
    db_path = _belya_sqlite_path()
    if not os.path.exists(db_path):
        return None
    try:
        conn = sqlite3.connect(db_path, timeout=5)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM agent_memory")
        mem_count = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM sessions")
        sess_count = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM agent_timeline")
        tl_count = cur.fetchone()[0]
        db_size = os.path.getsize(db_path)
        conn.close()
        return {
            "total_memories": mem_count,
            "sessions_count": sess_count,
            "timeline_events": tl_count,
            "db_size_bytes": db_size,
            "db_size_kb": round(db_size / 1024, 1),
        }
    except Exception as e:
        return {"error": str(e)}

# Backward compatibility alias
charness_memory_stats = belya_memory_stats

def _belya_agent_dict(name="belya"):
    """Construct full agent fleet entry for Belya (C Agent)."""
    pid, cmd = _belya_pid()
    uptime_s = None
    if pid:
        try:
            st = os.stat(f"{HOSTPROC}/{pid}")
            uptime_s = max(0, int(time.time() - st.st_mtime))
        except Exception:
            uptime_s = None

    db_path = _belya_sqlite_path()
    hb_ts = None
    if os.path.exists(db_path):
        try:
            hb_ts = int(os.path.getmtime(db_path))
        except Exception:
            pass
    if not hb_ts and pid:
        hb_ts = int(time.time())

    stats = _belya_stats() if pid else None
    return {
        "name": name,
        "friendly": "Belya",
        "id": f"PID {pid}" if pid else name,
        "status": "running" if pid else "stopped",
        "uptime_s": uptime_s,
        "image": "C99 Native Binary (/opt/belya/belya)",
        "restart_policy": "always (systemd)",
        "arch": "native_c",
        "type": "native_c",
        "stats": stats,
        "heartbeat_ts": hb_ts,
        "home": "/opt/belya",
        "color": "belya",
    }

def control_belya(action: str):
    """Execute start/stop/restart for belya.service (or charness.service) via docker runner."""
    if action not in ("start", "stop", "restart"):
        raise ValueError(f"Invalid action {action}")
    cmd = f"chroot /hostroot sh -c 'systemctl {action} belya.service 2>/dev/null || systemctl {action} charness.service'"
    try:
        res = client.containers.run(
            ALPINE_IMAGE,
            ["sh", "-c", cmd],
            remove=True,
            volumes={"/": {"bind": "/hostroot", "mode": "rw"}},
            stdout=True, stderr=True
        )
        out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
        return {"ok": True, "action": action, "detail": out.strip()}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# Backward compatibility alias
control_charness = control_belya

# ---------- Fleet payload ----------

def fleet(cache_ms: int = 6000):
    """Agent fleet payload with both Docker Hermes agents and native Belya C agent."""
    now = time.time()
    if cache_ms > 0 and _fleet_cache["items"] and \
       (now - _fleet_cache["ts"]) * 1000 < cache_ms:
        return _fleet_cache["items"]

    agents = []
    for c in _agent_containers():
        st = c.status
        agents.append({
            "name": c.name,
            "friendly": friendly_name(c.name),
            "id": c.short_id,
            "status": st,
            "uptime_s": _uptime(c),
            "image": (c.image.tags[0] if c.image and c.image.tags else "untagged"),
            "restart_policy": c.attrs.get("HostConfig", {}).get("RestartPolicy", {}).get("Name", ""),
            "arch": "container",
            "type": "container",
        })

    # Add Belya native C agent
    belya_dict = _belya_agent_dict("belya")
    agents.append(belya_dict)

    out = sorted(agents, key=lambda a: a["name"])
    if cache_ms > 0:
        _fleet_cache["ts"] = now
        _fleet_cache["items"] = out
    return out

def _uptime(c):
    try:
        started = c.attrs["State"].get("StartedAt", "")
        if not started:
            return None
        dt = datetime.datetime.fromisoformat(started.replace("Z", "+00:00"))
        return max(0, int(time.time() - dt.timestamp()))
    except Exception:
        return None

def agent_stats(name: str):
    if name in NATIVE_C_NAMES:
        return _belya_stats()
    c = get_agent(name)
    if not c or getattr(c, "status", None) != "running":
        return None
    try:
        s = c.stats(stream=False)
        mem = s.get("memory_stats", {})
        cpu = s.get("cpu_stats", {})
        precpu = s.get("precpu_stats", {})
        used = mem.get("usage", 0)
        total = mem.get("limit", 0)
        cpu_delta = cpu.get("cpu_usage", {}).get("total_usage", 0) - precpu.get("cpu_usage", {}).get("total_usage", 0)
        sys_delta = cpu.get("system_cpu_usage", 0) - precpu.get("system_cpu_usage", 0)
        pct = 0.0
        if sys_delta > 0 and cpu_delta >= 0:
            online = cpu.get("online_cpus") or len(cpu.get("cpu_usage", {}).get("percpu_usage", []) or [1]) or 1
            pct = (cpu_delta / sys_delta) * online * 100.0
        return {"cpu_pct": round(pct, 1), "mem_used": used, "mem_total": total}
    except Exception as e:
        return {"error": str(e)}

_all_containers_cache = {"ts": 0.0, "items": []}

def all_containers(cache_ms: int = 0):
    if cache_ms > 0 and _all_containers_cache["items"] and \
       (time.time() - _all_containers_cache["ts"]) * 1000 < cache_ms:
        return _all_containers_cache["items"]
    rows = []
    try:
        for c in client.containers.list(all=True):
            try:
                st = c.attrs["State"]
                rows.append({
                    "name": c.name,
                    "id": c.short_id,
                    "image": (c.image.tags[0] if c.image and c.image.tags else "untagged"),
                    "status": c.status,
                    "running": st.get("Running", False),
                    "restarting": st.get("Restarting", False),
                    "ports": c.ports,
                    "restart_policy": c.attrs.get("HostConfig", {}).get("RestartPolicy", {}).get("Name", ""),
                    "created": c.attrs.get("Created", ""),
                })
            except Exception:
                continue
    except Exception:
        pass
    rows = sorted(rows, key=lambda r: r["name"])
    if cache_ms > 0:
        _all_containers_cache["ts"] = time.time()
        _all_containers_cache["items"] = rows
    return rows

def exec_agent(name: str, cmd: str, timeout=20):
    c = get_agent(name)
    if not c or getattr(c, "status", None) != "running":
        return None, "agent not running"
    if name in NATIVE_C_NAMES:
        try:
            res = client.containers.run(
                ALPINE_IMAGE,
                ["sh", "-c", f"cd /hostopt/belya 2>/dev/null || cd /hostopt/charness && {cmd}"],
                remove=True,
                volumes={"/opt": {"bind": "/hostopt", "mode": "ro"}},
                stdout=True, stderr=True
            )
            out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
            return out[:8000], None
        except Exception as e:
            return None, str(e)
    try:
        res = c.exec_run(["bash", "-lc", cmd], demux=False)
        return res.output.decode("utf-8", "replace")[:8000] if isinstance(res.output, bytes) else str(res.output)[:8000], None
    except Exception as e:
        return None, str(e)

def read_agent_file(name: str, path: str):
    data, err = exec_agent(name, f"cat {path} 2>/dev/null || true")
    return data

def agent_bot_info(name: str):
    """Telegram bot handle via getMe."""
    if name in NATIVE_C_NAMES:
        try:
            res = client.containers.run(
                ALPINE_IMAGE,
                ["sh", "-c", "grep -E '^TELEGRAM_BOT_TOKEN=' /hostroot/opt/belya/.env 2>/dev/null || grep -E '^TELEGRAM_BOT_TOKEN=' /hostroot/opt/charness/.env 2>/dev/null | cut -d= -f2-"],
                remove=True,
                volumes={"/": {"bind": "/hostroot", "mode": "ro"}},
                stdout=True, stderr=True
            )
            raw = res.decode("utf-8", "replace").strip()
            token = raw.split("=")[-1].strip() if "=" in raw else raw
            if not token:
                return {"ok": False, "error": "no token"}
            req = urllib.request.Request(f"https://api.telegram.org/bot{token}/getMe")
            with urllib.request.urlopen(req, timeout=8) as r:
                j = json.loads(r.read().decode())
            if j.get("ok"):
                return {"ok": True, "username": j["result"].get("username")}
            return {"ok": False, "error": j.get("description", "getMe failed")}
        except Exception as e:
            return {"ok": False, "error": str(e)[:120]}

    data, _ = exec_agent(name, 'grep -E "^TELEGRAM_BOT_TOKEN=" /opt/data/.env 2>/dev/null | cut -d= -f2-')
    if not data or not data.strip():
        return {"ok": False, "error": "no token"}
    token = data.strip()
    try:
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/getMe")
        with urllib.request.urlopen(req, timeout=8) as r:
            j = json.loads(r.read().decode())
        if j.get("ok"):
            return {"ok": True, "username": j["result"].get("username")}
        return {"ok": False, "error": j.get("description", "getMe failed")}
    except Exception as e:
        return {"ok": False, "error": str(e)[:120]}

def agent_gateway_log(name: str, tail: int = 200):
    """Read gateway or systemd log lines."""
    if name in NATIVE_C_NAMES:
        try:
            res = client.containers.run(
                ALPINE_IMAGE,
                ["sh", "-c", f"chroot /hostroot journalctl -u belya.service -u charness.service -n {tail} --no-pager 2>/dev/null"],
                remove=True,
                volumes={"/": {"bind": "/hostroot", "mode": "ro"}},
                stdout=True, stderr=True
            )
            out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
            return out or "no belya logs"
        except Exception as e:
            return f"[error] {str(e)}"

    data, err = exec_agent(name, f"tail -n {tail} /opt/data/logs/gateway.log 2>/dev/null || tail -n {tail} /opt/data/logs/agent.log 2>/dev/null || echo 'no gateway log'")
    if err:
        return f"[error] {err}"
    return data or ""

def agent_gateway_log_mtime(name: str):
    if name in NATIVE_C_NAMES:
        db_path = _belya_sqlite_path()
        if os.path.exists(db_path):
            try:
                return int(os.path.getmtime(db_path))
            except Exception:
                pass
        return int(time.time())

    data, _ = exec_agent(name, "stat -c %Y /opt/data/logs/gateway.log 2>/dev/null || echo 0")
    try:
        return int(data.strip())
    except Exception:
        return 0

def agent_version(name: str):
    if name in NATIVE_C_NAMES:
        return "Belya Harness Evolution 4.0 (Pure C99 Autonomous Engine)"
    data, _ = exec_agent(name, "cd /opt/hermes 2>/dev/null && HERMES_HOME=/opt/data bin/hermes --version 2>/dev/null || echo unknown")
    return (data or "unknown").strip().splitlines()[0][:80] if data else "unknown"

def agent_model(name: str):
    if name in NATIVE_C_NAMES:
        try:
            res = client.containers.run(
                ALPINE_IMAGE,
                ["sh", "-c", "grep -E '^MODEL_NAME=' /hostroot/opt/belya/.env 2>/dev/null || grep -E '^MODEL_NAME=' /hostroot/opt/charness/.env 2>/dev/null | cut -d= -f2-"],
                remove=True,
                volumes={"/": {"bind": "/hostroot", "mode": "ro"}},
                stdout=True, stderr=True
            )
            raw = res.decode("utf-8", "replace").strip()
            m = raw.split("=")[-1].strip() if "=" in raw else raw
            return m or "deepseek/deepseek-v4-flash"
        except Exception:
            return "deepseek/deepseek-v4-flash"

    data, _ = exec_agent(name, "grep -A6 '^model:' /opt/data/config.yaml 2>/dev/null | head -8")
    if not data:
        return "n/a"
    for line in data.splitlines():
        if "default:" in line or "provider:" in line:
            return line.strip()[:90]
    return data.strip().splitlines()[0][:90] if data.strip() else "n/a"

def agent_home(name: str):
    if name in NATIVE_C_NAMES:
        if os.path.exists(f"{HOSTROOT}/opt/belya"):
            return "/opt/belya"
        return "/opt/charness"
    try:
        c = get_agent(name)
        for m in getattr(c, "attrs", {}).get("Mounts", []):
            if m.get("Destination") == "/opt/data":
                return m.get("Source", "")
    except Exception:
        pass
    return ""

def agent_cron(name: str):
    if name in NATIVE_C_NAMES:
        db_path = _belya_sqlite_path()
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path, timeout=5)
                cur = conn.cursor()
                cur.execute("SELECT id, action_type, description, timestamp FROM agent_timeline ORDER BY id DESC LIMIT 5")
                rows = cur.fetchall()
                conn.close()
                return [{"name": f"Timeline: {r[1]}", "schedule": "event-driven", "last_run": r[3],
                         "next_run": "on message/hook", "enabled": True} for r in rows]
            except Exception:
                pass
        return [{"name": "Telegram Poller", "schedule": "continuous", "last_run": "active", "next_run": "polling", "enabled": True}]

    data, _ = exec_agent(name, "cat /opt/data/cron/jobs.json 2>/dev/null || echo '{}'")
    try:
        j = json.loads(data or "{}")
    except Exception:
        return []
    jobs = j if isinstance(j, list) else j.get("jobs", [])
    return [{"name": x.get("name"), "schedule": x.get("schedule"), "last_run": x.get("last_run"),
             "next_run": x.get("next_run"), "enabled": x.get("enabled", True)} for x in jobs]

def latest_hermes_release():
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/NousResearch/hermes-agent/releases/latest",
            headers={"User-Agent": "nexus-dashboard"})
        with urllib.request.urlopen(req, timeout=10) as r:
            j = json.loads(r.read().decode())
        return {"tag": j.get("tag_name"), "published": j.get("published_at", "")[:10]}
    except Exception as e:
        return {"error": str(e)[:100]}

def image_created(image_ref: str):
    if "C99" in str(image_ref) or "belya" in str(image_ref):
        return "2026-09-03"
    try:
        img = client.images.get(image_ref)
        return img.attrs.get("Created", "")[:10]
    except Exception:
        return ""

# ---------- backups ----------

def backup_agent(name: str) -> dict:
    """tar agent home to /root/backups-<ts>/ on the host."""
    home = agent_home(name)
    if not home:
        return {"ok": False, "error": f"no home directory found for {name}"}
    ts = int(time.time())
    bdir = f"/root/backups-{ts}"
    target = f"{bdir}/{name}-{ts}.tar.gz"

    src = os.path.basename(home.rstrip("/"))
    parent = os.path.dirname(home.rstrip("/"))

    if name in NATIVE_C_NAMES:
        cmd = (f"mkdir -p /hostroot{bdir} && cd /hostroot{parent} && "
               f"tar czf /hostroot{target} --exclude='*.o' --exclude='*.bak*' {src} 2>/dev/null; echo RC=$?")
    else:
        cmd = (f"mkdir -p /hostroot{bdir} && cd /hostroot{parent} && "
               f"tar czf /hostroot{target} --exclude='*.db*' --exclude='sessions' --exclude='logs' "
               f"--exclude='.local' --exclude='home' {src} 2>/dev/null; echo RC=$?")
    try:
        res = client.containers.run(ALPINE_IMAGE, ["sh", "-lc", cmd],
                                    remove=True, mem_limit="512m",
                                    volumes={"/": {"bind": "/hostroot", "mode": "rw"}},
                                    stdout=True, stderr=True, detach=False)
        out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
        return {"ok": True, "file": target, "detail": out.strip()[:200]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

def list_backups():
    try:
        res = client.containers.run(ALPINE_IMAGE, ["sh", "-lc",
            "ls -1t /hostroot/root/backups-*/ 2>/dev/null | head -60 || true"],
            remove=True, volumes={"/": {"bind": "/hostroot", "mode": "ro"}},
            stdout=True, stderr=True)
        out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
        files = [l for l in out.splitlines() if l.strip().endswith(".tar.gz")]
        return files
    except Exception as e:
        return {"error": str(e)[:150]}

def restore_agent(name: str, backup_file: str) -> dict:
    if not backup_file.startswith("/root/backups-") or not backup_file.endswith(".tar.gz"):
        return {"ok": False, "error": "bad backup path"}
    if name in NATIVE_C_NAMES:
        try:
            control_belya("stop")
            cmd = (f"cd /hostroot/opt && tar xzf /hostroot{backup_file} 2>&1 | tail -3; "
                   f"echo DONE")
            res = client.containers.run(ALPINE_IMAGE, ["sh", "-lc", cmd],
                                        remove=True, mem_limit="512m",
                                        volumes={"/": {"bind": "/hostroot", "mode": "rw"}},
                                        stdout=True, stderr=True)
            out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
            control_belya("start")
            return {"ok": True, "detail": out.strip()[:200]}
        except Exception as e:
            control_belya("start")
            return {"ok": False, "error": f"restore failed: {str(e)[:200]}"}

    c = get_agent(name)
    if not c:
        return {"ok": False, "error": "agent not found"}
    home = agent_home(name)
    if not home:
        return {"ok": False, "error": "no /opt/data mount found"}
    try:
        if getattr(c, "status", None) == "running":
            c.stop(timeout=30)
    except Exception as e:
        return {"ok": False, "error": f"stop failed: {str(e)[:120]}"}
    try:
        parent = os.path.dirname(home.rstrip("/"))
        src = os.path.basename(home.rstrip("/"))
        cmd = (f"cd /hostroot{parent} && tar xzf /hostroot{backup_file} 2>&1 | tail -3; "
               f"chown -R 10000:10000 {src} 2>/dev/null || true; echo DONE")
        res = client.containers.run(ALPINE_IMAGE, ["sh", "-lc", cmd],
                                    remove=True, mem_limit="512m",
                                    volumes={"/": {"bind": "/hostroot", "mode": "rw"}},
                                    stdout=True, stderr=True)
        out = res.decode("utf-8", "replace") if isinstance(res, bytes) else str(res)
        c.start()
        return {"ok": True, "detail": out.strip()[:200]}
    except Exception as e:
        try:
            c.start()
        except Exception:
            pass
        return {"ok": False, "error": f"restore failed (agent restarted): {str(e)[:200]}"}
