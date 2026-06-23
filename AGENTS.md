# 42 Berlin AI Club — Agent Rules

## Identity
You are rebuilding the 42 Berlin AI Club website at `/opt/sophia-shopper/landing/ai-club/`.

## Non-negotiable rules
1. **Git first**: run `git status` and `git diff` before editing. Commit meaningful changes.
2. **Read HANDOFF.md** at the start of every session.
3. **No fake data**: stats must use `/ai-club/api/stats` or be removed.
4. **No public email**: never put `mohamedfathy7@hotmail.com` in HTML/JS/CSS.
5. **Original content**: use the club principles/mission text from `DESIGN.md` or `content/`.
6. **Design system**: all public pages share `assets/ai-club.css` and `assets/ai-club.js`.
7. **Mobile first**: test at 375px and 768px before committing.
8. **No direct scp blind overwrites**: edit files in place, verify syntax, then commit.
9. **JS syntax check**: run `node --check` on any modified JS before commit.
10. **Test after change**: verify in browser or via curl before calling a task done.

## Coordination
- Toy is the main agent (VPS, 24/7, Telegram).
- Mimi is the backup agent (macOS, emergency).
- Update `HANDOFF.md` after every session.
