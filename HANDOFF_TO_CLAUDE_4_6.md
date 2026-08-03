# Handoff: 42 Berlin AI Club Website — Frontend Review & Completion

> **Recipient:** Claude Opus 4.6 running in Anti Gravity IDE on Mohamed Fathy’s MacBook  
> **Project:** 42 Berlin AI Club website (→ `https://42berlinaiclub.de/ai-club/`)  
> **Author:** Kimi K2.7 (moonshotai/kimi-k2.7-code)  
> **Date:** 2026-08-03  
> **Status:** Frontend migration ~85% complete. Critical functional bugs fixed under **Option A**. Remaining work is SEO/AEO, final visual/mobile regression, and member-area UX polish. Backend updates are out-of-scope for this handoff and will follow after frontend is finalized.

---

## 1. Project Overview

The 42 Berlin AI Club site is a static frontend served from a VPS at `187.124.2.26`. The canonical public path is `/ai-club/*`. Caddy strips `/ai-club` before looking up files in `/opt/42berlinaiclub`.

- **Frontend repo:** `/opt/42berlinaiclub` (branch: `feat/design-migration-2026-08`)
- **Web server / reverse proxy:** `/opt/sophia-shopper` (Caddy Docker container `sophia-caddy`)
- **Caddyfile:** `/opt/sophia-shopper/docker/Caddyfile`
- **Template reference (for design & animations only):** `template/` directory inside `/opt/42berlinaiclub` — do NOT copy template files wholesale; extract only design tokens, animations, and interaction patterns.

### Design system
- Dark indigo theme: `#060612` background, mint/violet accents.
- Shared CSS: `/assets/new-design-system.css`, `/assets/v4-design.css`, `/assets/v4-features.css`.
- Shared JS: `/assets/v4-bg.js`, `/assets/v4-features.js`, `/assets/v4-agent.js`.
- Loader overlay must be present on every page AND must be hidden via JS (`document.body.classList.add('loaded')`) plus a 5-second safety timeout.
- Member area uses a light cream/rose override (`/members/members.css`) and injects sidebar/mobile toggle via `/members/members.js`.

---

## 2. Access & Environment

### 2.1 Connect to the VPS

The site is deployed on **VPS IP `187.124.2.26`** as `root`.

> **SSH key question:** I am running inside the Hermes Docker container and used an SSH key located at `~/.ssh/id_hermes_temp`. I do not know whether that key is available on your MacBook. **Please verify with Mohamed Fathy before connecting.** If the key is not on the MacBook, ask him to provide the correct private key path or add your public key to `/root/.ssh/authorized_keys` on the VPS.

Typical connection once the key is available:

```bash
ssh -i <path-to-key> root@187.124.2.26
cd /opt/42berlinaiclub
git status
```

### 2.2 Test environment

A Playwright environment exists on the VPS at `/opt/pw` (`playwright` + Chromium deps installed). Audit scripts live there:

- `/opt/pw/audit-public.js` — 9 public pages, desktop + mobile.
- `/opt/pw/audit-members.js` — 7 authenticated member pages (requires `INTRA` and `PASS` env vars).

You can reuse or extend these scripts. You may also install Playwright locally on the MacBook if preferred, but the member audit still needs valid credentials.

### 2.3 Member credentials

Member pages require login. **Do NOT hard-code credentials.** Ask Mohamed Fathy for the current test `INTRA`/`PASS` and export them only for the audit session:

```bash
export INTRA="..."
export PASS="..."
node /opt/pw/audit-members.js
```

---

## 3. Current Progress Stats

### Pages already migrated to the new design system

#### Public pages
1. `/ai-club/index.html` — homepage
2. `/ai-club/login.html`
3. `/ai-club/admin.html`
4. `/ai-club/become-member.html`
5. `/ai-club/become-partner.html`
6. `/ai-club/privacy-policy.html`
7. `/ai-club/reset-password.html`
8. `/ai-club/quiz.html` — newly migrated static quiz
9. `/ai-club/quiz-interactive.html` — newly migrated interactive quiz

#### Member pages
10. `/ai-club/members/index.html` — dashboard
11. `/ai-club/members/events.html` — workshop list
12. `/ai-club/members/event.html` — workshop detail
13. `/ai-club/members/profile.html`
14. `/ai-club/members/resources.html`
15. `/ai-club/members/perks.html`
16. `/ai-club/members/quiz.html`

### Recent commits on `/opt/42berlinaiclub`

```
77d412b fix(members): repair event page script, fix race conditions, add dashboard data, hide top agent on mobile
6f7c651 feat(quiz): migrate public quiz and interactive quiz to new design system
4c927fd fix(members): update all member page logo links to /ai-club/members/index.html
5c1eb6d fix(members): add missing nav to profile/resources/perks, use /ai-club/ paths
e18f295 fix(members): remove broken duplicate loadEvents script that swallowed agent HTML
```

### Caddy commit on `/opt/sophia-shopper`

```
de02b60 fix(caddy): serve /ai-club/* subpath from /opt/42berlinaiclub
```

---

## 4. Known Findings & Fixed Issues

