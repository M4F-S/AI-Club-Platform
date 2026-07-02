# HANDOFF — 42 Berlin AI Club Project

> ⚠️ **READ THIS FIRST before doing anything else.**
> Then run a full system audit (detailed below) before making changes.

---

## Quick Facts

| Item | Value |
|------|-------|
| **Project** | 42 Berlin AI Club — membership platform, public landing pages, admin panel, partner inquiries |
| **Live URL** | https://mysophia.tech/ai-club/ |
| **Admin panel** | https://mysophia.tech/ai-club/admin.html |
| **Login portal** | https://mysophia.tech/ai-club/login.html |
| **Health endpoint** | https://mysophia.tech/ai-club/api/health → should return `{"status":"ok"}` |
| **GitHub repo** | https://github.com/M4F-S/AI-Club-Platform.git |
| **Last commit** | `21dec6f` — feat: add delete buttons for members and partner inquiries |
| **Owner** | Mohamed Fathy (mfathy) — `mohamedfathy7@hotmail.com` |

---

## ⚡ Critical: Establish a Stable VPS Connection

The project lives on a **VPS at 187.124.2.26** (Ubuntu 24.04). You will need `sshpass` to authenticate (ssh key not configured).

### How to connect

```bash
sshpass -p 'AaSsDd#12345678' ssh -o StrictHostKeyChecking=no root@187.124.2.26
```

### How to avoid interruptions (important)

Every SSH connection re-reads the MOTD banner (about 20 lines) and uses a fresh session. To save tokens and work faster:

1. **Use SSH multiplexing** (reuses one TCP connection):
   ```bash
   # On the host with Hermes agent — create ~/.ssh/config with:
   Host 187.124.2.26
       ControlMaster auto
       ControlPath ~/.ssh/cm-%r@%h:%p
       ControlPersist 10m
       StrictHostKeyChecking no
       User root
   # Now subsequent connections reuse the same TCP socket
   ```

2. **Or use one long-running SSH connection** for a session:
   ```bash
   # Keep a background master connection alive
   sshpass -p 'AaSsDd#12345678' ssh -fN -M -S ~/.ssh/vps-socket -o ControlPersist=3600 root@187.124.2.26
   # Then all subsequent commands reuse it
   ssh -S ~/.ssh/vps-socket root@187.124.2.26 '<command>'
   ```

3. **Alternative: write scripts locally, scp them, run via ssh**:
   ```bash
   sshpass -p 'AaSsDd#12345678' scp /tmp/my-script.py root@187.124.2.26:/tmp/
   sshpass -p 'AaSsDd#12345678' ssh root@187.124.2.26 'python3 /tmp/my-script.py'
   ```

### Dealing with `docker exec` and quoting

When running Python scripts inside the container via `docker exec`, complex quoting breaks. **Always write a .py file, scp/cp it, then run it:**

```bash
# Write your test to a file
sshpass ... scp /tmp/myscript.py root@187.124.2.26:/tmp/
# Copy it into the container
sshpass ... ssh root@187.124.2.26 'docker cp /tmp/myscript.py ai-club-api:/tmp/'
# Run it in the container with PYTHONPATH set
sshpass ... ssh root@187.124.2.26 'docker exec -e PYTHONPATH=/app ai-club-api python3 /tmp/myscript.py'
```

---

## 🔐 Login Credentials

### Admin (web panel)
- **URL:** https://mysophia.tech/ai-club/admin.html
- **Username:** `mfathy` (intra_username) or `mohamedfathy7@hotmail.com`
- **Password:** The password is bcrypt-hashed and **cannot be recovered** from the database.

**If the password is unknown, reset it:**
```bash
# Set a new password via environment variable and re-run the admin seeder
docker exec -e ADMIN_INITIAL_PASSWORD=newPasswordHere -e PYTHONPATH=/app ai-club-api python3 /app/scripts/create_admin.py
# Or set ADMIN_INITIAL_PASSWORD in the container env and restart
```

> ⚠️ The superadmin account is `id=1`, `email=mohamedfathy7@hotmail.com`, `name=Mohamed Fathy`, `role=superadmin`.

