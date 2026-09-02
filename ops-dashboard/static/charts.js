"use strict";
/* ============================================================
   NEXUS — HistoryAreaChart (smooth bezier + gradient area fill)
   Draw-in on first render · legend toggles · hover crosshair.
   API (kept for app.js): new TubeChart(canvas) · render(points, W, H)
   ============================================================ */
(() => {
  const CSS = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return [77, 227, 193];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  };
  const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

  class HistoryAreaChart {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.visible = { cpu: true, ram: true, disk: true };
      this.points = [];
      this.W = 0; this.H = 0;
      this.progress = 0;   // draw-in 0..1
      this._started = false;
      this.tooltip = opts.tooltip || document.getElementById("chart-tooltip") || null;
      this.hoverX = null;

      // legend toggle wiring ("action in the item")
      document.querySelectorAll("#chart-legend .legend-item").forEach((it) => {
        it.addEventListener("click", () => {
          const s = it.dataset.series;
          if (!s) return;
          this.visible[s] = !this.visible[s];
          it.classList.toggle("off", !this.visible[s]);
          this.render(this.points, this.W, this.H);
        });
      });

      // hover crosshair + tooltip
      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const n = this.points.length;
        if (!n) return;
        const idx = Math.max(0, Math.min(n - 1, Math.round((x - this.padL) / this.xStep)));
        this.hoverX = this.padL + idx * this.xStep;
        this.render(this.points, this.W, this.H);
        this._showTooltip(idx, e.clientX - rect.left, e.clientY - rect.top);
      });
      canvas.addEventListener("mouseleave", () => {
        this.hoverX = null;
        if (this.tooltip) this.tooltip.classList.remove("show");
        this.render(this.points, this.W, this.H);
      });
      this._loop();
      // slow pulse loop for end-dot breathing (~2 fps, cheap)
      setInterval(() => {
        if (this._started && this.W > 0) {
          this.pulsePhase = (Date.now() % 1200) / 1200;
          this.render(this.points, this.W, this.H);
        }
      }, 400);
    }

    _loop() {
      if (!this._started && this.W > 0 && this.points.length > 1) {
        this.progress = Math.min(1, this.progress + 0.045);   // ~600ms draw-in
        this.render(this.points, this.W, this.H);
        if (this.progress >= 1) { this._started = true; return; }
      }
      requestAnimationFrame(() => this._loop());
    }

    _showTooltip(idx, mx, my) {
      if (!this.tooltip) return;
      const p = this.points[idx];
      if (!p) return;
      const rows = [];
      const series = [
        { key: "cpu", label: "CPU", color: CSS("--cpu") || "#35E0FF", val: p.cpu },
        { key: "ram", label: "RAM", color: CSS("--ram") || "#8F7BFF", val: p.mem_total ? (p.mem_used / p.mem_total) * 100 : null },
        { key: "disk", label: "Disk", color: CSS("--disk") || "#FFB84D", val: p.disk_total ? (p.disk_used / p.disk_total) * 100 : null },
      ];
      series.forEach((s) => {
        if (!this.visible[s.key] || s.val == null) return;
        rows.push(`<div class="tt-row"><span class="tt-dot" style="background:${s.color}"></span>${s.label}<span class="tt-val">${Math.round(s.val)}%</span></div>`);
      });
      if (!rows.length) return;
      const time = p.ts ? new Date(p.ts * 1000).toLocaleTimeString() : "";
      this.tooltip.innerHTML = `<div class="tt-time" style="color:var(--text-3);margin-bottom:3px">${time}</div>` + rows.join("");
      this.tooltip.classList.add("show");
      const wrap = this.canvas.parentElement;
      const wrapW = wrap ? wrap.clientWidth : 800;
      const left = mx + 14;
      const top = Math.max(6, my - 34);
      this.tooltip.style.left = (left + 170 > wrapW ? mx - 180 : left) + "px";
      this.tooltip.style.top = top + "px";
    }

    render(points, W, H) {
      this.points = points || [];
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = W;
      this.H = 280;   // fixed logical height, matches CSS; ignore passed H (amplifies on redraw)
      const padL = 40, padR = 14, padT = 10, padB = 22;
      this.padL = padL;
      const iw = W - padL - padR;
      const ih = this.H - padT - padB;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      this.ctx.clearRect(0, 0, W, this.H);

      const pts = this.points;
      if (pts.length < 2) {
        this.ctx.fillStyle = CSS("--text-3") || "#64748b";
        this.ctx.font = '12px "Inter", sans-serif';
        this.ctx.textAlign = "center";
        this.ctx.fillText("No history yet — collecting samples…", W / 2, this.H / 2);
        return;
      }

      const xStep = iw / (pts.length - 1);
      this.xStep = xStep;

      // dynamic Y range (SciChart growBy style): auto-fit to visible data
      const allVals = [];
      if (this.visible.cpu) pts.forEach((p) => { if (p.cpu != null) allVals.push(p.cpu); });
      if (this.visible.ram) pts.forEach((p) => { if (p.mem_total) allVals.push((p.mem_used / p.mem_total) * 100); });
      if (this.visible.disk) pts.forEach((p) => { if (p.disk_total) allVals.push((p.disk_used / p.disk_total) * 100); });
      let yMin = 0, yMax = 100;
      if (allVals.length > 1) {
        const lo = Math.min(...allVals), hi = Math.max(...allVals);
        const span = Math.max(hi - lo, 8);
        yMin = Math.max(0, lo - span * 0.18);
        yMax = Math.min(100, hi + span * 0.18);
        if (yMax - yMin < 8) { yMin = Math.max(0, lo - 4); yMax = hi + 4; }
        // round to clean 5-unit ticks so axis labels stay legible
        yMin = Math.floor(yMin / 5) * 5;
        yMax = Math.ceil(yMax / 5) * 5;
        if (yMax - yMin < 10) yMax = yMin + 10;
        yMax = Math.min(100, Math.max(yMax, 20));
      }
      const yOf = (v) => padT + ih - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * ih;

      // grid + y labels — solid subtle lines, bright mono labels
      this.ctx.strokeStyle = rgba(CSS("--text-3") || "#61809F", 0.22);
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = CSS("--text-2") || "#A8C2E0";
      this.ctx.font = '11px "Share Tech Mono", monospace';
      this.ctx.textAlign = "right";
      const gSteps = 4;
      for (let g = 0; g <= gSteps; g++) {
        const val = yMin + ((yMax - yMin) * g) / gSteps;
        const y = yOf(val);
        this.ctx.beginPath();
        this.ctx.moveTo(padL, y);
        this.ctx.lineTo(W - padR, y);
        if (g === gSteps) this.ctx.strokeStyle = CSS("--border-strong") || "rgba(255,184,77,0.36)";
        this.ctx.stroke();
        if (g === gSteps) this.ctx.strokeStyle = rgba(CSS("--text-3") || "#61809F", 0.22);
        this.ctx.fillText(Math.round(val) + "%", padL - 7, y + 3);
      }

      // x time labels — bottom baseline + clean mono labels
      const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts;
      this.ctx.textAlign = "center";
      if (t0 && t1) {
        this.ctx.strokeStyle = CSS("--border") || "rgba(255,184,77,0.16)";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(padL, this.H - 22);
        this.ctx.lineTo(W - padR, this.H - 22);
        this.ctx.stroke();
        const labels = [
          { t: t0, l: "-24h" },
          { t: t0 + (t1 - t0) * 0.5, l: "-12h" },
          { t: t1, l: "now" },
        ];
        this.ctx.fillStyle = CSS("--text-2") || "#A8C2E0";
        this.ctx.font = '11px "Share Tech Mono", monospace';
        labels.forEach((lb) => {
          const xi = pts.reduce((best, p, i) => (Math.abs(p.ts - lb.t) < Math.abs(best.p.ts - lb.t) ? { p, i } : best), { p: pts[0], i: 0 }).i;
          const x = padL + xi * xStep;
          this.ctx.fillText(lb.l, x, this.H - 7);
        });
      }

      // series
      const series = [
        { key: "cpu", label: "CPU", color: CSS("--cpu") || "#35E0FF", vals: pts.map((p) => p.cpu) },
        { key: "ram", label: "RAM", color: CSS("--ram") || "#8F7BFF", vals: pts.map((p) => (p.mem_total ? (p.mem_used / p.mem_total) * 100 : null)) },
        { key: "disk", label: "Disk", color: CSS("--disk") || "#FFB84D", vals: pts.map((p) => (p.disk_total ? (p.disk_used / p.disk_total) * 100 : null)) },
      ];

      const drawCount = Math.max(2, Math.round(pts.length * this.progress));
      const validPts = (vals) => {
        const out = [];
        vals.forEach((v, i) => { if (v != null) out.push({ x: padL + i * xStep, y: yOf(v) }); });
        return out.filter((p) => p.x <= padL + drawCount * xStep);
      };

      // ============================================================
      // BAND CHART (SciChart FastBandRenderableSeries port):
      //   Band 1 — RAM upper edge (cream) ↔ CPU lower edge (red),
      //            split gradient fill (cream top → red bottom)
      //   Band 2 — Disk with fillLinearGradient (amber fade below)
      //   Sweep draw-in · 3px glowing strokes · breathing end dots
      // ============================================================
      const cpuS = series[0], ramS = series[1], diskS = series[2];
      const cpuPts = validPts(cpuS.vals);
      const ramPts = validPts(ramS.vals);
      const diskPts = validPts(diskS.vals);

      // BAND 1 fill — gradient between RAM (top) and CPU (bottom)
      if (this.visible.cpu && this.visible.ram && cpuPts.length > 1 && ramPts.length > 1) {
        const bandPath = new Path2D();
        bandPath.moveTo(ramPts[0].x, ramPts[0].y);
        for (let i = 1; i < ramPts.length; i++) bandPath.lineTo(ramPts[i].x, ramPts[i].y);
        for (let i = cpuPts.length - 1; i >= 0; i--) bandPath.lineTo(cpuPts[i].x, cpuPts[i].y);
        bandPath.closePath();
        const bandGrad = this.ctx.createLinearGradient(0, padT, 0, padT + ih);
        bandGrad.addColorStop(0, rgba(ramS.color, 0.12));
        bandGrad.addColorStop(0.5, rgba(ramS.color, 0.04));
        bandGrad.addColorStop(1, rgba(cpuS.color, 0.12));
        this.ctx.save();
        this.ctx.fillStyle = bandGrad;
        this.ctx.fill(bandPath);
        // subtle top-edge sheen (inner light on the band)
        this.ctx.restore();
      }

      // BAND 2 fill — Disk gradient below the line (fillLinearGradient style)
      if (this.visible.disk && diskPts.length > 1) {
        const diskArea = new Path2D();
        diskArea.moveTo(diskPts[0].x, diskPts[0].y);
        for (let i = 1; i < diskPts.length; i++) diskArea.lineTo(diskPts[i].x, diskPts[i].y);
        diskArea.lineTo(diskPts[diskPts.length - 1].x, padT + ih);
        diskArea.lineTo(diskPts[0].x, padT + ih);
        diskArea.closePath();
        const diskGrad = this.ctx.createLinearGradient(0, padT, 0, padT + ih);
        diskGrad.addColorStop(0, rgba(diskS.color, 0.12));
        diskGrad.addColorStop(1, rgba(diskS.color, 0.0));
        this.ctx.save();
        this.ctx.fillStyle = diskGrad;
        this.ctx.fill(diskArea);
        this.ctx.restore();
      }

      // strokes — holographic 2-pass: wide soft halo + bright core
      const strokeOrder = [
        { key: "ram", pts: ramPts, color: ramS.color },
        { key: "cpu", pts: cpuPts, color: cpuS.color },
        { key: "disk", pts: diskPts, color: diskS.color },
      ];
      strokeOrder.forEach((s) => {
        if (!this.visible[s.key] || s.pts.length < 2) return;
        const path = new Path2D(this._smoothPath(s.pts));
        const dashed = s.key === "disk";
        // pass 1 — halo
        this.ctx.save();
        this.ctx.globalAlpha = 0.22;
        this.ctx.strokeStyle = s.color;
        this.ctx.lineWidth = 4;
        this.ctx.lineJoin = "round";
        this.ctx.lineCap = "round";
        this.ctx.shadowColor = rgba(s.color, 0.7);
        this.ctx.shadowBlur = 8;
        if (dashed) this.ctx.setLineDash([6, 5]);
        this.ctx.stroke(path);
        this.ctx.restore();
        // pass 2 — bright core
        this.ctx.save();
        this.ctx.strokeStyle = s.color;
        this.ctx.lineWidth = 2.5;
        this.ctx.lineJoin = "round";
        this.ctx.lineCap = "round";
        if (dashed) this.ctx.setLineDash([6, 5]);
        this.ctx.stroke(path);
        this.ctx.restore();
      });

      // live pulse — latest point: white core + fading 3-dot ghost trail
      strokeOrder.forEach((s) => {
        if (!this.visible[s.key] || s.pts.length < 2) return;
        const last = s.pts[s.pts.length - 1];
        const breathe = 0.6 + 0.4 * Math.sin((this.pulsePhase || 0) * Math.PI * 2);
        // ghost trail (3 dots behind the head)
        for (let g = 1; g <= 3; g++) {
          const gi = Math.max(0, s.pts.length - 1 - g * 3);
          const gp = s.pts[gi];
          this.ctx.save();
          this.ctx.globalAlpha = 0.10 * (4 - g);
          this.ctx.fillStyle = s.color;
          this.ctx.beginPath();
          this.ctx.arc(gp.x, gp.y, 2.4, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();
        }
        // halo
        this.ctx.save();
        this.ctx.fillStyle = rgba(s.color, 0.20 * breathe);
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, 8 + 3 * breathe, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
        // colored body
        this.ctx.save();
        this.ctx.fillStyle = s.color;
        this.ctx.shadowColor = rgba(s.color, 0.9);
        this.ctx.shadowBlur = 16;
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, 3.2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
        // white core
        this.ctx.save();
        this.ctx.fillStyle = "#E9F3FF";
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, 1.6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      });

      // hover crosshair
      if (this.hoverX != null) {
        this.ctx.save();
        this.ctx.strokeStyle = CSS("--border-strong") || "rgba(148,163,184,0.3)";
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.hoverX, padT);
        this.ctx.lineTo(this.hoverX, padT + ih);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }

    _smoothPath(pts) {
      // catmull-rom -> bezier (from nexus-trendy-dashboard-viz recipe)
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
      return d;
    }
  }

  // keep the name app.js constructs; HistoryAreaChart is the real name
  const TubeChart = HistoryAreaChart;

  window.HistoryAreaChart = HistoryAreaChart;
  window.TubeChart = TubeChart;
})();