### Fixed under Option A (commit `77d412b`)
1. **`members/events.html` race condition** — inline `loadEvents()` ran before `members.js` exposed `window.MemberAPI`. Now waits for `memberapi-ready` event.
2. **`members/event.html` broken inline script** — a literal `</script>` tag inside an agent-widget template literal closed the parent script prematurely, causing parse errors and broken rendering. Script rebuilt; agent widget re-added cleanly at end of body.
3. **`members/event.html` slide viewer responsiveness** — slides now use `max-width: 100%; height: auto; max-height: 70vh; object-fit: contain` with thumbnail navigation and fullscreen button.
4. **`members/event.html` material actions** — non-slide materials now show a **View** button plus Download; quizzes show **Take Quiz**.
5. **`members/index.html` dashboard widgets** — `#latest-post` and `#next-event` now fetch `/api/blog?limit=1` and `/api/events`.
6. **Mobile public nav duplication** — top `.nav-agent` "SYNAPSE AI" pill is now hidden on mobile (≤ 820 px); only the floating `#orb` remains.

### Open / remaining issues

1. **SEO/AEO metadata missing on most sub-pages.**
   - Need `og:image`, `og:title`, `og:description`, `og:type`, `og:url`.
   - Need Twitter card meta.
   - Need JSON-LD (Organization, WebSite, BreadcrumbList where appropriate).
   - Need FAQ schema on FAQ-bearing pages (quiz pages already have FAQ schema).
   - No dedicated `og-image.png` asset exists; `/ai-club/assets/logo-gate.png` is currently used as fallback.

2. **Member-area mobile UX needs verification.**
   - Sidebar/mobile toggle is injected by `members.js::renderNav()`.
   - Every member page now has `.container.member-layout` + `<nav class="member-nav"></nav>`.
   - You must verify the toggle works from initial page load on all member pages, not just after refresh.

3. **External font dependency instability.**
   - `https://api.fontshare.com/v2/css` returns HTTP 500 intermittently.
   - Decide whether to add a local font fallback, switch CDN, or remove the dependency.

4. **Agent widget duplication / hardcoding.**
   - Agent widget HTML is copy-pasted into many pages.
   - Consider extracting to a shared include or JS function, but do not destabilize existing pages.

5. **Theme inconsistency between public (dark) and member (light cream/rose) areas.**
   - Decide with Mohamed Fathy whether to reconcile or keep distinct.

6. **Final regression audit.**
   - All 16 pages on desktop + mobile.
   - Check: loader hides, no JS errors, no 404s, nav links work, mobile responsive breakpoints, consistent footer/header.

---

## 5. Your Mission

Run a **full review and analysis** and produce a **written completion report**. Specifically:

1. **SSH into the VPS** and inspect the current state (`git log`, `git status`, file list).
2. **Run visual Playwright audits** (desktop + mobile) for all 16 pages listed in Section 3.
   - Use `/opt/pw/audit-public.js` and `/opt/pw/audit-members.js` as starting points.
   - Ask Mohamed Fathy for member credentials; do not guess.
3. **Document every issue** you find with:
   - Page URL
   - Viewport (desktop / mobile)
   - Severity (critical / high / medium / low)
   - Evidence (console error, screenshot, broken element)
   - Root cause
   - Proposed fix
4. **Create a prioritized action plan** (what to fix first, second, third).
5. **Apply fixes one at a time**, committing after each fix with clear messages.
6. **Add SEO/AEO metadata** to all sub-pages that lack it.
7. **Verify member mobile sidebar toggle** works from initial load on every member page.
8. **Run final regression audit** and attach results/screenshots to your report.

### Constraints & rules

- **Use `/ai-club/` as canonical** for all internal links; root paths are for backward compatibility only.
- **Git commit after every fix.** No uncommitted changes at end of session.
- **Create timestamped backups** before risky edits (e.g., `cp file.html /root/backups-<epoch>/`).
- **Loader rule:** any page with a loader HTML element must have JS to hide it + a 5-second safety timeout.
- **Do NOT commit `data/ai-club.db`** if it changed from runtime writes.
- **Template is reference only** — extract design tokens, animations, and interaction patterns; do not overwrite migrated pages with raw template files.
- **Member credentials are secret** — never write them to disk or logs.

---

## 6. Deliverable

A markdown report saved as `/opt/42berlinaiclub/FRONTEND_REVIEW_REPORT.md` containing:

1. Executive summary (pages audited, pass/fail counts).
2. Detailed findings table (page, viewport, issue, severity, evidence, fix).
3. SEO/AEO metadata matrix (which pages got which tags/schema).
4. Mobile UX verification results.
5. Remaining recommendations (including backend-phase items).
6. Final git commit log.

After the report is complete, ask Mohamed Fathy whether to proceed with the backend-phase updates or first polish any remaining frontend items.

---

## 7. Quick Reference Commands

```bash
# SSH (replace key path as needed)
ssh -i ~/.ssh/id_hermes_temp root@187.124.2.26

# Frontend
cd /opt/42berlinaiclub
git status
git log --oneline -10

# Server
cd /opt/sophia-shopper
docker ps
docker logs sophia-caddy --tail 50

# Public audit
cd /opt/pw
node audit-public.js

# Member audit (requires credentials)
export INTRA="<ask Mohamed>"
export PASS="<ask Mohamed>"
node audit-members.js
```

---

## 8. Contact / Escalation

If anything in this handoff is unclear, contradicts what you see on the server, or if you cannot obtain SSH access, stop and ask Mohamed Fathy before making changes. Do not guess credentials, paths, or API endpoints.
