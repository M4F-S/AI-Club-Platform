# HANDOFF — 42 Berlin AI Club Rebuild

## Last Updated
2026-06-23 by Toy

## Current Status
- Rebuild of public pages, shared assets, login/admin headers, and members area CSS is complete.
- Git repo is source of truth; all changes committed to `main`.
- Backend is healthy (`/ai-club/api/health` → 200).
- Public pages return 200 and use the new design system.
- `node --check` passes for `assets/ai-club.js` and `members/members.js`.
- No `mohamedfathy7@hotmail.com` exposed in HTML/JS/CSS.

## What is Working
- Backend container is healthy: https://mysophia.tech/ai-club/api/health
- `assets/ai-club.css` — full design tokens, animations, responsive helpers.
- `assets/ai-club.js` — nav, mobile menu, form wiring, toast, stats loader, canvas particles, scroll animations.
- `index.html`, `become-member.html`, `become-partner.html` rebuilt with design system and original content.
- `login.html` and `admin.html` updated with matching header/nav/logo.
- `members/members.css` and `members/members.js` updated with design tokens and scroll animations.
- Scroll animations now show content by default and only fade-in when JS is available, so crawlers/no-JS visitors still see the page.
- Canvas particle network intensity increased (higher alpha, larger dots, stronger connecting lines) for better visibility.
- Contact, membership, and partner forms submit successfully and show success messages.
- Member/admin login forms show validation errors for bad credentials.
- Admin login works end-to-end; admin panel loads applications and members.
- Member login works end-to-end; member dashboard loads for `testuser`.
- Stats on homepage load real data from `/ai-club/api/stats` (currently 2 members, 0 events/projects/workshops).
- Member navigation now uses absolute URLs, so links work from every member page including `/members/blog/index.html`.
- Member logo now links to the dashboard (`/ai-club/members/index.html`) and does not log the user out.
- Public site exit link in the member sidebar lets users leave the members area while keeping their session.
- Public assets (CSS/JS) use absolute paths, so 404-fallback pages remain styled.

## What Needs Attention
- **Mobile nav**: Basic responsive markup and toggle are in place; real-device checks show public mobile menu works and member mobile menu works in local layout testing. No horizontal overflow detected on homepage, member forms, or dashboard.
- Dynamic content still depends on backend data and admin-created posts/events/resources.

## Next Steps
1. Change the temporary admin password after you finish testing.
2. Change the temporary test-member password after you finish testing.
3. Add real events/posts/resources via admin panel once login is confirmed.
4. Keep committing small changes and update this file after each session.

## Recent Commits
- `f2ed4d4` Option B: absolute member nav/logo, dashboard logo, public site exit, absolute assets
- `47d1cd7` Update HANDOFF.md: mobile audit results and redirect fix
- `24d8a0c` Fix member/auth redirect to absolute login path

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
- Toy's Obsidian vault at /opt/data/vault is configured.
- Graphify skill installed for Toy; daily graph rebuild at 04:00 via host cron.
- Hourly vault backup to /root/vault-hourly-sync/.
- Mimi's terminal backend switched to SSH to VPS.
- tmux session `ai-club` created on VPS at /opt/sophia-shopper/landing/ai-club.
- Kanban board created with 10 rebuild tasks.
- Git is source of truth.
- Safe bloat removed; do NOT touch /root/backups-1782045345 (unified-memory) or /root/backups-1782151243 (original ai-club backup).
- New pre-rebuild backup created by Toy at `/root/backups-1782246870/ai-club-pre-toy-rebuild.tar.gz`.
