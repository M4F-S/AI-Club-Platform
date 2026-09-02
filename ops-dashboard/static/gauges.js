"use strict";
/* ============================================================
   NEXUS — DialGauge (COCKPIT HUD ship instrument)
   270° dial · glowing value arc · ticks · tapered needle ·
   hub flash on change · count-up via numEl.
   API (unchanged): new DonutRingGauge(canvas, {label, metric, center})
        g.setValue(v) · g.resize() · g.refreshColor()
   ============================================================ */
(() => {
  const CSS = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const METRIC_VAR = { cpu: "--cpu", ram: "--ram", disk: "--disk" };

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return [53, 224, 255];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const lighten = (hex, amt) => {
    const [r, g, b] = hexToRgb(hex);
    const l = (v) => Math.min(255, Math.round(v + (255 - v) * amt));
    return `rgb(${l(r)},${l(g)},${l(b)})`;
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // 270° dial — start bottom-left, sweep clockwise over the top
  const SWEEP = (270 / 180) * Math.PI;
  const START = (135 / 180) * Math.PI;

  class DonutRingGauge {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.metric = canvas.dataset.metric || opts.metric || "cpu";
      this.label = opts.label || canvas.dataset.label || this.metric.toUpperCase();
      this.color = opts.color || "";
      this.center = opts.center !== undefined ? opts.center : (canvas.dataset.center !== "0");
      this.numEl = opts.numEl || null;
      this.value = 0;
      this.target = 0;
      this.anim = 0;
      this.drawn = false;
      this.lastTarget = null;
      this._pulseT = 0;
      this._frame = 0;
      this._color = "";
      this.resize();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    currentColor() {
      if (this.color) return this.color;
      if (!this._color || this._frame % 20 === 0) {
        this._color = CSS(METRIC_VAR[this.metric] || "--cpu") || "#35E0FF";
      }
      return this._color;
    }

    refreshColor() { /* re-reads CSS vars every 20 frames */ }

    resize() {
      const parent = this.canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : { width: 0, height: 0 };
      const w = rect.width || 122;
      const h = rect.height || 122;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
    }

    setValue(v) {
      const t = Math.max(0, Math.min(100, v == null ? 0 : v));
      this.target = t;
      if (this.lastTarget !== null && Math.abs(t - this.lastTarget) > 1.2) {
        this._pulseT = 1;
      }
      this.lastTarget = t;
    }

    loop() {
      this._frame++;
      // pause heavy canvas work while the gauge's view is hidden (perf)
      const hidden = this.canvas.offsetParent === null;
      if (!hidden) {
        if (!this.drawn) {
          this.anim = Math.min(1, this.anim + 0.035);
          this.value = this.target * easeOutCubic(this.anim);
          if (this.anim >= 1) this.drawn = true;
        } else {
          this.value += (this.target - this.value) * 0.08;
          if (Math.abs(this.target - this.value) < 0.04) this.value = this.target;
        }
        if (this._pulseT > 0) this._pulseT = Math.max(0, this._pulseT - 0.045);
        this.draw();
        if (this.numEl) {
          const r = Math.round(this.value);
          this.numEl.innerHTML = `${r}<small>%</small>`;
        }
      } else {
        // keep value synced so it is correct when the view becomes visible
        if (this.drawn) {
          this.value = this.target;
        } else {
          this.anim = Math.min(1, this.anim + 0.035);
          this.value = this.target * easeOutCubic(this.anim);
          if (this.anim >= 1) this.drawn = true;
        }
      }
      requestAnimationFrame(this.loop);
    }

    _ang(pct) { return START + SWEEP * pct; }

    draw() {
      const ctx = this.ctx;
      const w = this.w, h = this.h;
      const cx = w / 2, cy = h / 2 + 3;
      const r = Math.min(cx, cy) - 17;
      const color = this.currentColor();
      const pct = Math.max(0, Math.min(100, this.value)) / 100;

      ctx.clearRect(0, 0, w, h);

      // 1) track — wide faint arc (hologram rail)
      ctx.beginPath();
      ctx.arc(cx, cy, r, START, START + SWEEP);
      ctx.strokeStyle = rgba(color, 0.08);
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.stroke();
      // rail hairline
      ctx.beginPath();
      ctx.arc(cx, cy, r, START, START + SWEEP);
      ctx.strokeStyle = CSS("--border") || "rgba(93,232,255,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 2) value arc — glowing hologram
      if (pct > 0.004) {
        const aEnd = this._ang(pct);
        ctx.save();
        const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        grad.addColorStop(0, lighten(color, 0.4));
        grad.addColorStop(0.55, color);
        grad.addColorStop(1, rgba(color, 0.55));
        ctx.beginPath();
        ctx.arc(cx, cy, r, START, aEnd);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.shadowColor = rgba(color, 0.9);
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();

        // inner highlight hairline
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, START, aEnd);
        ctx.strokeStyle = rgba(233, 243, 255, 0.25);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }

      // 3) ticks — minor every 3°, major every 15° (instrument dial)
      ctx.save();
      ctx.font = '8.5px "Share Tech Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let deg = 0; deg <= 270; deg += 3) {
        const ang = START + (deg / 270) * SWEEP;
        const major = deg % 15 === 0;
        const r1 = r + (major ? 7 : 3);
        const r2 = r + (major ? 13 : 8);
        ctx.strokeStyle = major ? rgba(color, 0.9) : rgba(97, 128, 159, 0.35);
        ctx.lineWidth = major ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        ctx.stroke();
        if (major) {
          ctx.fillStyle = CSS("--text-3") || "#61809F";
          ctx.fillText(String(Math.round((deg / 270) * 100)), cx + Math.cos(ang) * (r + 19), cy + Math.sin(ang) * (r + 19));
        }
      }
      ctx.restore();

      // 4) tapered needle (polygon) with glow tip
      const ang = this._ang(pct);
      const tipX = cx + Math.cos(ang) * (r - 11);
      const tipY = cy + Math.sin(ang) * (r - 11);
      const tailX = cx - Math.cos(ang) * 10;
      const tailY = cy - Math.sin(ang) * 10;
      ctx.save();
      ctx.shadowColor = rgba(color, 0.8);
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#E9F3FF";
      ctx.beginPath();
      ctx.moveTo(cx - 1.6, cy);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(cx + 1.6, cy);
      ctx.lineTo(tailX, tailY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 5) hub — metric disc + white core
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = rgba(color, 0.9);
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, 5.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#E9F3FF";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6) hub flash ring on live change (150ms feel)
      if (this._pulseT > 0) {
        ctx.save();
        ctx.globalAlpha = this._pulseT * 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(cx, cy, 9 + (1 - this._pulseT) * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 7) center value — big display count-up (Chakra Petch)
      if (this.center) {
        const rv = Math.round(this.value);
        const fs = Math.round(Math.min(w * 0.19, 27));
        ctx.save();
        ctx.font = `700 ${fs}px "Chakra Petch", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tg = ctx.createLinearGradient(0, cy + 10 - fs / 2, 0, cy + 10 + fs / 2);
        tg.addColorStop(0, lighten(color, 0.5));
        tg.addColorStop(1, color);
        ctx.shadowColor = rgba(color, 0.6);
        ctx.shadowBlur = 14;
        ctx.fillStyle = tg;
        ctx.fillText(rv + "%", cx, cy + 10);
        ctx.restore();
      }
    }
  }

  window.DonutRingGauge = DonutRingGauge;
  window.ParticleFlowGauge = DonutRingGauge;
})();
