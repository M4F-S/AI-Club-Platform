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

  // Header shadow on scroll
  function initHeaderScroll() {
    const header = document.querySelector('header');
    if (!header) return;
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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

  // Real stats loader
  async function loadStats() {
    const statEls = document.querySelectorAll('[data-stat]');
    if (statEls.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/stats`);
      if (!res.ok) return;
      const data = await res.json();
      statEls.forEach((el) => {
        const key = el.getAttribute('data-stat');
        if (data[key] !== undefined) el.textContent = data[key];
      });
    } catch (e) {
      // Silent fail: leave default text
    }
  }

  // Current user badge for nav (only shown when logged in)
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

  // Scroll-triggered animations
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

  // Canvas particle network
  function initParticles() {
    const canvas = document.getElementById('canvas-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let width, height, dpr;
    let particles = [];
    let mouse = { x: null, y: null };
    let rafId;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    }

    function buildParticles() {
      const area = width * height;
      const count = Math.min(70, Math.max(24, Math.floor(area / 22000)));
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          r: Math.random() * 1.8 + 1.2,
          baseAlpha: Math.random() * 0.3 + 0.6,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Subtle mouse repulsion
        if (mouse.x !== null) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const force = (140 - dist) / 140;
            p.x += (dx / dist) * force * 0.8;
            p.y += (dy / dist) * force * 0.8;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244, 63, 94, ${p.baseAlpha})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const fade = 1 - dist / 140;
            ctx.lineWidth = fade * 1.1;
            ctx.strokeStyle = `rgba(244, 63, 94, ${0.35 * fade})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
      mouse.x = null;
      mouse.y = null;
    });

    draw();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        draw();
      }
    });
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
    initHeaderScroll();
    initForms();
    loadStats();
    updateNavAuth();
    initScrollAnimations();
    initParticles();

    // Contact sent toast from redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('contact') === 'sent') {
      showToast('Message sent. We will get back to you soon.', 'success');
      history.replaceState(null, '', window.location.pathname);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