### VPS SSH
- **Host:** `187.124.2.26`
- **User:** `root`
- **Password:** `AaSsDd#12345678`

> ⚠️ This is a production VPS running **multiple services** (see the full audit). Never restart random containers, never change Docker networks, never prune Docker without checking what you're doing.

### SMTP Email (used for approval emails, contact form, partner inquiries)
- **Provider:** Gmail
- **Host:** `smtp.gmail.com`
- **Port:** 587
- **User:** `mmmmfathy7@gmail.com`
- **Password:** *saved in the container's environment (SMTP_PASSWORD env var)*
- **Admin notification address:** `mohamedfathy7@hotmail.com`

### GitHub
- **Repo:** `https://github.com/M4F-S/AI-Club-Platform.git`
- **Auth:** For pushes from the VPS, the remote is already configured. Push from the VPS directly:
  ```bash
  cd /opt/sophia-shopper/landing/ai-club && git push origin main
  ```

---

## 📋 PRE-AUDIT CHECKLIST

**Do this before you touch anything:**

### 1. Audit the VPS — understand what's running

```bash
# Full system inspection
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker info --format '{{.ServerVersion}}'
free -h
df -h /
uname -a
uptime
```

There are **~30 containers** on this VPS including: Sophia ecosystem (api, embed-worker, scraper, neo4j, minio, postgres, redis), Unified Memory (frontend, backend, postgres, redis), ERPNext (multiple containers), Cloudflare tunnel, **and** the Hermes agent itself. **Do NOT touch non-ai-club containers.**

### 2. Audit the AI Club deployment

```bash
# Deployment path
ls -la /opt/sophia-shopper/landing/ai-club/
docker inspect ai-club-api --format '{{json .Config.Env}}' | python3 -m json.tool
docker inspect ai-club-api --format '{{json .Mounts}}' | python3 -m json.tool
docker logs ai-club-api --tail 30
curl -s -w '\nHTTP %{http_code}' https://mysophia.tech/ai-club/api/health

# Database content
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db ".tables"
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT id, email, name, role, is_active FROM users;"
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT id, name, email, status FROM applications;"
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT id, organization, email, partnership_type FROM partner_inquiries;"

# Check Caddy config for how routes are proxied
docker exec sophia-caddy cat /etc/caddy/Caddyfile
```

### 3. Read these files before ANY edit

```bash
cd /opt/sophia-shopper/landing/ai-club
cat AGENTS.md
git log --oneline -30
git diff HEAD~5 --stat  # understand recent changes
```

### 4. Verify your connection works end-to-end

```bash
# Can you run commands on the VPS?
sshpass -p 'AaSsDd#12345678' ssh root@187.124.2.26 'uptime'

# Can you run commands inside the API container?
sshpass -p 'AaSsDd#12345678' ssh root@187.124.2.26 'docker exec ai-club-api curl -s http://localhost:5000/health'

# Can you query the database?
sshpass -p 'AaSsDd#12345678' ssh root@187.124.2.26 'sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT count(*) FROM users;"'

# Can you push to GitHub?
sshpass -p 'AaSsDd#12345678' ssh root@187.124.2.26 'cd /opt/sophia-shopper/landing/ai-club && git push --dry-run origin main'
```

> 🛑 **Do not proceed with changes until all of the above works.**

---

## 🏗 Architecture Overview

### Infrastructure

```
internet
  └─ Cloudflare (CDN/SSL, tunnel optional)
      └─ sophia-caddy (container, reverse proxy, port 80/443)
          ├─ /ai-club/api/* ──→ ai-club-api:5000 (Flask + Waitress)
          └─ /ai-club/*       ──→ /srv/landing/ai-club/ (static files)
```

### The API Container (`ai-club-api`)

