(function () {
  'use strict';

  const API_URL = '/api';

  // Expose API immediately so inline scripts can use it
  const api = async function(path, options = {}, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${API_URL}${path}`, {
          ...options,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        if (attempt === retries) {
          console.error(`API error for ${path}:`, err);
          return { ok: false, status: 0, data: { error: 'Network error' } };
        }
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  };

  async function requireAuth() {
    const { ok, data } = await api('/member/me');
    if (!ok) {
      window.location.href = '/login.html';
      return null;
    }
    return data.user;
  }

  
  function renderNav(user) {
    const nav = document.querySelector('nav') || document.querySelector('.member-header');
    if (!nav) return;

    const MEMBER_BASE = '/members/';
    const path = location.pathname;
    
    const a = (p) => path.endsWith(p) ? 'active' : '';
    const b = (p) => path.includes(p) ? 'active' : '';

    const adminLink = (user.role === 'superadmin' || user.role === 'admin')
      ? `<a href="/admin.html" data-hover style="color:var(--mint)">Admin</a>`
      : '';

    const newNav = document.createElement('nav');
    newNav.innerHTML = `
      <a class="logo" href="/" data-hover>
        <span class="logo-mark"><img src="/assets/logo-gate.png" alt="42 Berlin AI Club"></span>
        <span class="logo-text">42 BERLIN<small>AI Club</small></span>
      </a>
      <div class="nav-links">
        <a href="${MEMBER_BASE}index.html" class="${a('index.html')||a('/members/')}" data-hover>Dashboard</a>
        <a href="${MEMBER_BASE}events.html" class="${b('events.html')||b('event.html')}" data-hover>Workshops</a>
        <a href="${MEMBER_BASE}resources.html" class="${b('resources.html')}" data-hover>Resources</a>
        <a href="${MEMBER_BASE}blog/index.html" class="${b('blog')}" data-hover>Blog</a>
        <a href="${MEMBER_BASE}perks.html" class="${b('perks.html')}" data-hover>Perks</a>
        <a href="${MEMBER_BASE}profile.html" class="${b('profile.html')}" data-hover>Profile</a>
        ${adminLink}
      </div>
      <button class="nav-member" id="logout-btn" data-hover aria-label="Log out" style="color:var(--text);border-color:var(--line)">
        <span id="nav-member-label">Log out</span>
      </button>
    `;
    
    // Replace the old nav/header with the new global nav
    nav.parentNode.replaceChild(newNav, nav);
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }
function updateHeader(user) {
    const el = document.getElementById('user-name');
    if (el) el.textContent = user.name;
    const welcome = document.getElementById('welcome-name');
    if (welcome) welcome.textContent = user.name.split(' ')[0];
  }

  async function logout() {
    await api('/member/logout', { method: 'POST' });
    window.location.href = '/login.html';
  }

  function initScrollAnimations() {
    const animated = document.querySelectorAll('.animate-on-scroll');
    if (animated.length === 0) return;
    if (!('IntersectionObserver' in window)) {
      animated.forEach((el) => el.classList.add('visible'));
      return;
    }
    document.body.classList.add('js-animations');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    animated.forEach((el) => observer.observe(el));
  }

  async function boot() {
    const user = await requireAuth();
    if (!user) return;

    updateHeader(user);
    renderNav(user);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    initScrollAnimations();
    document.body.classList.add('loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose API with a ready promise for inline scripts
  window.MemberAPI = { api, requireAuth, logout };
  window.MemberAPIReady = Promise.resolve(window.MemberAPI);

  // Also dispatch a custom event for pages that need to know when API is ready
  window.dispatchEvent(new CustomEvent('memberapi-ready', { detail: window.MemberAPI }));
})();