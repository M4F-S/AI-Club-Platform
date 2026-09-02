"use strict";
/* Nexus frontend — Cosmic Fusion (Fleet Dashboard) */

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

const state = {
  me: null,
  fleet: [],
  metrics: { host: {}, agents_up: 0, agents_total: 0, containers: [] },
  history: [],
  currentAgent: null,
  logPaused: false,
  logStream: null,
  theme: "dark",
};

const AGENT_IMG = {
  "hermes-agent": "avatar_toy.jpg",
  "hermes-assistant": "avatar_old.jpg",
  "hermes-pentest": "avatar_pencil.jpg",
  "hermes-marketing": "avatar_candy.jpg",
  "hermes-trader": "avatar_coin.jpg",
  "charness": "avatar_charness.jpg",
  "c-agent": "avatar_charness.jpg",
  "c_agent": "avatar_charness.jpg",
};

const AGENT_COLOR = {
  "hermes-agent": "toy",
  "hermes-assistant": "old",
  "hermes-pentest": "pencil",
  "hermes-marketing": "candy",
  "hermes-trader": "coin",
  "charness": "charness",
  "c-agent": "charness",
  "c_agent": "charness",
};

async function api(path, opts={}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 401) { showLogin(); throw new Error("unauthorized"); }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function toast(msg, kind="") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${kind}`;
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), 3200);
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function fmtDur(s) {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMem(stats) {
  if (!stats || stats.mem_used == null) return "—";
  const used = stats.mem_used;
  const total = stats.mem_total;
  if (used < 100 * 1024 * 1024) {
    const uMB = (used / (1024 * 1024)).toFixed(1);
    const tGB = total ? (total / 1e9).toFixed(1) + "G" : "host";
    return `${uMB}M / ${tGB}`;
  }
  const uGB = (used / 1e9).toFixed(1);
  const tGB = total ? (total / 1e9).toFixed(1) + "G" : "host";
  return `${uGB}G / ${tGB}`;
}

/* ---------------- auth ---------------- */
function showLogin() {
  $("#login-view").classList.remove("hidden");
  $("#shell").classList.add("hidden");
  $("#modal").classList.add("hidden");
}

async function showShell() {
  state.me = await api("/api/me");
  $("#login-view").classList.add("hidden");
  $("#shell").classList.remove("hidden");
  $("#copilot-fab").classList.remove("hidden");
  $("#page-title").textContent = "Fleet";
  refreshAll();
  initPfGauges();
  setInterval(refreshFleet, 10000);
  setInterval(refreshTopbar, 5000);
  window.addEventListener("resize", () => Object.values(__pfGauges).forEach((g) => g.resize()));
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error");
  err.classList.add("hidden");
  const btn = $("#login-btn"), lbl = $("#login-btn-label");
  const ld = $("#login-loader");
  btn.disabled = true; lbl.textContent = "Sign in"; ld.classList.remove("hidden");
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ username: $("#u-name").value.trim(), password: $("#u-pass").value }) });
    await showShell();
  } catch (x) {
    err.textContent = x.message; err.classList.remove("hidden");
    btn.disabled = false; lbl.textContent = "Sign in"; ld.classList.add("hidden");
  }
});

$("#logout-btn2")?.addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  location.reload();
});

$("#logout-btn3")?.addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  location.reload();
});

$("#refresh-btn").addEventListener("click", () => {
  const b = $("#refresh-btn");
  b.classList.remove("spinning"); void b.offsetWidth; b.classList.add("spinning");
  setTimeout(() => b.classList.remove("spinning"), 700);
  refreshAll();
});

setInterval(() => {
  const c = $("#clock");
  if (c) c.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
}, 1000);

$("#theme-toggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = state.theme;
});

/* ---------------- navigation ---------------- */
function goView(view) {
  $$(".mn-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".side-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v => v.classList.remove("active"));
  const el = $("#view-" + view);
  if (el) el.classList.add("active");
  const names = { overview: "Fleet", vps: "VPS", containers: "Containers", cron: "Cron", backups: "Backups", updates: "Updates", audit: "Audit", users: "Users" };
  $("#page-title").textContent = names[view] || view;
  $("#more-sheet").classList.add("hidden");
  if (view === "overview" || view === "vps") { refreshVps(); if (view === "vps") setTimeout(() => Object.values(__pfGauges).forEach(g => g.resize()), 50); }
  if (view === "containers") refreshContainers();
  if (view === "cron") refreshCron();
  if (view === "backups") refreshBackups();
  if (view === "updates") refreshUpdates();
  if (view === "audit") refreshAudit();
  if (view === "users") refreshUsers();
  if (history.replaceState) { try { history.replaceState(null, "", "#" + view); } catch {} }
}

$$(".mn-item[data-view]").forEach(btn => btn.addEventListener("click", () => goView(btn.dataset.view)));
$$(".side-item[data-view]").forEach(btn => btn.addEventListener("click", () => goView(btn.dataset.view)));
$("#mn-more")?.addEventListener("click", () => $("#more-sheet").classList.toggle("hidden"));
$$(".more-sheet .nav-item[data-view]").forEach(btn => btn.addEventListener("click", () => goView(btn.dataset.view)));

/* ---------------- refresh loop ---------------- */
async function refreshAll() {
  await Promise.all([refreshFleet(), refreshTopbar(), refreshCronCount()]);
  refreshSummary();
  try {
    const h = await api("/api/metrics/history?hours=24");
    state.history = h.points;
    drawSparklines();
  } catch {}
  if ($("#view-overview").classList.contains("active") || $("#view-vps").classList.contains("active")) drawHistory();
}

async function refreshTopbar() {
  try {
    const m = await api("/api/metrics/current");
    state.metrics = m;
    const hm = m.host || {};
    setPill("pill-cpu", hm.cpu_pct);
    setPill("pill-ram", (hm.mem || {}).pct);
    setPill("pill-disk", ((hm.disk || [{}])[0] || {}).pct);
    setPill("pill-agents", m.agents_up, m.agents_total);
    // VPS page canvas gauges
    setPfGauge("gauge-cpu-canvas", hm.cpu_pct);
    setPfGauge("gauge-mem-canvas", (hm.mem || {}).pct);
    setPfGauge("gauge-disk-canvas", ((hm.disk || [{}])[0] || {}).pct);
    // Fleet (home) page canvas gauges
    setPfGauge("gauge-cpu-home", hm.cpu_pct);
    setPfGauge("gauge-ram-home", (hm.mem || {}).pct);
    setPfGauge("gauge-disk-home", ((hm.disk || [{}])[0] || {}).pct);
    // gauge side-notes with real values
    const mem = hm.mem || {};
    const disk0 = (hm.disk || [{}])[0] || {};
    const gB = (b) => (b == null ? "—" : (b / 1e9).toFixed(1) + "G");
    const setNote = (id, t) => { const el = $("#" + id); if (el) el.textContent = t; };
    setNote("gauge-note-cpu", hm.cores ? hm.cores + " cores" : "host cpu");
    setNote("gauge-note-mem", gB(mem.used) + " / " + gB(mem.total));
    setNote("gauge-note-disk", gB(disk0.used) + " / " + gB(disk0.total));
    refreshSummary();
    drawSparklines();
  } catch {}
}

function setPill(id, v, total) {
  const p = $("#" + id);
  if (!p) return;
  const txt = v == null ? "—" : total != null ? `${v}/${total}` : (Math.round(v) + "%");
  const b = p.querySelector("b");
  if (b.textContent !== txt) {
    b.textContent = txt;
    p.classList.remove("ppulse");
    void p.offsetWidth;
    p.classList.add("ppulse");
  }
}

function setGauge(arcId, valId, v) {
  const arc = $("#" + arcId);
  if (!arc) return;
  const pct = Math.max(0, Math.min(100, v == null ? 0 : v));
  const C = 2 * Math.PI * 15.9155;
  arc.setAttribute("stroke-dasharray", (pct / 100 * C).toFixed(1) + ", " + C.toFixed(1));
  const el = $("#" + valId);
  if (el) el.textContent = v == null ? "—" : Math.round(pct) + "%";
}

const __pfGauges = {};
function initPfGauges() {
  document.querySelectorAll("canvas.pf-gauge").forEach((cv) => {
    if (__pfGauges[cv.id]) return;
    const metric = cv.dataset.metric || "cpu";
    const suffix = metric === "ram" ? "mem" : metric;
    __pfGauges[cv.id] = new DonutRingGauge(cv, {
      label: cv.dataset.label || "",
      metric,
      numEl: document.getElementById("gauge-num-" + suffix),
    });
  });
}

function setPfGauge(id, v) {
  const g = __pfGauges[id];
  if (g) g.setValue(v);
}

function refreshSummary() {
  const m = state.metrics;
  const cEl = $("#sum-containers");
  if (cEl && m.containers) {
    const up = m.containers.filter(c => c.running).length;
    cEl.innerHTML = `${up}/${m.containers.length} <span class="ok">Running</span>`;
  }
}

async function refreshCronCount() {
  try {
    const r = await api("/api/cron");
    let n = 0;
    Object.values(r).forEach(jobs => { n += (jobs || []).length; });
    const el = $("#sum-cron");
    if (el) el.innerHTML = `${n} <span class="sched">Scheduled</span>`;
  } catch {}
}

/* ---------------- fleet ---------------- */
async function refreshFleet() {
  try {
    const r = await api("/api/fleet");
    state.fleet = r.agents || [];
    const fc = $("#fleet-count");
    if (fc) fc.textContent = `(${state.fleet.length})`;
    renderFleet();
  } catch {}
}

function renderFleet() {
  const list = $("#fleet-list");
  if (!list) return;
  if (!state.fleet.length) {
    list.innerHTML = `<div class="glass-card agent-card"><div class="muted" style="font-size:12px">No agents discovered.</div></div>`;
    return;
  }
  list.innerHTML = state.fleet.map(a => {
    const up = a.status === "running";
    const cls = a.status;
    const imgName = AGENT_IMG[a.name] || "avatar_toy.jpg";
    const color = AGENT_COLOR[a.name] || "toy";
    const stats = fmtMem(a.stats);
    const isNativeC = a.arch === "native_c" || a.name.includes("charness") || a.name.includes("c_agent") || a.name.includes("c-agent");
    const archBadge = isNativeC
      ? `<span class="badge-arch native-c">C99 NATIVE</span>`
      : `<span class="badge-arch hermes">HERMES</span>`;
    const lastLog = a.heartbeat_ts ? new Date(a.heartbeat_ts * 1000).toLocaleTimeString() : "—";
    return `<div class="glass-card agent-card liquidGL ${cls}" data-name="${esc(a.name)}">
      <div class="agent-left">
        <div class="agent-avatar-wrap">
          <div class="agent-avatar ${color}"><img src="/static/images/${imgName}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="${esc(a.name)}"></div>
          <span class="agent-status-dot ${cls}"></span>
        </div>
        <div>
          <div class="agent-name-row">
            <span class="agent-name">${esc(a.friendly || a.name)}</span>
            <span class="status-tag ${cls}">${esc(a.status)}</span>
            ${archBadge}
          </div>
          <div class="agent-meta">Uptime: <strong>${fmtDur(a.uptime_s)}</strong> · Memory: <strong>${stats}</strong></div>
          <div class="agent-lastlog">Last activity: ${esc(lastLog)}</div>
        </div>
      </div>
      <div class="eq">
        <div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div>
      </div>
    </div>`;
  }).join("");
  $$("#fleet-list .agent-card").forEach(el => el.addEventListener("click", () => openAgent(el.dataset.name)));
}

/* ---------------- sparklines (SVG path from history) ---------------- */
function drawSparklines() {
  const pts = state.history;
  if (!pts.length) return;
  const toPath = (vals) => {
    if (vals.length < 2) return "";
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = (max - min) || 1;
    const step = 50 / (vals.length - 1);
    const coords = vals.map((v, i) => [i * step, 9 - ((v - min) / span) * 8]);
    let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const p0 = coords[i-1], p1 = coords[i];
      const mx = (p0[0] + p1[0]) / 2;
      d += ` Q ${mx.toFixed(1)} ${p0[1].toFixed(1)}, ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
    }
    return d;
  };
  const cpu = pts.map(p => p.cpu).filter(v => v != null).slice(-24);
  const ram = pts.map(p => p.mem_total ? p.mem_used/p.mem_total*100 : null).filter(v => v != null).slice(-24);
  const disk = pts.map(p => p.disk_total ? p.disk_used/p.disk_total*100 : null).filter(v => v != null).slice(-24);
  const sp = (id, vals) => { const el = $("#" + id); if (el) el.querySelector("path").setAttribute("d", toPath(vals) || "M0 5 L50 5"); };
  sp("spark-cpu", cpu); sp("spark-ram", ram); sp("spark-disk", disk);
}