| Detail | Value |
|--------|-------|
| **Image** | `docker-ai-club-api` (built locally from Dockerfile) |
| **Framework** | Flask 3.0.3 + Waitress (WSGI) |
| **DB** | SQLite at `/app/data/ai-club.db` (persistent mount: `/opt/sophia-shopper/landing/ai-club/data/`) |
| **Pool** | NullPool (fixed "readonly database" error from thread-pool conflict) |
| **Worker threads** | 8 (Waitress) |
| **Rate limiting** | Flask-Limiter (200/day, 50/hour default) |
| **Health check** | Docker native — endpoint at `/health` |

### Files on VPS (`/opt/sophia-shopper/landing/ai-club/`)

```
├── api/                    # Python Flask backend
│   ├── app.py              # ALL routes + helper functions (708 lines)
│   ├── config.py           # Configuration loader (reads env vars)
│   ├── models.py           # 7 SQLAlchemy models
│   ├── Dockerfile          # Builds the api container
│   ├── wsgi.py             # Entry point (waitress serve)
│   ├── requirements.txt    # Dependencies
│   ├── scripts/
│   │   └── create_admin.py # Seeds superadmin account
│   └── .env                # Environment variables (SECRET_KEY, SMTP_*, etc.)
├── assets/
│   ├── ai-club.css         # Design system + global CSS
│   └── ai-club.js          # Nav, mobile menu, forms, stats, particles, scroll animations
├── members/
│   ├── index.html           # Dashboard
│   ├── profile.html         # Profile page
│   ├── events.html          # Events page
│   ├── resources.html       # Resources page
│   ├── perks.html           # Perks page
│   ├── blog/index.html      # Blog listing
│   ├── blog/post.html       # Blog post template
│   ├── members.css          # Members-area specific styles
│   └── members.js           # Members-area JS
├── index.html               # Public landing page
├── become-member.html       # Apply form
├── become-partner.html      # Partner inquiry form
├── login.html               # Member login page
├── reset-password.html      # Password reset (request + set new)
├── admin.html               # Admin panel (login + dashboard)
├── privacy-policy.html      # Legal page
├── AGENTS.md                # Agent rules (read before editing!)
├── DESIGN.md                # Design system docs
├── HANDOFF.md               # Previous handoff (historical)
├── HANDOFF_PROMPT_TOY.md    # Original build prompt
└── data/
    └── ai-club.db           # SQLite database (mounted volume)
```

---

## 🗄 Database Schema

7 tables. SQLite at `/app/data/ai-club.db` (mounted from `/opt/sophia-shopper/landing/ai-club/data/`).

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Members + admins | `id, email, intra_username, name, password_hash (bcrypt), role (member/admin/superadmin), is_active, password_reset_token, password_reset_expires_at` |
| `applications` | Membership applications | `id, name, email, intra_username, level, message, status (pending/approved/rejected), reviewed_by_id → users` |
| `partner_inquiries` | Partnership requests | `id, organization, contact_name, email, partnership_type, message` |
| `contact_messages` | Contact form submissions | `id, name, email, message` |
| `blog_posts` | Blog content | `id, title, slug (unique), summary, content, published, author_id → users` |
| `events` | Events listing | `id, title, description, event_date, location, link` |
| `resources` | Resources listing | `id, title, description, url, category` |

---

## 🔌 API Endpoints (all routes at `/ai-club/api/...`)

