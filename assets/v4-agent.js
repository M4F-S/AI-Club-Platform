/* ================================================================
   SYNAPSE — PageAgent (orb + panel + state machine, /api/agent)
   Site-wide. States: idle → thinking (ripples) → acting (light-trail
   + reticle) → done. Local intent fallback when agent unavailable.
   ================================================================ */
(() => {
  if (document.getElementById('orb')) return;

  /* ---- inject DOM ---- */
  const pulse = document.createElement('div'); pulse.id = 'pulse';
  document.body.appendChild(pulse);

  const orb = document.createElement('button');
  orb.id = 'orb'; orb.setAttribute('aria-label', 'Open Synapse AI agent');
  orb.innerHTML = `<svg viewBox="0 0 30 30" fill="none">
    <circle cx="15" cy="15" r="4.5" fill="#4DE3C1"/>
    <circle cx="5" cy="6" r="2.4" fill="#F2F0FF"/><circle cx="25" cy="8" r="2.4" fill="#F2F0FF"/>
    <circle cx="6" cy="25" r="2.4" fill="#F2F0FF" opacity=".8"/><circle cx="24" cy="23" r="2.4" fill="#F2F0FF" opacity=".8"/>
    <path d="M7 7.5 12 12M23 9.5 18 12.5M7.5 23 12 18M22.5 21.5 18 17.5" stroke="#4DE3C1" stroke-width="1.1" opacity=".7"/>
  </svg>`;
  document.body.appendChild(orb);

  const panel = document.createElement('div');
  panel.id = 'agent-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Synapse AI agent');
  panel.innerHTML = `
  <div class="ap-head">
    <span class="aph-orb"></span>
    <h4>SYNAPSE</h4>
    <span class="ap-status" id="ap-status"><i></i>Standing by</span>
  </div>
  <div class="ap-body" id="ap-body">
    <div class="ap-msg agent"><span class="who">Synapse · in-page operator</span>
      I'm wired into this site. Ask me about events, workshops, joining, or the club — <b>I navigate, you watch.</b>
    </div>
  </div>
  <div class="ap-chips">
    <button data-q="When is the next event?">Next event</button>
    <button data-q="How do I join the club?">How to join</button>
    <button data-q="What workshops are there?">Workshops</button>
    <button data-q="What is the club's mission?">Mission</button>
  </div>
  <form class="ap-input" id="ap-form">
    <input id="ap-text" type="text" placeholder="Ask or command…" autocomplete="off">
    <button type="submit" aria-label="Send">
      <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </form>`;
  document.body.appendChild(panel);

  const body = panel.querySelector('#ap-body');
  const form = panel.querySelector('#ap-form');
  const input = panel.querySelector('#ap-text');
  const statusEl = panel.querySelector('#ap-status');
  const setStatus = s => statusEl.innerHTML = '<i></i>' + s;
  const orbCenter = () => { const r = orb.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  const toggle = force => {
    const open = force ?? !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    if (open) setTimeout(() => input.focus(), 350);
  };
  orb.addEventListener('click', () => toggle());
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(true); }
    if (e.key === 'Escape') toggle(false);
  });

  /* ---- attention behaviors ---- */
  let lastAct = performance.now(), orbHover = false;
  ['mousemove', 'click', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => lastAct = performance.now(), { passive: true }));
  orb.addEventListener('mouseenter', () => orbHover = true);
  orb.addEventListener('mouseleave', () => { orbHover = false; orb.style.transform = ''; });
  setInterval(() => {
    if (performance.now() - lastAct > 20000 && !panel.classList.contains('open')) {
      orb.classList.add('nudge');
      setTimeout(() => orb.classList.remove('nudge'), 1450);
      lastAct = performance.now();
    }
  }, 5000);
  addEventListener('mousemove', e => {
    if (orbHover || panel.classList.contains('open')) return;
    const r = orb.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
    orb.style.transform = d < 190 ? `translate(${dx * .07}px,${dy * .07}px)` : '';
  }, { passive: true });

  /* ---- message rendering ---- */
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const addMsg = (who, text, typed) => {
    const div = document.createElement('div');
    div.className = 'ap-msg ' + (who === 'agent' ? 'agent' : 'user');
    div.innerHTML = `<span class="who">${who === 'agent' ? 'Synapse' : 'You'}</span><span class="txt"></span>`;
    body.appendChild(div);
    const txt = div.querySelector('.txt');
    if (!typed) { txt.innerHTML = fmt(text); body.scrollTop = body.scrollHeight; return Promise.resolve(); }
    return new Promise(res => {
      const plain = String(text); let i = 0;
      const caret = '<span class="ap-caret"></span>';
      (function type() {
        i += 2;
        txt.innerHTML = fmt(plain.slice(0, i)) + (i < plain.length ? caret : '');
        body.scrollTop = body.scrollHeight;
        if (i < plain.length) setTimeout(type, 12);
        else { txt.innerHTML = fmt(plain); res(); }
      })();
    });
  };

  /* ---- navigation targets (apex anchors + member pages) ---- */
  const NAV = [
    [/event|next|workshop|when|schedule|talk/i, '#events'],
    [/join|apply|member|sign ?up|register/i, '#join'],
    [/mission|about|who|purpose|principle/i, '#about'],
    [/activit|what we do|workshop type/i, '#what-we-do'],
    [/project|build|ship|resource|link/i, '#projects-feed'],
    [/stat|member count|how many/i, '#stats'],
    [/contact|email|partner|sponsor/i, '#contact'],
  ];
  function navTarget(q) {
    for (const [re, sel] of NAV) { if (re.test(q) && document.querySelector(sel)) return sel; }
    return null;
  }

  function travelTo(selector) {
    return new Promise(res => {
      const el = document.querySelector(selector);
      if (!el) return res();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const from = orbCenter();
        const r = el.getBoundingClientRect();
        const to = { x: r.left + r.width / 2, y: Math.min(Math.max(r.top + r.height / 2, 80), innerHeight - 80) };
        pulse.style.opacity = '1';
        pulse.animate([
          { transform: `translate(${from.x}px,${from.y}px) translate(-50%,-50%) scale(1)` },
          { transform: `translate(${(from.x + to.x) / 2}px,${(from.y + to.y) / 2 - 60}px) translate(-50%,-50%) scale(1.5)`, offset: .5 },
          { transform: `translate(${to.x}px,${to.y}px) translate(-50%,-50%) scale(1)` },
        ], { duration: 750, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).onfinish = () => {
          pulse.style.opacity = '0';
          el.classList.add('targeted');
          setTimeout(() => el.classList.remove('targeted'), 2400);
          res();
        };
      }, 700);
    });
  }

  /* ---- local fallback intents ---- */
  const ROUTES = [
    { re: /event|next|workshop|when/i, target: '#events', msg: 'Taking you to the events timeline — the next workshop is marked hot pink.' },
    { re: /join|apply|member|sign ?up|register/i, target: '#join', msg: 'Activation is four fields in the ring below — name, email, 42 login, one honest line.' },
    { re: /mission|about|purpose/i, target: '#about', msg: 'Core directive: practical AI skills plus the judgment to use them well. Scrolling you there.' },
  ];

  let busy = false;
  async function handle(q) {
    if (busy || !q.trim()) return;
    busy = true;
    await addMsg('user', q);
    orb.classList.add('thinking');
    setStatus('Processing');
    const oc = orbCenter();
    window.emitRipples?.(oc.x, oc.y, 3, 280);

    let reply = null;
    try {
      const r = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, action: 'answer' }) });
      if (r.ok) reply = (await r.json()).reply;
    } catch (e) { /* local fallback */ }

    if (reply) {
      setStatus('Answering');
      await addMsg('agent', reply, true);
      const target = navTarget(q);
      if (target) { setStatus('Navigating'); await travelTo(target); }
      setStatus('Done');
    } else {
      const route = ROUTES.find(r => r.re.test(q));
      if (route && document.querySelector(route.target)) {
        setStatus('Navigating');
        await addMsg('agent', route.msg, true);
        await travelTo(route.target);
        setStatus('Done');
      } else {
        await addMsg('agent', 'I can navigate this site for you — try **"next event"**, **"how do I join"**, or **"what\'s the mission"**.', true);
        setStatus('Standing by');
      }
    }
    orb.classList.remove('thinking');
    setTimeout(() => setStatus('Standing by'), 2200);
    busy = false;
  }

  form.addEventListener('submit', e => { e.preventDefault(); handle(input.value); input.value = ''; });
  panel.querySelectorAll('.ap-chips button').forEach(b => b.addEventListener('click', () => handle(b.dataset.q)));
})();
