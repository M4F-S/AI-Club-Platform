# 42 Berlin AI Club — Design Specification v1.0

## Brand
- **Name:** 42 Berlin AI Club
- **Tagline:** Learn, build, and use AI responsibly — together.
- **Logo:** Original phoenix SVG from `login.html` (wings + flame, symbolic rebirth/learning).
- **Email (backend only):** mohamedfathy7@hotmail.com

## Color System (HSL)
```css
--rose-50: #fff1f2; --rose-100: #ffe4e6; --rose-200: #fecdd3; --rose-300: #fda4af;
--rose-400: #fb7185; --rose-500: #f43f5e; --rose-600: #e11d48; --rose-700: #be123c;
--terracotta: #c65d3b; --terracotta-light: #e07a5f; --terracotta-dark: #9c4a2f;
--cream: #faf8f7; --cream-2: #f5f0ee; --warm-white: #ffffff;
--text: #2d2424; --text-muted: #6b5e5e; --text-subtle: #9b8b8b;
--border: #e8dedb; --border-strong: #d6c8c4;
```

## Background Animation
Port the ReactBits "Strands" / "Aurora" concept to vanilla canvas:
- Layer 1: Slow drifting gradient orbs (rose, terracotta, gold) at 10-15% opacity.
- Layer 2: Canvas particle network with subtle mouse repulsion.
- Must be performant (requestAnimationFrame, devicePixelRatio-aware).
- Respect `prefers-reduced-motion`.

## Typography
- Headings: Space Grotesk (Google Fonts) or Geist.
- Body: Inter.
- Scale: hero 4rem, h2 2.5rem, h3 1.5rem, body 1rem.

## Animation
- Hero elements fade/slide in with stagger.
- Buttons have lift + shimmer on hover.
- Cards lift and glow on hover.
- Scroll-triggered fade-in for sections.

## Pages to Rebuild
1. `index.html` — hero, stats, about/mission/principles, what we do, why exists, join CTA, contact form.
2. `become-member.html` — application form with 42 rank dropdown.
3. `become-partner.html` — external support text + inquiry form.
4. `login.html` — update nav/logo only, keep dark gradient if user prefers.
5. `admin.html` — add matching header, keep functionality.

## Shared Assets
- `assets/ai-club.css` — design tokens + utilities + animations.
- `assets/ai-club.js` — nav, mobile menu, form wiring, background animation.
- All pages load both with cache-busting query string.

## Form Endpoints
- Member application: POST /ai-club/api/apply
- Partner inquiry: POST /ai-club/api/partner
- Contact: POST /ai-club/api/contact
- Login: POST /ai-club/api/login (member) or /ai-club/api/admin/login (admin)

## Rules
- No fake counters.
- No public email.
- Original club content only.
- Mobile first, then tablet/desktop.
- Run `node --check` on JS before commit.
- Verify in browser after every page.
