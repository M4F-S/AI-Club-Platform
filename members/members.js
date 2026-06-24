(function () {
  'use strict';

  const API_URL = '/ai-club/api';

  async function api(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }

  async function requireAuth() {
    const { ok, data } = await api('/member/me');
    if (!ok) {
      window.location.href = '/ai-club/login.html';
      return null;
    }
    return data.user;
  }

  function renderNav(user) {
    const nav = document.querySelector('.member-nav');
    if (!nav) return;

    const MEMBER_BASE = '/ai-club/members/';

    const adminLink = user.role === 'superadmin' || user.role === 'admin'
      ? `<li><a href="/ai-club/admin.html" class="${location.pathname.includes('/admin.html') ? 'active' : ''}"><i data-lucide="shield"></i> Admin</a></li>`
      : '';

    const path = location.pathname;
    const isDashboard = path === '/ai-club/members/index.html' || path === '/ai-club/members/';

    nav.innerHTML = `
      <ul>
        <li><a href="${MEMBER_BASE}index.html" class="${isDashboard ? 'active' : ''}"><i data-lucide="layout-dashboard"></i> Dashboard</a></li>
        <li><a href="${MEMBER_BASE}blog/index.html" class="${path.includes('/members/blog') ? 'active' : ''}"><i data-lucide="newspaper"></i> Blog</a></li>
        <li><a href="${MEMBER_BASE}resources.html" class="${path.includes('/members/resources.html') ? 'active' : ''}"><i data-lucide="book-open"></i> Resources</a></li>
        <li><a href="${MEMBER_BASE}events.html" class="${path.includes('/members/events.html') ? 'active' : ''}"><i data-lucide="calendar"></i> Events</a></li>
        <li><a href="${MEMBER_BASE}perks.html" class="${path.includes('/members/perks.html') ? 'active' : ''}"><i data-lucide="gift"></i> Perks</a></li>
        <li><a href="${MEMBER_BASE}profile.html" class="${path.includes('/members/profile.html') ? 'active' : ''}"><i data-lucide="user"></i> Profile</a></li>
        ${adminLink}
      </ul>
      <div class="member-exit">
        <a href="/ai-club/">
          <i data-lucide="arrow-left"></i> Public site
        </a>
      </div>
      <button class="mobile-nav-toggle" id="mobile-nav-toggle" aria-label="Toggle navigation"><i data-lucide="menu"></i></button>
    `;

    const toggle = document.getElementById('mobile-nav-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        nav.querySelector('ul').classList.toggle('open');
      });
    }

    if (window.lucide) lucide.createIcons();
  }

  function updateHeader(user) {
    const el = document.getElementById('user-name');
    if (el) el.textContent = user.name;
    const welcome = document.getElementById('welcome-name');
    if (welcome) welcome.textContent = user.name.split(' ')[0];
  }

  async function logout() {
    await api('/member/logout', { method: 'POST' });
    window.location.href = '/ai-club/login.html';
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

  window.MemberAPI = { api, requireAuth, logout };
})();
