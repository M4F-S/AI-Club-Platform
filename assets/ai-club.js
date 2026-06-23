(function () {
  'use strict';

  const API_URL = '/ai-club/api';

  // Mobile menu
  function initMobileMenu() {
    const nav = document.querySelector('nav');
    const links = document.querySelector('.nav-links');
    if (!nav || !links) return;

    let btn = nav.querySelector('.mobile-menu-toggle');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'mobile-menu-toggle';
      btn.setAttribute('aria-label', 'Toggle menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span class="hamburger-icon">&#9776;</span>';
      nav.appendChild(btn);
    }

    function setIcon(open) {
      btn.innerHTML = open
        ? '<span class="hamburger-icon">&#10005;</span>'
        : '<span class="hamburger-icon">&#9776;</span>';
      btn.setAttribute('aria-expanded', String(open));
    }

    btn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      setIcon(open);
    });

    links.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        links.classList.remove('open');
        setIcon(false);
      });
    });

    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target) && links.classList.contains('open')) {
        links.classList.remove('open');
        setIcon(false);
      }
    });
  }

  // Toast notifications
  function showToast(message, type = 'info', duration = 5000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  // API helpers
  async function apiPost(path, body) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function apiGet(path) {
    const res = await fetch(`${API_URL}${path}`, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function apiDelete(path) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function apiPut(path, body) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  // Form status helper
  function setFormStatus(form, message, type) {
    let el = form.querySelector('.form-status');
    if (!el) {
      el = document.createElement('div');
      el.className = 'form-status';
      form.appendChild(el);
    }
    el.textContent = message;
    el.className = `form-status ${type} visible`;
  }

  function clearFormStatus(form) {
    const el = form.querySelector('.form-status');
    if (el) {
      el.className = 'form-status';
      el.textContent = '';
    }
  }

  // Generic JSON form handler
  function wireForm(selector, endpoint, successMessage, onSuccess) {
    const form = document.querySelector(selector);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormStatus(form);

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }

      const formData = new FormData(form);
      const body = Object.fromEntries(formData.entries());

      const { ok, data } = await apiPost(endpoint, body);

      if (submitBtn) {
        submitBtn.disabled = false;
        if (originalText) submitBtn.innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
      }

      if (ok) {
        setFormStatus(form, successMessage, 'success');
        form.reset();
        if (onSuccess) onSuccess(data);
      } else {
        setFormStatus(form, data.error || 'Something went wrong. Please try again.', 'error');
      }
    });
  }

  // Wire specific forms
  function initForms() {
    wireForm('#apply-form', '/apply', 'Application submitted! We will review it and email you soon.');
    wireForm('#contact-form', '/contact', 'Message sent! We will get back to you shortly.');
    wireForm('#partner-form', '/partner', 'Inquiry submitted! We will be in touch soon.');
  }

  // Current user badge for nav (only shown when logged in, to avoid duplicate Login links)
  async function updateNavAuth() {
    const { ok, data } = await apiGet('/member/me');
    const links = document.querySelector('.nav-links');
    if (!links) return;

    const existing = links.querySelector('.nav-auth');
    if (existing) existing.remove();

    if (!ok || !data.user) return;

    const li = document.createElement('li');
    li.className = 'nav-auth';
    const isAdmin = ['admin', 'superadmin'].includes(data.user.role);
    const target = isAdmin ? '/ai-club/admin.html' : '/ai-club/members/';
    const label = isAdmin ? 'Admin' : 'Members';
    li.innerHTML = `<a href="${target}" class="nav-cta">${label}</a>`;
    links.appendChild(li);
  }

  // Expose helpers globally for inline pages
  window.AIClub = {
    API_URL,
    apiPost,
    apiGet,
    apiPut,
    apiDelete,
    showToast,
    setFormStatus,
    clearFormStatus,
  };

  function boot() {
    initMobileMenu();
    initForms();
    updateNavAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
