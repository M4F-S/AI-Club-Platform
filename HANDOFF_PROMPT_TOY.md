# Handoff Prompt for Toy

## Current State Summary
- Project: 42 Berlin AI Club website at `https://mysophia.tech/ai-club/`
- Repo: `/opt/sophia-shopper/landing/ai-club/` (git initialized, committed to `main`)
- Backend: `ai-club-api` container is healthy and running
- API health: `https://mysophia.tech/ai-club/api/health` → 200
- Admin login works with username `mfathy` and the superadmin password.
- All public pages return 200.
- JS syntax is valid (`node --check` passes).
- No email exposed in public HTML/JS/CSS.

## What Mimi Finished
1. Initialized git repo with `.gitignore` and `AGENTS.md`.
2. Wrote `DESIGN.md` and `HANDOFF.md`.
3. Installed core skills on both agents: `ui-ux-pro-max`, `design-system`, `ui-styling`, `impeccable`, `extract-design`, `algorithmic-art`, `playwright-skill`.
4. Set up Toy's Obsidian vault at `/opt/data/vault` with `OBSIDIAN_VAULT_PATH`.
5. Installed Graphify skill and binary inside Toy's container; daily rebuild cron at 04:00.
6. Created tmux session `ai-club` on VPS at `/opt/sophia-shopper/landing/ai-club`.
7. Mimi's terminal backend is now SSH-connected to VPS.
8. Cleaned safe bloat; preserved `/root/backups-1782045345` and `/root/backups-1782151243`.
9. Created Kanban tasks for rebuild.

## Your Mission: Rebuild Defensively
1. Read `DESIGN.md` fully.
2. Read `HANDOFF.md` fully.
3. Rebuild `assets/ai-club.css` with design tokens and animations.
4. Rebuild `assets/ai-club.js` (keep it small, run `node --check`).
5. Rebuild `index.html`, `become-member.html`, `become-partner.html` with the new design system.
6. Update `login.html` and `admin.html` nav/logo to match.
7. Apply the design system to the members area pages.
8. Test every form and login end-to-end in a browser.
9. Commit after every meaningful step.
10. Update `HANDOFF.md` after each session.

## Strict Rules
- Git is source of truth.
- Never expose `mohamedfathy7@hotmail.com` in HTML/JS/CSS.
- No fake counters or fake stats.
- Use original club content from `DESIGN.md`.
- Run `node --check` on JS before committing.
- Verify mobile spacing after each page.
- If anything is unclear, ask the user before assuming.

## When to Call Mimi
- If you hit a tool limit mid-rebuild.
- If backend/API behavior seems wrong.
- If you need credential rotation or infrastructure changes.
- If you need an emergency audit before launch.

## Report Back
Tell the user what you rebuilt, what works, and what still needs attention.
