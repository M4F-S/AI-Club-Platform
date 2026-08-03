# 42 Berlin AI Club - Frontend Review Report

**Date:** 2026-08-03  
**Auditor:** Kimi K2.7 (moonshotai/kimi-k2.7-code)  
**Scope:** All 16 public and member-facing pages on `https://42berlinaiclub.de/ai-club/`  
**Status:** ✅ Frontend migration complete and verified. Backend login is functional after host-level permission fix.

---

## 1. Executive Summary

A deep, automated Playwright audit was run against every page on desktop (1440×1080) and mobile (390×844). The audit checked:

- Page load, title, and canonical URL
- Loader overlay hides within the safety timeout
- No JavaScript console errors
- No 4xx/5xx failed network requests
- No horizontal scroll / mobile responsiveness
- Internal link integrity
- SEO/AEO metadata (OpenGraph, Twitter cards, canonical, JSON-LD)
- Accessibility basics (`alt` text, button labels, form labels)
- Member-area sidebar and mobile toggle functionality

**Result:** All 16 pages now pass the full audit matrix. No critical, high, or medium issues remain on the frontend.

| Area | Pages | Status |
|---|---|---|
| Public pages | 9 | ✅ Clean |
| Member pages | 7 | ✅ Clean |
| Member mobile sidebar toggle | 7 | ✅ Opens/closes correctly |
| Backend login | 1 endpoint | ✅ Functional after DB permission fix |

---

## 2. Work Completed During This Audit

### 2.1 Functional fixes (Kimi K2.7)

| Commit | Description |
|---|---|
| `77d412b` | Repaired `members/event.html` broken inline script caused by a literal `</script>` inside an agent-widget template literal; rebuilt slide viewer with responsive images, thumbnails, fullscreen, and View/Download actions; fixed `memberapi-ready` race on `members/events.html`; populated dashboard widgets from `/api/events` and `/api/posts`; hid duplicate `.nav-agent` on mobile public pages. |
| `e033a61` | Corrected dashboard blog widget to use existing `/api/posts?limit=1` endpoint (was calling non-existent `/api/blog`, causing 404 console errors). |
| `96eff9f` | Added descriptive `alt` text to all header logo-mark and footer mark images across public pages; added JSON-LD BreadcrumbList to `admin.html`, `privacy-policy.html`, and `reset-password.html`. |
| (host fix) | Fixed backend login 500/401 by changing `data/ai-club.db` ownership to container `appuser` (UID 999) and mode `664`; the Flask container runs as non-root and needs write access for login-attempt logging. |

### 2.2 Work completed by prior contributor (Anti Gravity / Claude pass)

| Commit | Description |
|---|---|
| `a3861f2` | Added/corrected `og:title`, `og:description`, `og:url`, `og:image`, Twitter cards, and canonical URLs on public pages; added JSON-LD where missing. |
| `25ad285` | Added 5-second loader safety timeout to 11 pages that still lacked it. |
| `5f55cf5` | Injected missing Lucide icon library into member pages; fixed blog logo links; added `robots noindex,nofollow` to `members/quiz-interactive.html`. |
| `7ac5a09` | Fixed member nav active-state detection and admin link for `/ai-club/` canonical prefix. |
| `447ff8e` | Backend SQLite permission change (noted above; host-level ownership/mode also required). |

---

## 3. Audit Methodology

- **Tool:** Playwright (Chromium) with custom Node audit scripts.
- **Locations:** `/opt/pw/audit-public-deep.js`, `/opt/pw/audit-members-cookie.js`, `/opt/pw/audit-members.js`.
- **Test account:** `mfathy` / `M1234567890` (used only for the audit; not stored in code).
- **Mobile toggle test:** Automated click on `#mobile-nav-toggle`, verified that `.member-nav ul` receives and loses the `open` class.
- **External flaky resources:** `api.fontshare.com` intermittent 500s were excluded from "failed request" counts because they are outside site control.

---

## 4. Public Pages Audit Results

All 9 public pages pass every check.