### Public
| Method | Path | Description | Rate limit |
|--------|------|-------------|------------|
| GET | `/health` | Container health | exempt |
| GET | `/stats` | Public member/event stats | exempt |
| POST | `/apply` | Submit membership application | 3/hour |
| POST | `/contact` | Submit contact message | 5/hour |
| POST | `/partner` | Submit partner inquiry | 5/hour |
| GET | `/posts` | Published blog posts | default |
| GET | `/posts/<slug>` | Single blog post | default |
| GET | `/events` | All events | default |
| GET | `/resources` | All resources | default |

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/admin/login` | — | Admin login (email or intra username) |
| POST | `/admin/logout` | admin | Admin logout |
| GET | `/admin/me` | admin | Current admin info |
| POST | `/member/login` | — | Member login (email or intra username) |
| POST | `/member/logout` | login | Member logout |
| GET | `/member/me` | login | Current member info |
| POST | `/member/change-password` | login | Change password (requires current) |
| POST | `/forgot-password` | — | Request password reset link | 3/hour |
| POST | `/reset-password` | — | Reset password with token | 5/hour |

### Admin — Applications
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/applications?status=` | admin | List by status (pending/approved/rejected) |
| POST | `/admin/approve` | admin | Approve → creates User, sends email with temp password |
| POST | `/admin/reject` | admin | Reject application |
| GET | `/admin/members` | admin | List all users |
| POST | `/admin/promote` | superadmin | Promote member → admin |
| POST | `/admin/demote` | superadmin | Demote admin → member |
| DELETE | `/admin/members/<id>` | admin | Delete member (guards: no self-delete, no superadmin) |
| GET | `/admin/partner-inquiries` | admin | List all partner inquiries |
| DELETE | `/admin/partner-inquiries/<id>` | admin | Delete partner inquiry |
| GET | `/admin/posts` | admin | List all blog posts |
| POST | `/admin/posts` | admin | Create blog post |
| PUT | `/admin/posts/<id>` | admin | Update blog post |
| DELETE | `/admin/posts/<id>` | admin | Delete blog post |
| POST | `/admin/events` | admin | Create event |
| DELETE | `/admin/events/<id>` | admin | Delete event |
| POST | `/admin/resources` | admin | Create resource |
| DELETE | `/admin/resources/<id>` | admin | Delete resource |

### CSRF Protection
All non-GET/HEAD/OPTIONS requests are checked against `Origin` or `Referer` header. Must start with `https://mysophia.tech` or `http://localhost`.

### Auth levels
| Decorator | Allows |
|-----------|--------|
| `@_require_login` | Any active user |
| `@_require_admin` | Users with role `admin` or `superadmin` |
| `@_require_superadmin` | Only `superadmin` role |

---

## 🚢 How to Deploy Changes

### 1. Edit source files
The working copy is on the VPS at `/opt/sophia-shopper/landing/ai-club/`. Edit files there.

### 2. For backend changes (api/app.py, api/config.py, api/models.py)
The API container has the code **baked into its image**, not mounted as a volume. After editing the host copy:
```bash
# Copy updated file into running container
docker cp /opt/sophia-shopper/landing/ai-club/api/app.py ai-club-api:/app/app.py

# Restart to ensure clean state (also picks up any wsgi changes)
docker restart ai-club-api

# Wait for healthy status
sleep 2 && docker ps --filter name=ai-club-api --format '{{.Status}}'
```

### 3. For frontend changes (HTML, CSS, JS)
Static files are served directly by Caddy from the host filesystem. **No container restart needed.** Just edit the file and refresh the browser. If you modify CSS/JS, bump the cache-busting version parameter:
```html
<link rel="stylesheet" href="/ai-club/assets/ai-club.css?v=12">
<script src="/ai-club/assets/ai-club.js?v=12"></script>
```

### 4. For database changes
The file `/opt/sophia-shopper/landing/ai-club/data/ai-club.db` is mounted live into the container at `/app/data/`. Changes from either side are immediately visible. SQLite is in WAL mode by default.

### 5. Always commit to git
```bash
cd /opt/sophia-shopper/landing/ai-club
git add -A
git commit -m "type: description"
git push origin main
```

### 6. Back up before risky changes
Use the backup script or create timestamped backups:
```bash
mkdir -p /root/backups-$(date +%s)
cp /opt/sophia-shopper/landing/ai-club/api/app.py /root/backups-$(date +%s)/
```

---

## 💡 Known Quirks & Pitfalls

### ⚠️ DO NOT
1. **Do NOT restart or modify non-ai-club Docker containers.** The VPS has ~30 containers including Sophia, UnifiedMemory, and ERPNext — you will break other production services.
2. **Do NOT run `docker system prune` or `docker volume prune`** without checking every container/volume first.
3. **Do NOT rebuild the Docker image** (`docker build -t docker-ai-club-api`) unless absolutely necessary — `docker cp` is faster and avoids image-layer caching issues. If you do rebuild, use the existing tag.
4. **Do NOT expose admin/member email addresses in HTML/JS/CSS.** Mohamed Fathy's email should never appear in frontend code.
5. **Do NOT use fake/static numbers for stats** — the landing page reads real data from `/stats`.
6. **Do NOT delete the last superadmin account.**

