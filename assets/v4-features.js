/* ================================================================
   V4 FEATURES — interactive layer (golden design, ported to apex)
   hero · ticker · odometers · reveals · orbit · hex · timeline ·
   constellation · manifesto · ring · morphs · footer · tab bar · Synapse
   ================================================================ */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const j = async (u, o) => { try { const r = await fetch(u, o); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const isHome = !!document.querySelector('.hero');

  /* ============ HERO: word-mask entrance ============ */
  const h1 = document.querySelector('.hero h1');
  if (h1 && !reduced) {
    const split = (node) => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(part => {
            if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span'); w.className = 'w';
            const wi = document.createElement('span'); wi.className = 'wi';
            wi.textContent = part; w.appendChild(wi); frag.appendChild(w);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) split(ch);
      });
    };
    split(h1);
    h1.querySelectorAll('.wi').forEach((w, i) => w.style.transitionDelay = (i * .08) + 's');
  }

  /* ============ HERO: parallax + magnetic + attractor hint ============ */
  if (isHome && !reduced) {
    const layers = [
      ['.hero h1', .16], ['.hero p', .28], ['.hero-actions', .38],
    ].map(([s, r]) => ({ el: document.querySelector(s), r })).filter(o => o.el);
    let tick = false;
    const plx = () => {
      const y = scrollY;
      if (y < innerHeight) layers.forEach(o => o.el.style.transform = `translateY(${y * o.r}px)`);
      tick = false;
    };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(plx); } }, { passive: true });

    document.querySelectorAll('.hero .btn-primary, .hero .btn-secondary, .hero-actions a').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * .18}px,${(e.clientY - (r.top + r.height / 2)) * .26}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
        el.style.transform = ''; setTimeout(() => el.style.transition = '', 600);
      });
    });

    // scroll hint
    if (!document.querySelector('.scroll-hint')) {
      const sh = document.createElement('div');
      sh.className = 'scroll-hint';
      sh.innerHTML = '<span>Scroll</span><span class="drop"></span>';
      document.querySelector('.hero')?.appendChild(sh);
    }
  }

  /* ============ ODOMETER helper ============ */
  function odometer(el, target) {
    if (el.dataset.odoDone === '1') return;
    el.dataset.odoDone = '1';
    const str = String(target);
    // measure one line height in px for exact clipping
    el.innerHTML = ''; el.classList.add('odo');
    const lh = parseFloat(getComputedStyle(el).fontSize) * 1.05 || 56;
    [...str].forEach((ch, i) => {
      const col = document.createElement('span'); col.className = 'odo-col';
      col.style.height = lh + 'px'; col.style.overflow = 'hidden';
      const strip = document.createElement('span'); strip.className = 'odo-strip';
      strip.style.display = 'flex'; strip.style.flexDirection = 'column';
      for (let d = 0; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = d; s.style.height = lh + 'px'; s.style.lineHeight = lh + 'px'; s.style.display = 'block';
        strip.appendChild(s);
      }
      col.appendChild(strip); el.appendChild(col);
      const final = +ch;
      const delay = 200 + i * 140 + Math.random() * 160;
      setTimeout(() => {
        strip.style.transition = 'transform 1.1s cubic-bezier(.16,1,.3,1)';
        strip.style.transform = `translateY(-${final * lh}px)`;
      }, delay);
    });
  }

  /* ============ STATS: odometers from /api/stats ============ */
  (async () => {
    const stats = await j('/api/stats');
    if (!stats) return;
    const els = document.querySelectorAll('[data-stat]');
    if (!els.length) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const key = e.target.getAttribute('data-stat');
      if (stats[key] != null) odometer(e.target, stats[key]);
      io.unobserve(e.target);
    }), { threshold: .5 });
    els.forEach(el => io.observe(el));
  })();

  /* ============ TICKER (injected after hero) ============ */
  (async () => {
    if (!isHome || document.getElementById('ticker')) return;
    const stats = await j('/api/stats') || {};
    const evs = await j('/api/events');
    const next = evs && evs.length ? evs.map(e => ({ ...e, d: e.event_date ? new Date(e.event_date) : null })).filter(e => e.d).sort((a, b) => a.d - b.d).find(e => e.d > new Date()) : null;
    const fmt = d => d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    const t = document.createElement('div');
    t.id = 'ticker';
    t.innerHTML = `<div class="ticker-track" id="ticker-track">
      <div class="tick"><span class="live"><i></i>Network live</span><span class="sep">◆</span></div>
      ${next ? `<div class="tick">Next event <b>${esc(next.title)} — ${fmt(next.d)}</b><span class="sep">◆</span></div>` : ''}
      <div class="tick">Members <b>${stats.members ?? '—'}</b><span class="sep">◆</span></div>
      <div class="tick">Workshops <b>${stats.workshops ?? '—'}</b><span class="sep">◆</span></div>
      <div class="tick">Events <b>${stats.events ?? '—'}</b><span class="sep">◆</span></div>
      <div class="tick">Projects <b>${stats.projects ?? '—'}</b><span class="sep">◆</span></div>
    </div>`;
    const hero = document.querySelector('.hero');
    if (hero) hero.after(t);
    const track = t.querySelector('.ticker-track');
    track.innerHTML += track.innerHTML; // seamless loop
  })();

  /* ============ WORD-SPLIT section titles ============ */
  if (!reduced) {
    let wi = 0;
    const splitWords = (node) => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 3) {
          const frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(part => {
            if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
            const rw = document.createElement('span'); rw.className = 'rw';
            const rwi = document.createElement('span'); rwi.className = 'rwi';
            rwi.style.transitionDelay = (wi++ * 50) + 'ms';
            rwi.textContent = part; rw.appendChild(rwi); frag.appendChild(rw);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1 && ch.tagName !== 'BR') splitWords(ch);
      });
    };
    const tio = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); tio.unobserve(e.target); }
    }), { threshold: .35 });
    document.querySelectorAll('.section-title, .s-title').forEach(t => {
      if (t.querySelector('.rw')) return;
      wi = 0; splitWords(t); tio.observe(t);
    });
  }

  /* ============ MISSION ORBIT (home, after about-grid) ============ */
  (() => {
    const about = document.querySelector('#about .about-grid, #about');
    if (!about || document.querySelector('.orbit-space')) return;
    const space = document.createElement('div');
    space.className = 'orbit-space';
    space.innerHTML = `<svg id="orbit-lines"></svg>
      <div class="o-center">PRINCIPLES<small>club.config</small></div>
      <div class="o-node" style="top:4%;left:32%;animation-delay:0s"><i></i>Student-led</div>
      <div class="o-node" style="top:24%;right:0%;animation-delay:-1.4s"><i></i>Vendor-neutral</div>
      <div class="o-node" style="bottom:22%;right:6%;animation-delay:-2.8s"><i></i>Learn by building</div>
      <div class="o-node" style="bottom:4%;left:26%;animation-delay:-3.6s"><i></i>Responsible use</div>
      <div class="o-node" style="top:28%;left:0%;animation-delay:-4.8s"><i></i>Privacy first</div>`;
    about.after(space);
    const svg = space.querySelector('#orbit-lines');
    const wire = () => {
      if (innerWidth <= 900) { svg.innerHTML = ''; return; }
      const sr = space.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
      const c = space.querySelector('.o-center').getBoundingClientRect();
      const cx = c.left - sr.left + c.width / 2, cy = c.top - sr.top + c.height / 2;
      svg.innerHTML = '';
      space.querySelectorAll('.o-node').forEach((n, i) => {
        const nr = n.getBoundingClientRect();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx); line.setAttribute('y1', cy);
        line.setAttribute('x2', nr.left - sr.left + nr.width / 2);
        line.setAttribute('y2', nr.top - sr.top + nr.height / 2);
        line.setAttribute('stroke', i % 2 ? 'rgba(77,227,193,.35)' : 'rgba(124,108,255,.4)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('class', 'o-link');
        svg.appendChild(line);
      });
    };
    addEventListener('resize', wire);
    setTimeout(wire, 120);
  })();

  /* ============ HEX TILT ============ */
  if (!reduced && matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('.hex').forEach((hx, i) => {
      const base = (i % 2 === 1 && innerWidth > 700) ? 22 : 0;
      hx.addEventListener('mousemove', e => {
        const r = hx.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        hx.style.setProperty('--mx', (px * 100) + '%');
        hx.style.setProperty('--my', (py * 100) + '%');
        hx.style.transform = `translateY(${base - 8}px) rotateX(${(py - .5) * -10}deg) rotateY(${(px - .5) * 12}deg)`;
      });
      hx.addEventListener('mouseleave', () => hx.style.transform = '');
    });
  }

  /* ============ EVENTS TIMELINE (injected, fed by /api/events) ============ */
  (async () => {
    if (!isHome || document.querySelector('.tl')) return;
    const evs = await j('/api/events');
    if (!evs || !evs.length) return;
    const sorted = evs.map(e => ({ ...e, d: e.event_date ? new Date(e.event_date) : null }))
      .sort((a, b) => (a.d || 0) - (b.d || 0));
    const now = new Date();
    const upcoming = sorted.filter(e => e.d && e.d >= now);
    const hotId = (upcoming[0] || sorted[sorted.length - 1])?.id;
    const fmt = e => e.d ? e.d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + e.d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'TBA';
    const sec = document.createElement('section');
    sec.id = 'events';
    sec.innerHTML = `<h2 class="section-title" data-v4-reveal>Events on the <span class="text-gradient">timeline.</span></h2>
      <p class="section-subtitle" data-v4-reveal>Workshops, build nights, and guest talks — click to open.</p>
      <div class="tl" data-v4-reveal><div class="tl-line"><i></i></div>
      <div class="tl-items">${sorted.slice(0, 4).map(e => `
        <div class="tl-item ${e.id === hotId ? 'hot' : ''}" onclick="location.href='/members/event.html?id=${e.id}'">
          <span class="tl-dot"></span>
          <div class="tl-date">${fmt(e)}</div>
          <h3>${esc(e.title)}</h3>
          <p>${esc((e.description || '').slice(0, 90))}${(e.description || '').length > 90 ? '…' : ''}</p>
          <span class="tl-chip">${esc(e.event_type || 'event')}</span>
        </div>`).join('')}</div>
      <span class="tl-pulse"></span><span class="tl-pulse p2"></span></div>`;
    const anchor = document.querySelector('#what-we-do');
    if (anchor) anchor.after(sec);
    // reveal + pulses + hover ripples
    sec.querySelectorAll('[data-v4-reveal]').forEach(el => {
      new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .16 }).observe(el);
    });
    if (!reduced) {
      sec.querySelectorAll('.section-title').forEach(t => {
        const tio2 = new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .35 });
        tio2.observe(t);
      });
      sec.querySelectorAll('.tl-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
          item.classList.add('flash');
          setTimeout(() => item.classList.remove('flash'), 750);
          const d = item.querySelector('.tl-dot').getBoundingClientRect();
          window.emitRipples?.(d.left + d.width / 2, d.top + d.height / 2, 2, 220);
        });
      });
    }
  })();

  /* ============ PROJECTS CONSTELLATION (fed by /api/resources) ============ */
  (async () => {
    if (!isHome || document.querySelector('.proj-grid')) return;
    const res = await j('/api/resources');
    if (!res || !res.length) return;
    const cols = ['var(--violet)', 'var(--mint)', 'var(--pink)'];
    const sec = document.createElement('section');
    sec.id = 'projects-feed';
    sec.innerHTML = `<h2 class="section-title" data-v4-reveal>The project <span class="text-gradient">constellation.</span></h2>
      <p class="section-subtitle" data-v4-reveal>Shipped by members.</p>
      <div class="proj-grid">${res.slice(0, 6).map((r, i) => `
        <div class="proj" data-v4-reveal>
          <span class="p-star" style="background:${cols[i % 3]};box-shadow:0 0 12px ${cols[i % 3]}"></span>
          <h3>${esc(r.title || 'Project')}</h3>
          <p>${esc((r.description || '').slice(0, 110))}</p>
          <div class="p-tags">${r.category ? `<span>${esc(r.category)}</span>` : ''}${r.url ? `<span>link</span>` : ''}</div>
        </div>`).join('')}</div>`;
    const anchor = document.getElementById('events');
    if (anchor) anchor.after(sec);
    sec.querySelectorAll('[data-v4-reveal]').forEach(el => {
      const io = new IntersectionObserver((es) => es.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        if (e.target.classList.contains('proj')) {
          const star = e.target.querySelector('.p-star');
          if (star) { const r = star.getBoundingClientRect(); window.emitBurst?.(r.left + r.width / 2, r.top + r.height / 2, 14, 2.4); }
          e.target.classList.add('burst');
          setTimeout(() => e.target.classList.remove('burst'), 900);
        }
        io.unobserve(e.target);
      }), { threshold: .25 });
      io.observe(el);
    });
  })();

  /* ============ MANIFESTO (line ignite) ============ */
  (() => {
    if (!isHome || document.querySelector('.mani')) return;
    const sec = document.createElement('section');
    sec.className = 'mani section-alt';
    sec.innerHTML = `<p class="mani-line">AI is becoming a <span class="hl">core skill</span> — for coding, for building, for thinking.</p>
      <p class="mani-line">But skill without <span class="hl">judgment</span> is just faster mistakes.</p>
      <p class="mani-line">So we learn the tools <span class="hl">and</span> their limits. The power <span class="hl">and</span> the responsibility.</p>
      <p class="mani-line">Peer to peer. Node to node. <span class="hl">That's the network.</span></p>`;
    const anchor = document.querySelector('#why');
    if (anchor) anchor.before(sec);
    if (!reduced) {
      const mio = new IntersectionObserver(es => es.forEach(e => {
        e.target.classList.toggle('lit', e.isIntersecting);
      }), { threshold: .85 });
      sec.querySelectorAll('.mani-line').forEach(el => mio.observe(el));
    } else {
      sec.querySelectorAll('.mani-line').forEach(el => el.classList.add('lit'));
    }
  })();

  /* ============ RESPONSIBLE calm zone ============ */
  document.getElementById('why')?.classList.add('calm-zone');

  /* ============ SECTION MORPHS ============ */
  if (!reduced) {
    const booted = performance.now();
    const sio = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting || performance.now() - booted < 2600) return;
      const left = Math.random() > .5;
      const x = left ? 6 : innerWidth - 6;
      const y = innerHeight * (.3 + Math.random() * .4);
      window.emitBurst?.(x, y, 10, 2.6);
      const d = document.createElement('span');
      d.className = 'morph-flash';
      d.style.left = (left ? 4 : innerWidth - 14) + 'px';
      d.style.top = y + 'px';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1200);
    }), { threshold: .3 });
    document.querySelectorAll('main section').forEach(s => sio.observe(s));
  }

  /* ============ FOOTER NODES ============ */
  (() => {
    const footer = document.querySelector('footer .footer-content, footer');
    if (!footer || document.querySelector('.f-nodes')) return;
    const nodes = document.createElement('div');
    nodes.className = 'f-nodes';
    nodes.innerHTML = `
      <a href="/" class="f-node"><span class="fn-dot"></span>Home</a>
      <a href="/become-member.html" class="f-node"><span class="fn-dot" style="background:var(--mint);box-shadow:0 0 13px var(--mint)"></span>Membership</a>
      <a href="/become-partner.html" class="f-node"><span class="fn-dot" style="background:var(--pink);box-shadow:0 0 13px var(--pink)"></span>Partners</a>
      <a href="/login.html" class="f-node"><span class="fn-dot" style="background:#5a8bff;box-shadow:0 0 13px #5a8bff"></span>Members</a>`;
    footer.prepend(nodes);
  })();

  /* ============ MOBILE TAB BAR (site-wide) ============ */
  (() => {
    if (document.querySelector('.m-nav')) return;
    const nav = document.createElement('div');
    nav.className = 'm-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');
    const member = location.pathname.startsWith('/members');
    nav.innerHTML = member
      ? `<a href="/members/"><i></i>Dash</a><a href="/members/events.html"><i></i>Events</a><a href="/members/resources.html"><i></i>Links</a><a href="/members/profile.html"><i></i>Profile</a><a href="/"><i></i>Site</a>`
      : `<a href="#about"><i></i>About</a><a href="#what-we-do"><i></i>Do</a><a href="#events"><i></i>Events</a><a href="#projects-feed"><i></i>Builds</a><a href="#join"><i></i>Join</a>`;
    document.body.appendChild(nav);
  })();
})();