| Page | Loader | No JS Errors | No 4xx | No H-Scroll | OG/Twitter | JSON-LD | Alt Text | Internal Links |
|---|---|---|---|---|---|---|---|---|
| `/ai-club/index.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/login.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/admin.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/become-member.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/become-partner.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/privacy-policy.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/reset-password.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/quiz.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/quiz-interactive.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 5. Member Pages Audit Results

All 7 member pages pass every check, including mobile sidebar toggle open/close.

| Page | Loader | No JS Errors | No 4xx | No H-Scroll | Member Nav | Mobile Toggle | Toggle Works | Robots Meta | Alt/Buttons |
|---|---|---|---|---|---|---|---|---|---|
| `/ai-club/members/index.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/members/events.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/members/event.html?id=3` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/members/profile.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/members/resources.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/members/perks.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/ai-club/members/quiz.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 6. Backend / Infrastructure Fix

**Problem:** `/api/member/login` returned 500 because the Flask container (running as `appuser`, UID 999) could not write to the SQLite database for login-attempt logging.

**Root cause:** `data/ai-club.db` was owned by `root:root` with mode `644` on the host. The bind mount propagated root ownership into the container, making the DB read-only for `appuser`.

**Fix applied on host:**

```bash
cd /opt/42berlinaiclub
chown 999:999 data/ai-club.db
chmod 664 data/ai-club.db
docker restart ai-club-42berlin
```

**Verification:**

```bash
curl -X POST https://42berlinaiclub.de/api/member/login \
  -H "Content-Type: application/json" \
  -d '{"intra_username":"mfathy","password":"M1234567890"}'
# HTTP 200 with user object
```

**Note:** This permission fix is not stored in git (git does not preserve ownership/mode for non-executable files). It must be re-applied after any future deployment or clone that overwrites `data/ai-club.db`. Consider adding the `chown`/`chmod` to the deployment script.

---

## 7. Remaining Recommendations

These are not blockers for the frontend, but should be addressed in the next phase (backend/integration):

1. **Fontshare CSP / font loading**
   - The CSP `font-src` allows `https://api.fontshare.com`, but actual font files load from `https://cdn.fontshare.com` and `https://unpkg.com` for Lucide. Update `font-src` and `script-src` directives, or self-host fonts/icons to eliminate report-only warnings.

2. **External dependency resilience**
   - `api.fontshare.com` CSS endpoint returns HTTP 500 intermittently. Add a local font stack fallback so the site does not depend on it.

3. **Agent widget duplication**
   - The Synapse AI chat widget HTML is copy-pasted into many pages. Extract it to a shared JS function or include file to reduce maintenance burden.

4. **Member / public theme consistency**
   - Public pages are dark indigo; member pages are light cream/rose. Decide whether to unify or keep distinct. If keeping distinct, document the rationale.

5. **DB permission durability**
   - Add the `chown 999:999 && chmod 664 data/ai-club.db` step to the deployment playbook so future deploys do not re-break login.

6. **Backend-phase work**
   - After frontend sign-off, the next phase can focus on API features, admin tooling, and any new member functionality.

---

## 8. Git Commit Log (Frontend Repo)

```
96eff9f fix(a11y+seo): add alt text to logos, add JSON-LD to admin/privacy/reset pages
e033a61 fix(members): use correct /api/posts endpoint for dashboard blog widget
77d412b fix(members): repair event page script, fix race conditions, add dashboard data, hide top agent on mobile
6f7c651 feat(quiz): migrate public quiz and interactive quiz to new design system
4c927fd fix(members): update all member page logo links to /ai-club/members/index.html
5c1eb6d fix(members): add missing nav to profile/resources/perks, use /ai-club/ paths
e18f295 fix(members): remove broken duplicate loadEvents script that swallowed agent HTML
```

(Plus prior contributor commits `a3861f2`, `25ad285`, `5f55cf5`, `7ac5a09`, `49a24ab`, `447ff8e`.)

---

## 9. Audit Artifacts

- `/tmp/audit-public-deep-results.json`
- `/tmp/audit-public-deep/*.png`
- `/tmp/audit-members-deep-results.json`
- `/tmp/audit-members-deep/*.png`
- `/tmp/audit-members-results.json`

---

**Conclusion:** The 42 Berlin AI Club frontend is in a complete, consistent, and error-free state across all 16 audited pages on both desktop and mobile. The site is ready for the backend/integration phase.
