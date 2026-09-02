"""Nexus host metrics: CPU/RAM/disk/load from /hostproc + /hostroot (ro mounts)."""
import os, re, time

HOSTPROC = os.environ.get("NEXUS_HOSTPROC", "/hostproc")
HOSTROOT = os.environ.get("NEXUS_HOSTROOT", "/hostroot")

def _read(path):
    try:
        with open(path) as f:
            return f.read()
    except Exception:
        return ""

def host_cpu():
    """Percent CPU, averaged over ~2.4s to smooth spikes."""
    m1 = _parse_stat()
    time.sleep(0.6)
    m2 = _parse_stat()
    time.sleep(0.6)
    m3 = _parse_stat()
    time.sleep(0.6)
    m4 = _parse_stat()
    time.sleep(0.6)
    m5 = _parse_stat()
    if not m1 or not m5:
        return None
    idle_d = (m5["idle"] - m1["idle"])
    total_d = (m5["total"] - m1["total"])
    if total_d <= 0:
        return None
    return round(100.0 * (1 - idle_d / total_d), 1)

def _parse_stat():
    data = _read(os.path.join(HOSTPROC, "stat"))
    for line in data.splitlines():
        if line.startswith("cpu "):
            parts = line.split()[1:]
            vals = [int(x) for x in parts[:8]]
            idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
            return {"idle": idle, "total": sum(vals)}
    return None

def host_mem():
    data = _read(os.path.join(HOSTPROC, "meminfo"))
    out = {}
    for line in data.splitlines():
        for key in ("MemTotal", "MemAvailable"):
            if line.startswith(key + ":"):
                out[key] = int(re.sub(r"\D", "", line)) * 1024  # kB -> B
    if "MemTotal" not in out:
        return None
    used = out["MemTotal"] - out.get("MemAvailable", out["MemTotal"])
    return {"used": used, "total": out["MemTotal"], "pct": round(100.0 * used / out["MemTotal"], 1)}

def host_load():
    data = _read(os.path.join(HOSTPROC, "loadavg"))
    parts = data.split()
    if len(parts) < 3:
        return None
    return [float(x) for x in parts[:3]]

def host_uptime():
    data = _read(os.path.join(HOSTPROC, "uptime"))
    try:
        return int(float(data.split()[0]))
    except Exception:
        return None

def host_disk():
    """statvfs on host root + /opt if present (ro mount)."""
    try:
        st = os.statvfs(HOSTROOT)
        total = st.f_frsize * st.f_blocks
        free = st.f_frsize * st.f_bavail
        used = total - free
        mounts = [{"path": "/", "used": used, "total": total,
                   "pct": round(100.0 * used / total, 1) if total else 0}]
        opt = os.path.join(HOSTROOT, "opt")
        if os.path.isdir(opt):
            st2 = os.statvfs(opt)
            t2 = st2.f_frsize * st2.f_blocks
            f2 = st2.f_frsize * st2.f_bavail
            u2 = t2 - f2
            mounts.append({"path": "/opt", "used": u2, "total": t2,
                           "pct": round(100.0 * u2 / t2, 1) if t2 else 0})
        return mounts
    except Exception:
        return None

def host_metrics():
    cpu = host_cpu()
    mem = host_mem()
    load = host_load()
    return {
        "cpu_pct": cpu,
        "mem": mem,
        "load": load,
        "load1": load[0] if load else None,
        "load5": load[1] if load else None,
        "load15": load[2] if load else None,
        "uptime_s": host_uptime(),
        "disk": host_disk(),
    }
