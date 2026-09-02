"use strict";
/* ============================================================
   NEXUS — Firework Cursor (lightweight vanilla canvas port of
   originkit.dev "Firework Cursor": particle field trails the
   pointer, bursts on click, drift + bloom, additive glow).
   Palette follows the dashboard tokens (mint/peri/cyan).
   Auto-pauses when idle · respects prefers-reduced-motion ·
   ~5KB, no deps, pointer-events none.
   ============================================================ */
(() => {
  const reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  const CSS = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const PALETTE = () => [
    CSS("--cpu") || "#E8462C",
    CSS("--ram") || "#FFFBD4",
    CSS("--disk") || "#F59E0B",
    CSS("--accent") || "#E8462C",
  ];

  const canvas = document.createElement("canvas");
  canvas.id = "firework-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;z-index:95;pointer-events:none;width:100vw;height:100vh;" +
    "opacity:1;transition:opacity .6s ease;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  const P = [];           // particles
  const MAX_P = 320;      // hard cap (slim + battery)
  let mouse = { x: W / 2, y: H / 2 };
  let lastEvent = 0;
  let awake = false;
  let fade = 1;

  function spawn(x, y, opts = {}) {
    if (P.length >= MAX_P) P.shift();
    const palette = PALETTE();
    const color = opts.color || palette[(Math.random() * palette.length) | 0];
    const angle = opts.angle != null ? opts.angle : Math.random() * Math.PI * 2;
    const speed = opts.speed != null ? opts.speed : 0.6 + Math.random() * 1.6;
    P.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (opts.rise || 0),
      life: 0,
      maxLife: opts.maxLife || 40 + Math.random() * 45,
      size: opts.size || (0.7 + Math.random() * 1.7),
      color,
      gravity: opts.gravity != null ? opts.gravity : 0.045,
      drag: 0.985,
      driftA: Math.random() * Math.PI * 2,
      driftS: 0.05 + Math.random() * 0.12,
    });
  }

  function burst(x, y) {
    const n = 26 + ((Math.random() * 14) | 0);
    for (let i = 0; i < n; i++) {
      spawn(x, y, { speed: 1.2 + Math.random() * 3.2, maxLife: 45 + Math.random() * 55, rise: 0.4 });
    }
  }

  function trail(x, y) {
    spawn(x, y, { speed: 0.3 + Math.random() * 0.9, maxLife: 22 + Math.random() * 18, size: 0.5 + Math.random() * 1.1 });
  }

  function wake() {
    if (!awake) { awake = true; requestAnimationFrame(loop); }
  }

  function loop() {
    const now = performance.now();
    // idle: fade out and sleep
    if (now - lastEvent > 2500) {
      fade = Math.max(0, fade - 0.03);
      if (fade <= 0) { awake = false; P.length = 0; canvas.style.opacity = "0"; return; }
    } else {
      fade = Math.min(1, fade + 0.06);
    }
    canvas.style.opacity = String(fade);

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";   // additive glow

    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life++;
      if (p.life >= p.maxLife) { P.splice(i, 1); continue; }
      p.driftA += 0.02;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx + Math.sin(p.driftA) * p.driftS;
      p.y += p.vy;
      if (p.y > H + 30 || p.x < -30 || p.x > W + 30) { P.splice(i, 1); continue; }

      const t = 1 - p.life / p.maxLife;          // 1 → 0
      ctx.globalAlpha = t * t * 0.9;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 7 * t + 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";

    requestAnimationFrame(loop);
  }

  // throttled trail emission while moving
  let lastTrail = 0;
  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    lastEvent = performance.now();
    if (!awake) { fade = 1; canvas.style.opacity = "1"; wake(); }
    const now = performance.now();
    if (now - lastTrail > 18) {           // ~55 particles/sec of trail
      lastTrail = now;
      trail(mouse.x + (Math.random() - 0.5) * 4, mouse.y + (Math.random() - 0.5) * 4);
    }
  }, { passive: true });

  window.addEventListener("pointerdown", (e) => {
    lastEvent = performance.now();
    if (!awake) { fade = 1; canvas.style.opacity = "1"; wake(); }
    burst(e.clientX, e.clientY);
  }, { passive: true });
})();