/* ---------------- VPS (gauges + history chart) ---------------- */
async function refreshVps() {
  await refreshTopbar();
  const hm = state.metrics.host || {};
  const load = hm.load || [];
  const up = fmtDur(hm.uptime_s);
  const strip = $("#stat-strip");
  if (strip) strip.innerHTML = `
    <div class="glass-card stat-card"><div class="k">Load (1/5/15)</div><div class="v">${load.map(x=>x==null?"—":x.toFixed(2)).join(" / ")}</div></div>
    <div class="glass-card stat-card"><div class="k">Host uptime</div><div class="v">${up}</div></div>
    <div class="glass-card stat-card"><div class="k">Containers up</div><div class="v">${(state.metrics.containers||[]).filter(c=>c.running).length}/${(state.metrics.containers||[]).length}</div></div>
    <div class="glass-card stat-card"><div class="k">Agents up</div><div class="v">${state.metrics.agents_up}/${state.metrics.agents_total}</div></div>`;
  drawHistory();
}

/* ---- history chart: 3D glass tube lines (matching reference video) ---- */
let __tubeChart = null;
function drawHistory() {
  const c = $("#chart-history");
  if (!c) return;
  if (!__tubeChart) __tubeChart = new TubeChart(c);
  
  const wrap = c.parentElement;
  let W = wrap ? wrap.clientWidth : 1100;
  if (W === 0) W = 1100;
  W = Math.max(280, Math.min(1100, W - 8));
  
  const H = c.height || 200;
  
  __tubeChart.render(state.history, W, H);
}

