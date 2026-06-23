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
      window.location.href = '../login.html';
      return null;
    }
    return data.user;
  }

  function renderNav(user) {
    const nav = document.querySelector('.member-nav');
    if (!nav) return;

    const adminLink = user.role === 'superadmin' || user.role === 'admin'
      ? '<li><a href="../admin.html"><i data-lucide="shield"></i> Admin</a></li>'
      : '';

    nav.innerHTML = `
      <ul>
        <li><a href="index.html" class="${location.pathname.endsWith('/members/index.html') || location.pathname.endsWith('/members/') ? 'active' : ''}"><i data-lucide="layout-dashboard"></i> Dashboard</a></li>
        <li><a href="blog/index.html" class="${location.pathname.includes('/members/blog') ? 'active' : ''}"><i data-lucide="newspaper"></i> Blog</a></li>
        <li><a href="resources.html" class="${location.pathname.includes('resources.html') ? 'active' : ''}"><i data-lucide="book-open"></i> Resources</a></li>
        <li><a href="events.html" class="${location.pathname.includes('events.html') ? 'active' : ''}"><i data-lucide="calendar"></i> Events</a></li>
        <li><a href="perks.html" class="${location.pathname.includes('perks.html') ? 'active' : ''}"><i data-lucide="gift"></i> Perks</a></li>
        <li><a href="profile.html" class="${location.pathname.includes('profile.html') ? 'active' : ''}"><i data-lucide="user"></i> Profile</a></li>
        ${adminLink}
      </ul>
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
    window.location.href = '../login.html';
  }

  async function boot() {
    const user = await requireAuth();
    if (!user) return;

    updateHeader(user);
    renderNav(user);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    document.body.classList.add('loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.MemberAPI = { api, requireAuth, logout };
})();
