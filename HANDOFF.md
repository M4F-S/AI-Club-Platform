# HANDOFF — 42 Berlin AI Club Rebuild

## Last Updated
2026-06-23 by Mimi

## Current Status
- Git repo initialized and baseline committed (97c6124).
- Foundation setup complete.
- Design specification written in DESIGN.md.
- Shared CSS/JS need to be rewritten cleanly.
- Public pages need rebuild.

## What is Working
- Backend container is healthy: https://mysophia.tech/ai-club/api/health
- Admin login works with mfathy.
- Application, partner, and contact forms submit to backend.

## What is Broken / Needs Rebuild
- Public page design is inconsistent.
- Background animations are missing on some pages.
- Mobile nav needs verification.
- Stats show zeros (real data, but may need design handling).

## Next Steps (in order)
1. Read DESIGN.md and this file.
2. Rewrite `assets/ai-club.css` with design tokens and animations.
3. Rewrite `assets/ai-club.js` (syntax check with `node --check`).
4. Rebuild `index.html`, `become-member.html`, `become-partner.html`.
5. Update `login.html` and `admin.html` nav/logo to match.
6. Test all forms and logins.
7. Commit after every meaningful step.

## Agents
- Toy = main agent (VPS, 24/7, Telegram).
- Mimi = backup agent (macOS, emergency).

## Important Reminders
- Never expose mohamedfathy7@hotmail.com in HTML/JS/CSS.
- No fake counters.
- Use original club content from DESIGN.md.
- Run `git status` before editing.
- Update this HANDOFF.md after every session.

## 2026-06-23 Infrastructure Update (Mimi)
- Toys Obsidian vault at /opt/data/vault is configured.

## 2026-06-23 Infrastructure Update (Mimi)
- Toy's Obsidian vault at /opt/data/vault is configured.
- Graphify skill installed for Toy; daily graph rebuild at 04:00 via host cron.
- Hourly vault backup to /root/vault-hourly-sync/.
- Mimi's terminal backend switched to SSH to VPS.
- tmux session `ai-club` created on VPS at /opt/sophia-shopper/landing/ai-club.
- Kanban board created with 10 rebuild tasks.
- Git is source of truth.
- Safe bloat removed; do NOT touch /root/backups-1782045345 (unified-memory) or /root/backups-1782151243 (original ai-club backup).