/* ---------------- containers ---------------- */
async function refreshContainers() {
  try {
    const r = await api("/api/containers");
    const tb = $("#cont-table tbody");
    const list = Array.isArray(r.containers) ? r.containers : (Array.isArray(r) ? r : []);
    tb.innerHTML = list.map(c => {
      let ports = "—";
      try {
        if (Array.isArray(c.ports)) {
          ports = c.ports.map(p => `${p.ip||""}:${p.public}→${p.private}`).join(", ") || "—";
        } else if (c.ports && typeof c.ports === "object") {
          ports = Object.entries(c.ports).map(([proto, arr]) => (arr||[]).map(p => `${p.HostIp||""}:${p.HostPort||""} ${proto}`).join(", ")).filter(Boolean).join("; ") || "—";
        }
      } catch {}
      return `<tr>
        <td><b>${esc(c.name)}</b></td><td>${esc(c.image)}</td>
        <td><span class="status-tag ${esc(c.status)}">${esc(c.status)}</span></td>
        <td>${esc(c.restart_policy)}</td><td class="muted">${esc(ports)}</td>
      </tr>`;
    }).join("");
  } catch {}
}
$("#cont-refresh")?.addEventListener("click", refreshContainers);

/* ---------------- cron ---------------- */
async function refreshCron() {
  try {
    const r = await api("/api/cron");
    const grid = $("#cron-grid");
    grid.innerHTML = Object.entries(r).map(([agent, jobs]) => `
      <div class="glass-card cron-agent liquidGL"><h3>${esc(agent)}</h3>
        ${jobs.length ? jobs.map(j => `<div class="cron-job">
            <div class="jname">${esc(j.name || "?")} ${j.enabled ? "" : "(disabled)"}</div>
            <div class="jmeta">⏱ ${esc(j.schedule && (j.schedule.display || j.schedule.expr) || j.schedule || "—")} · last ${esc(j.last_run||"—")} · next ${esc(j.next_run||"—")}</div>
          </div>`).join("") : `<div class="muted" style="font-size:12px">no jobs</div>`}
      </div>`).join("");
  } catch {}
}

