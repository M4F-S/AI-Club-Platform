"""Nexus core: SQLite state, security (PBKDF2), sessions, audit, rate limiting."""
import hashlib, hmac, os, secrets, sqlite3, threading, time
from contextlib import contextmanager

DATA_DIR = os.environ.get("NEXUS_DATA", "/data")
DB_PATH = os.path.join(DATA_DIR, "nexus.db")
SECURE_COOKIE = os.environ.get("NEXUS_SECURE_COOKIE", "0") == "1"
SESSION_TTL = 7 * 24 * 3600
LOCK = threading.Lock()

def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with _connect() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            pw_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions(
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            user TEXT NOT NULL,
            action TEXT NOT NULL,
            target TEXT,
            detail TEXT
        );
        CREATE TABLE IF NOT EXISTS login_attempts(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            ts INTEGER NOT NULL,
            ok INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS metrics(
            ts INTEGER NOT NULL,
            cpu REAL, mem_used REAL, mem_total REAL,
            disk_used REAL, disk_total REAL, load1 REAL, load5 REAL, load15 REAL,
            containers_up INTEGER, agents_up INTEGER
        );
        CREATE TABLE IF NOT EXISTS registry(
            container TEXT PRIMARY KEY,
            friendly TEXT,
            color TEXT
        );
        CREATE TABLE IF NOT EXISTS copilot_pending(
            run_id TEXT PRIMARY KEY,
            tool TEXT NOT NULL,
            args TEXT NOT NULL,
            user TEXT NOT NULL,
            ts INTEGER NOT NULL,
            label TEXT NOT NULL,
            reauth INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS copilot_usage(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            user TEXT NOT NULL,
            run_type TEXT NOT NULL,
            status TEXT NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            cost_us REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS settings(
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
        CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts);
        """)

@contextmanager
def db():
    with LOCK:
        conn = _connect()
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

# ---------- passwords ----------
def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 210_000)
    return f"pbkdf2${salt.hex()}${dk.hex()}"

def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt_hex, dk_hex = stored.split("$")
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 210_000)
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False

# ---------- users / sessions ----------
def get_user(username: str):
    with db() as c:
        return c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()

def get_user_by_id(uid: int):
    with db() as c:
        return c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()

def create_user(username: str, pw: str, role: str = "operator") -> bool:
    with db() as c:
        try:
            c.execute("INSERT INTO users(username,pw_hash,role,created_at) VALUES(?,?,?,?)",
                      (username, hash_password(pw), role, int(time.time())))
            return True
        except sqlite3.IntegrityError:
            return False

def set_user_role(uid: int, role: str):
    with db() as c:
        c.execute("UPDATE users SET role=? WHERE id=?", (role, uid))

def delete_user(uid: int):
    with db() as c:
        c.execute("DELETE FROM users WHERE id=?", (uid,))

def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with db() as c:
        c.execute("DELETE FROM sessions WHERE user_id=? AND expires_at<?", (user_id, now))
        c.execute("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
                  (token, user_id, now, now + SESSION_TTL))
    return token

def get_session(token: str):
    if not token:
        return None
    with db() as c:
        row = c.execute("""SELECT s.*, u.username, u.role FROM sessions s
                           JOIN users u ON u.id=s.user_id
                           WHERE s.token=? AND s.expires_at>?""", (token, int(time.time()))).fetchone()
    return row

def destroy_session(token: str):
    with db() as c:
        c.execute("DELETE FROM sessions WHERE token=?", (token,))

# ---------- audit ----------
def audit(user: str, action: str, target=None, detail=None):
    with db() as c:
        c.execute("INSERT INTO audit(ts,user,action,target,detail) VALUES(?,?,?,?,?)",
                  (int(time.time()), user, action, target, detail))

# ---------- rate limiting ----------
def rate_limit_check(ip: str) -> tuple[bool, str]:
    now = int(time.time())
    with db() as c:
        fails = c.execute("""SELECT COUNT(*) FROM login_attempts
                             WHERE ip=? AND ok=0 AND ts>?""", (ip, now - 300)).fetchone()[0]
        if fails >= 5:
            return False, "Too many failed attempts. Try again in a few minutes."
    return True, ""

def rate_limit_record(ip: str, ok: bool):
    with db() as c:
        c.execute("INSERT INTO login_attempts(ip,ts,ok) VALUES(?,?,?)", (ip, int(time.time()), 1 if ok else 0))

# ---------- settings ----------
def get_setting(key: str, default=None):
    with db() as c:
        row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default

def set_setting(key: str, value: str):
    with db() as c:
        c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?",
                  (key, value, value))