### 🔧 Known Issues
1. **CSI check `_origin_ok()`** blocks non-browser API requests. The `test_client` in Python tests fails because it doesn't send an Origin header. When testing with Python, override: `app_mod._origin_ok = lambda: True`.
2. **Test client session cookies don't persist** across `with c.session_transaction()` blocks in some Flask versions. Test admin endpoints via the browser or set session manually.
3. **SQLite "readonly database"** was fixed by setting `poolclass=NullPool` in config.py. Do NOT revert this. The issue was QueuePool thread conflicts with Waitress's 8 threads.
4. **SMTP failures** are silent — `_send_email()` returns False but doesn't block the API response. Check `docker logs ai-club-api` for `Failed to send email` messages.
5. **No email verification** on signup. The approval flow creates a User and sends a temp password. If the email is wrong, the member is stuck (can't log in, can't re-apply due to duplicate check). The Delete button in the admin panel is the fix for this.
6. **The API container has NO live file mount** for code. Only `/app/data` is a volume. `docker cp` or rebuild the image for code changes.
7. **No forced password change** on first login — the approval email tells the user to change it, but the system doesn't enforce this.

### 🔐 Forgot Password Flow (added 2026-06-26)
- **Endpoints:** `POST /forgot-password` (3/hour), `POST /reset-password` (5/hour)
- **Token storage:** SHA-256 hash of secure token, 24h expiry, single-use
- **Email enumeration prevention:** Generic success message for all cases (existent and non-existent emails)
- **SMTP dependency:** If Gmail SMTP fails, user sees success message but no email arrives. Check `docker logs` for `Failed to send email`.
- **Reset URL:** `https://mysophia.tech/ai-club/reset-password.html?token=<token>`

---

## 📂 Useful Commands Reference

### Monitoring
```bash
# Health check
curl -s https://mysophia.tech/ai-club/api/health

# Container logs
docker logs ai-club-api --tail 50

# Container health
docker inspect ai-club-api --format '{{.State.Health.Status}}'

# All running containers (don't touch non-ai-club ones)
docker ps

# Database content
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT * FROM users;"
```

### Quick db queries
```bash
# List all active members
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT id, name, email FROM users WHERE is_active=1;"

# Count pending applications
sqlite3 /opt/sophia-shopper/landing/ai-club/data/ai-club.db "SELECT count(*) FROM applications WHERE status='pending';"

# Check last backup
ls -lt /root/ai-club-backups/ | head -3
```

### Git
```bash
cd /opt/sophia-shopper/landing/ai-club
git status
git log --oneline -10
git push origin main
```

---

## 📝 Current State (as of handoff)

### Members (8 active)
| ID | Name | Role |
|----|------|------|
| 1 | Mohamed Fathy | superadmin |
| 5 | Pavlo | member |
| 6 | Garba Saïd Yannis | member |
| 7 | Marco Aurélio Santos | member |
| 8 | Iryna Dzhupyna | member |
| 9 | Pasha Abduladze | member |
| 10 | Freddy | member |
| 12 | Emre Kirgin | member |

### Applications (various statuses — approved, rejected, pending)
### Partners (0)
### Content (events/posts/resources: 0 — need real content)

### Known things to do next
- Real events/posts/resources need to be created via the admin panel
- 42 Intra API integration is pending (user said they'd provide UID+SECRET)
- ~~Member password reset flow could be improved~~ ✅ Implemented 2026-06-26
- ~~The login page could use a "Forgot password?" feature~~ ✅ Implemented 2026-06-26
- Stats on the homepage still show 0 for events/projects/workshops

---

## 📞 Contact

- **Mohamed Fathy:** `mohamedfathy7@hotmail.com` (admin, superadmin)
- **This agent** (Toy/Hermes) has been working on this project and is now handing off to you. You are the new agent taking over.

**Good luck, don't break production.** 🖖