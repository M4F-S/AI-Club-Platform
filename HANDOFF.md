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