/* ---------------- backups ---------------- */
async function refreshBackups() {
  try {
    const r = await api("/api/backups");
    const tb = $("#backup-table tbody");
    const list = Array.isArray(r.backups) ? r.backups : [];
    tb.innerHTML = list.length ? list.map(f => `<tr><td style="font-size:11px">${esc(f)}</td></tr>`).join("")
      : `<tr><td class="muted">none yet</td></tr>`;
    $("#backup-actions").innerHTML = state.fleet.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(30,41,59,.6)">
        <b style="font-size:13px">${esc(a.friendly || a.name)}</b>
        <button class="btn btn-sm" data-bk="${a.name}">Backup</button>
      </div>`).join("");
    $$("[data-bk]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(`Back up ${b.dataset.bk}?`)) return;
      try { const x = await api("/api/backups/run", { method: "POST", body: JSON.stringify({ agent: b.dataset.bk }) });
        toast(x.file || "done", "ok"); refreshBackups(); } catch (e) { toast(e.message, "err"); }
    }));
  } catch {}
}

/* ---------------- updates ---------------- */
async function refreshUpdates() {
  try {
    const r = await api("/api/updates");
    $("#latest-release").textContent = r.latest && r.latest.tag ? `· latest: ${r.latest.tag}` : (r.latest && r.latest.error ? `· ${r.latest.error}` : "");
    $("#update-table tbody").innerHTML = r.agents.map(a => `<tr>
      <td><b>${esc(a.name)}</b></td><td>${esc(a.image)}</td><td>${esc(a.image_created || "—")}</td>
    </tr>`).join("");
  } catch {}
}

/* ---------------- audit ---------------- */
async function refreshAudit() {
  try {
    const r = await api("/api/audit");
    const rows = Array.isArray(r) ? r : (r.audit || r.entries || []);
    $("#audit-table tbody").innerHTML = rows.slice(0, 50).map(a => `<tr>
      <td>${esc(new Date((a.ts || 0) * 1000).toLocaleString())}</td>
      <td>${esc(a.user || "")}</td><td>${esc(a.action || "")}</td><td>${esc(a.target || "")}</td>
      <td style="font-size:11px">${esc(a.detail || "")}</td>
    </tr>`).join("");
  } catch {}
}

/* ---------------- users ---------------- */
async function refreshUsers() {
  try {
    const r = await api("/api/users");
    const rows = Array.isArray(r) ? r : (r.users || []);
    $("#user-table tbody").innerHTML = rows.map(u => `<tr>
      <td>${esc(u.id)}</td><td><b>${esc(u.username)}</b></td><td>${esc(u.role)}</td>
      <td>${esc(new Date((u.created_at || 0) * 1000).toLocaleDateString())}</td>
      <td>${u.username !== state.me?.username ? `<button class="btn btn-sm" data-del="${u.id}">Delete</button>` : ""}</td>
    </tr>`).join("");
    $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Delete user?")) return;
      try { await api("/api/users/" + b.dataset.del, { method: "DELETE" }); refreshUsers(); } catch (e) { toast(e.message, "err"); }
    }));
  } catch {}
}

$("#user-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify({ username: $("#u-name2").value.trim(), password: $("#u-pass2").value, role: $("#u-role").value }) });
    toast("User created", "ok"); $("#u-name2").value = ""; $("#u-pass2").value = ""; refreshUsers();
  } catch (x) { toast(x.message, "err"); }
});

$("#pw-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/password", { method: "POST", body: JSON.stringify({ old: $("#pw-old").value, new: $("#pw-new").value }) });
    toast("Password changed", "ok"); $("#pw-old").value = ""; $("#pw-new").value = "";
  } catch (x) { toast(x.message, "err"); }
});

/* ---------------- agent modal + logs ---------------- */
async function openAgent(name) {
  try {
    const r = await api("/api/agents/" + name);
    const a = r.agent || r;
    state.currentAgent = name;
    $("#modal-title").textContent = a.friendly || a.name;
    $("#modal-sub").textContent = `${a.name} · ${a.id || ""} · ${a.status}`;
    const stats = fmtMem(a.stats);
    const isNativeC = a.arch === "native_c" || a.name.includes("charness");
    
    let extraHtml = "";
    if (a.model) {
      extraHtml += `<div><b>Model:</b> <span class="badge-model">${esc(a.model)}</span></div>`;
    }
    if (a.bot && a.bot.ok && a.bot.username) {
      extraHtml += `<div><b>Telegram Bot:</b> <span style="color:var(--accent-2)">@${esc(a.bot.username)}</span></div>`;
    }
    if (isNativeC && a.memory_stats) {
      const ms = a.memory_stats;
      extraHtml += `
        <div class="memory-grid">
          <div class="m-stat"><span class="mk">Memories:</span> <b>${ms.total_memories || 0}</b></div>
          <div class="m-stat"><span class="mk">Sessions:</span> <b>${ms.sessions_count || 0}</b></div>
          <div class="m-stat"><span class="mk">Timeline:</span> <b>${ms.timeline_events || 0}</b></div>
          <div class="m-stat"><span class="mk">Memory DB:</span> <b>${ms.db_size_kb || 0} KB</b></div>
        </div>`;
    }

    $("#modal-meta").innerHTML = `
      <div><b>Status:</b> <span class="status-tag ${esc(a.status)}">${esc(a.status)}</span></div>
      <div><b>Uptime:</b> ${fmtDur(a.uptime_s)}</div>
      <div><b>RAM Footprint:</b> ${stats}</div>
      <div><b>Engine / Image:</b> <span style="font-size:11.5px;color:var(--text-2);">${esc(a.image || "—")}</span></div>
      ${extraHtml}`;
    const canAct = state.me.role !== "readonly";
    $("#modal-controls").innerHTML = canAct ? `
      <button class="btn btn-sm btn-primary" data-act="restart">Restart</button>
      <button class="btn btn-sm btn-ghost" data-act="stop">Stop</button>
      <button class="btn btn-sm btn-ghost" data-act="start">Start</button>` : "";
    $$("#modal-controls [data-act]").forEach(b => b.addEventListener("click", async () => {
      const act = b.dataset.act;
      if (["stop","restart"].includes(act) && !confirm(`Confirm ${act} of ${name}?`)) return;
      try { await api(`/api/agents/${name}/control?action=${act}`, { method: "POST" }); toast(`${name} ${act} OK`, "ok"); setTimeout(() => refreshFleet(), 2500); } catch (x) { toast(x.message, "err"); }
    }));
    $("#modal").classList.remove("hidden");
    startLogs(name);
  } catch (x) { toast(x.message, "err"); }
}

$("#modal-close")?.addEventListener("click", () => { $("#modal").classList.add("hidden"); stopLogs(); });

function startLogs(name) {
  stopLogs();
  state.logPaused = false;
  const poll = async () => {
    try {
      const res = await fetch("/api/agents/" + name + "/logs?tail=80", { credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const txt = await res.text();
      let lines;
      if (ct.includes("application/json")) {
        const j = JSON.parse(txt);
        lines = j.logs || j.lines || (Array.isArray(j) ? j : []);
      } else {
        lines = txt.split("\n");
      }
      if (!state.logPaused) {
        const view = $("#log-view");
        if (view) {
          view.textContent = lines.filter(l => String(l).trim()).join("\n");
          view.scrollTop = view.scrollHeight;
        }
      }
    } catch {}
  };
  poll();
  state.logStream = setInterval(poll, 4000);
}

function stopLogs() { if (state.logStream) { clearInterval(state.logStream); state.logStream = null; } }
$("#log-pause")?.addEventListener("click", () => { state.logPaused = !state.logPaused; $("#log-pause").textContent = state.logPaused ? "Resume" : "Pause"; });
$("#log-clear")?.addEventListener("click", () => { $("#log-view").textContent = ""; });

/* ---------------- copilot (v4) ---------------- */
const copilot = { history: [], busy: false, pending: [] };

function cpMsg(html, cls = "cmsg-bot") {
  const d = document.createElement("div");
  d.className = `cmsg ${cls}`;
  d.innerHTML = html;
  $("#copilot-msgs").appendChild(d);
  $("#copilot-msgs").scrollTop = $("#copilot-msgs").scrollHeight;
  return d;
}

function cpTable(t) {
  if (!t || !t.columns || !t.rows || !t.rows.length) return "";
  let h = t.columns.map(c => `<th>${esc(String(c))}</th>`).join("");
  let b = t.rows.slice(0, 14).map(r =>
    `<tr>${r.map(c => `<td>${esc(String(c == null ? "—" : c))}</td>`).join("")}</tr>`).join("");
  return `<div class="copilot-table"><div class="ct-title">${esc(t.title || "")}</div>
    <table><thead><tr>${h}</tr></thead><tbody>${b}</tbody></table></div>`;
}

$("#copilot-fab")?.addEventListener("click", () => {
  $("#copilot-drawer-wrap").classList.toggle("hidden");
  if (!$("#copilot-drawer-wrap").classList.contains("hidden")) { setTimeout(() => $("#copilot-text").focus(), 50); pendingRefresh(); }
});

$("#copilot-close")?.addEventListener("click", () => $("#copilot-drawer-wrap").classList.add("hidden"));
$("#copilot-send")?.addEventListener("click", copilotSend);
$("#copilot-text")?.addEventListener("keydown", e => { if (e.key === "Enter") copilotSend(); });

async function pendingRefresh() {
  try {
    const r = await api("/api/copilot/pending");
    copilot.pending = r.pending || [];
  } catch { copilot.pending = []; }
  const box = $("#copilot-pending");
  if (!box) return;
  const items = copilot.pending.filter(p => p.expires_at * 1000 > Date.now());
  if (!items.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = items.map(p => {
    const secs = Math.max(0, Math.round((p.expires_at * 1000 - Date.now()) / 1000));
    const pw = p.reauth ? `<input type="password" class="p-reauth" placeholder="password" autocomplete="off">` : "";
    return `<div class="p-item" data-rid="${esc(p.run_id)}">
      <div class="p-title">⚠ ${esc(p.label)} <span class="p-ttl">${secs}s</span></div>
      <div class="p-args">${esc(JSON.stringify(p.args))}</div>
      <div class="p-btns">${pw}
        <button class="btn btn-sm btn-primary" data-ok="1">Approve</button>
        <button class="btn btn-sm btn-ghost" data-ok="0">Deny</button>
      </div></div>`;
  }).join("");
  $$("#copilot-pending .p-item").forEach(el => {
    $$(".p-btns button", el).forEach(b => b.addEventListener("click", () => copilotDecide(el.dataset.rid, b.dataset.ok === "1", el)));
  });
}

async function copilotSend() {
  const inp = $("#copilot-text");
  const msg = inp.value.trim();
  if (!msg || copilot.busy) return;
  inp.value = "";
  cpMsg(esc(msg), "cmsg-user");
  copilot.history.push({ role: "user", content: msg });
  copilot.busy = true;
  const sendBtn = $("#copilot-send");
  sendBtn.disabled = true; sendBtn.textContent = "…";
  let answer = null, pending = null, tables = [];
  try {
    try {
      const resp = await fetch("/api/copilot/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: copilot.history.slice(0, -1) }),
        credentials: "same-origin",
      });
      if (!resp.ok || !(resp.headers.get("content-type") || "").includes("text/event-stream")) throw new Error("sse unavailable");
      const shell = cpMsg(`<div class="cmsg-body"></div>`, "cmsg-bot");
      const bodyDiv = shell.querySelector(".cmsg-body");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "", got = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const line = part.trim().startsWith("data:") ? part.trim().slice(5).trim() : "";
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          got = true;
          if (ev.type === "pending") { pending = ev.pending; tables = ev.tables || []; }
          else if (ev.type === "tool_result") { tables = ev.tables || []; }
          else if (ev.type === "delta") { acc += ev.text; bodyDiv.innerHTML = esc(acc).replace(/\n/g, "<br>"); $("#copilot-msgs").scrollTop = $("#copilot-msgs").scrollHeight; }
          else if (ev.type === "done") { answer = acc || null; }
        }
      }
      if (!got || (answer === null && !pending)) throw new Error("empty stream");
    } catch {
      pending = null; tables = [];
      const r = await api("/api/copilot/chat", { method: "POST", body: JSON.stringify({ message: msg, history: copilot.history.slice(0, -1) }) });
      answer = r.answer || null; pending = r.pending || null; tables = r.tables || [];
    }
    copilot.history.push({ role: "assistant", content: answer || "…" });
    if (pending) {
      pendingRefresh();
    } else {
      for (const t of (tables || [])) cpMsg(cpTable(t));
      if (answer) cpMsg(esc(answer));
      else cpMsg("(no response)");
    }
  } catch (x) {
    cpMsg(esc("Error: " + x.message), "cmsg-error");
    copilot.history.pop();
  }
  copilot.busy = false;
  sendBtn.disabled = false; sendBtn.textContent = "Send";
  pendingRefresh();
}

async function copilotDecide(runId, ok, el) {
  const pwInput = el.querySelector(".p-reauth");
  const password = pwInput ? pwInput.value : "";
  try {
    const r = await api("/api/copilot/approve", { method: "POST", body: JSON.stringify({ run_id: runId, approve: ok, password }) });
    el.remove();
    if (r.ok) {
      cpMsg(`✅ <b>${esc(r.label || "executed")}</b>` + (r.summary ? `<br>${esc(r.summary)}` : ""));
      refreshFleet();
    } else if (r.error) {
      cpMsg(`✕ ${esc(r.error)}`, "cmsg-error");
    } else {
      cpMsg(`✕ ${esc(r.label || "denied")}`);
    }
    pendingRefresh();
  } catch (x) { cpMsg(esc("Error: " + x.message), "cmsg-error"); }
}

/* ---------------- init ---------------- */
(async function init() {
  try {
    await api("/api/me");
    await showShell();
  } catch {
    showLogin();
  }
})();
