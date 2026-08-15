/* 42 Berlin AI Club — Scroll World
   Scroll-scrubbed fly-through of a neural network diorama.
   Palette A: bg #060612 · mint #4DE3C1 · periwinkle #7C6CFF (tokens in DESIGN.md) */
(function () {
  'use strict';

  /* ================= Setup ================= */
  var canvas = document.getElementById('world');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setClearColor(0x060612);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060612, 0.0095);

  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(-14, 7, 18);

  var MINT = 0x4DE3C1, PERI = 0x7C6CFF, LAV = 0xF2F0FF, POP = 0xFF6EC7, BLUE = 0x5a8bff, CORAL = 0xff5a8b;

  function mat(hex, o) {
    o = o || {};
    return new THREE.MeshBasicMaterial({
      color: hex,
      transparent: !!o.t,
      opacity: o.opacity == null ? 1 : o.opacity,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !(o.add || o.t)
    });
  }

  /* ================= Shared world ================= */
  // floor
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 140),
    mat(0x08081c)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(50, -0.2, -1);
  scene.add(floor);

  // grid
  var grid = new THREE.GridHelper(300, 75, MINT, MINT);
  grid.position.set(50, -0.18, -1);
  grid.material.transparent = true;
  grid.material.opacity = 0.08;
  scene.add(grid);

  // neural field particles
  (function () {
    var N = 1100, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    var palette = [new THREE.Color(MINT), new THREE.Color(PERI), new THREE.Color(LAV), new THREE.Color(POP)];
    for (var i = 0; i < N; i++) {
      pos[i * 3] = -22 + Math.random() * 154;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = -20 + Math.random() * 40;
      var c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(pts);
  })();

  // network backbone lines (scene centers connected)
  var SCENES = [
    { name: 'THE CORE', pos: new THREE.Vector3(0, 0, 0) },
    { name: 'WORKSHOP LAB', pos: new THREE.Vector3(14, 0, -6) },
    { name: 'SIGNAL PATHS', pos: new THREE.Vector3(30, 0, 2) },
    { name: 'CONSTELLATION', pos: new THREE.Vector3(46, 3, -4) },
    { name: 'COMPUTE', pos: new THREE.Vector3(64, 0, 2) },
    { name: 'QUIET NODE', pos: new THREE.Vector3(80, -1, -4) },
    { name: 'JOIN NODE', pos: new THREE.Vector3(100, 1, 0) }
  ];
  (function () {
    var verts = [];
    for (var i = 0; i < SCENES.length - 1; i++) {
      verts.push(SCENES[i].pos.x, SCENES[i].pos.y + 0.4, SCENES[i].pos.z);
      verts.push(SCENES[i + 1].pos.x, SCENES[i + 1].pos.y + 0.4, SCENES[i + 1].pos.z);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    var line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: PERI, transparent: true, opacity: 0.28 }));
    scene.add(line);
  })();

  /* ================= Anim registry ================= */
  var anims = [];
  function addAnim(fn) { anims.push(fn); }

  /* ================= Scene 1 — The Core ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[0].pos); scene.add(g);
    var core = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 32), mat(MINT, { t: true, opacity: 0.9 }));
    var hot = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 24), mat(0xffffff, { t: true, opacity: 0.95, add: true }));
    var shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 1), mat(PERI, { t: true, opacity: 0.45, add: true }));
    shell.material.wireframe = true;
    g.add(core); g.add(hot); g.add(shell);
    var rings = [];
    [[3.6, 0, 0, 0.04, MINT], [4.2, 1, 0.4, 0.03, PERI], [4.8, 0.6, 1.1, 0.025, LAV]].forEach(function (r) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(r[0], r[4] === LAV ? r[3] : r[3] * 2, 8, 64), mat(r[4], { t: true, opacity: 0.7, add: true }));
      ring.rotation.x = r[1]; ring.rotation.y = r[2];
      g.add(ring); rings.push(ring);
    });
    var sats = [];
    for (var i = 0; i < 10; i++) {
      var s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + Math.random() * 0.14), mat(Math.random() < 0.5 ? MINT : PERI, { add: true, opacity: 0.9 }));
      s.userData = { rad: 5.2 + Math.random() * 2.2, speed: (0.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), y: (Math.random() - 0.5) * 2.4, phase: Math.random() * Math.PI * 2 };
      g.add(s); sats.push(s);
    }
    addAnim(function (t) {
      var p = 1 + Math.sin(t * 2.2) * 0.06;
      core.scale.setScalar(p); hot.scale.setScalar(1 + Math.sin(t * 2.2 + 0.6) * 0.14);
      rings.forEach(function (r, idx) { r.rotation.z = t * (0.25 + idx * 0.08); r.rotation.x += 0.001; });
      sats.forEach(function (s) {
        var u = s.userData;
        s.position.set(Math.cos(t * u.speed + u.phase) * u.rad, Math.sin(t * 1.4 + u.phase) * 0.6 + u.y, Math.sin(t * u.speed + u.phase) * u.rad);
        s.rotation.x += 0.02; s.rotation.y += 0.02;
      });
    });
  })();

  /* ================= Scene 2 — Workshop Lab ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[1].pos); scene.add(g);
    var pad = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 32), mat(0x0d0d24));
    pad.position.y = 0; g.add(pad);
    var desks = [];
    [[-2.4, -1.6], [2.4, -1.6], [-2.4, 1.6], [2.4, 1.6]].forEach(function (d) {
      var desk = new THREE.Group();
      var base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.9), mat(0x131332));
      base.position.y = 0.55; desk.add(base);
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.6), mat(MINT, { add: true, opacity: 0.85 }));
      scr.position.set(0, 1.15, 0.05); scr.rotation.x = -0.12; desk.add(scr);
      desk.position.set(d[0], 0, d[1]);
      var ang = Math.atan2(-d[1], -d[0]); // face center
      desk.rotation.y = ang;
      g.add(desk); desks.push(desk);
    });
    var ped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 1.1), mat(0x181840));
    ped.position.y = 0.8; g.add(ped);
    var pedScr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), mat(PERI, { add: true, opacity: 0.9 }));
    pedScr.position.y = 1.35; pedScr.rotation.x = -0.2; g.add(pedScr);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8), mat(MINT, { t: true, opacity: 0.5, add: true }));
    beam.position.y = 3.2; g.add(beam);
    addAnim(function (t) {
      desks.forEach(function (d, i) { d.children[1].material.opacity = 0.55 + Math.sin(t * 2 + i) * 0.3; });
      pedScr.material.opacity = 0.65 + Math.sin(t * 1.6 + 1) * 0.25;
    });
  })();

  /* ================= Scene 3 — Signal Paths ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[2].pos); scene.add(g);
    var hub = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 20), mat(MINT, { add: true, opacity: 0.95 }));
    g.add(hub);
    var lanes = [];
    var defs = [
      [0, 0, 9.5, MINT], [0.5, 0.25, 9, PERI], [-0.5, 0.2, 9, LAV],
      [1.1, -0.2, 8.6, MINT], [-1.1, -0.15, 8.6, PERI], [0, 0.55, 8.8, POP]
    ];
    defs.forEach(function (d, i) {
      var end = new THREE.Vector3(d[0] * 4.2, d[1] * 4.2, d[2]);
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0.4), end), 20, 0.16, 8, false),
        mat(d[3], { t: true, opacity: 0.55, add: true })
      );
      g.add(tube);
      var node = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), mat(d[3], { add: true, opacity: 0.9 }));
      node.position.copy(end); g.add(node);
      lanes.push({ tube: tube, node: node, phase: i * 1.1 });
    });
    addAnim(function (t) {
      lanes.forEach(function (l) {
        l.tube.material.opacity = 0.35 + Math.sin(t * 1.8 + l.phase) * 0.25;
        l.node.scale.setScalar(1 + Math.sin(t * 3 + l.phase) * 0.2);
      });
    });
  })();

  /* ================= Scene 4 — Project Constellation ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[3].pos); scene.add(g);
    var hub = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 20), mat(MINT, { add: true, opacity: 0.95 }));
    g.add(hub);
    var stars = [];
    var defs = [
      [2.6, 1.4, 0.6, MINT, 0.6], [-2.2, 1.8, 1.2, PERI, 0.5], [1.8, -1.6, 1.8, POP, 0.45],
      [-2.8, -1.2, 0.4, BLUE, 0.55], [0.4, 2.2, -1.4, CORAL, 0.4], [-0.6, -2.4, -1.2, LAV, 0.5]
    ];
    defs.forEach(function (d) {
      var s = new THREE.Mesh(new THREE.OctahedronGeometry(d[4]), mat(d[3], { add: true, opacity: 0.9 }));
      s.position.set(d[0], d[1], d[2]); g.add(s);
      var ln = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), s.position]),
        new THREE.LineBasicMaterial({ color: PERI, transparent: true, opacity: 0.35 })
      );
      g.add(ln);
      stars.push({ m: s, base: s.position.clone(), phase: Math.random() * 6 });
    });
    addAnim(function (t) {
      stars.forEach(function (s) {
        s.m.position.y = s.base.y + Math.sin(t * 1.2 + s.phase) * 0.3;
        s.m.rotation.x += 0.008; s.m.rotation.y += 0.012;
      });
      hub.scale.setScalar(1 + Math.sin(t * 2.6) * 0.12);
    });
  })();

  /* ================= Scene 5 — Compute Cluster ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[4].pos); scene.add(g);
    var pads = [];
    [[-3, 0], [3, 0], [0, -2.4], [0, 2.4]].forEach(function (p) {
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.24, 24), mat(0x0d0d24));
      pad.position.set(p[0], 0, p[1]); g.add(pad); pads.push(pad);
    });
    var racks = [];
    var rackDefs = [
      { p: [-3, 0], n: 2 }, { p: [3, 0], n: 3 }, { p: [0, -2.4], n: 2 }, { p: [0, 2.4], n: 3 }
    ];
    rackDefs.forEach(function (rd, ri) {
      var dir = (ri === 2 || ri === 3) ? 'z' : 'x';
      for (var i = 0; i < rd.n; i++) {
        var off = (i - (rd.n - 1) / 2) * 1.9;
        var rack = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 1.0), mat(0x141430));
        rack.add(body);
        var strips = [];
        for (var j = 0; j < 5; j++) {
          var strip = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.02), mat(MINT, { add: true, opacity: 0.8 }));
          strip.position.y = -1.0 + j * 0.5;
          strip.position.z = 0.51;
          rack.add(strip); strips.push(strip);
        }
        if (dir === 'z') { rack.position.set(rd.p[0], 0, rd.p[1] + off); rack.rotation.y = Math.PI / 2; }
        else { rack.position.set(rd.p[0] + off, 0, rd.p[1]); }
        g.add(rack);
        racks.push({ g: rack, strips: strips, phase: ri * 0.9 + i * 0.5 });
      }
    });
    var cool = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 2.2, 12), mat(0x181840));
    cool.position.set(0, 1.1, 0); g.add(cool);
    addAnim(function (t) {
      racks.forEach(function (r) {
        r.strips.forEach(function (s, j) {
          s.material.opacity = 0.35 + Math.abs(Math.sin(t * 2.4 + r.phase + j * 0.7)) * 0.65;
        });
      });
    });
  })();

  /* ================= Scene 6 — Quiet Node ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[5].pos); scene.add(g);
    var orb = new THREE.Mesh(new THREE.SphereGeometry(2.8, 32, 32), mat(PERI, { t: true, opacity: 0.32, add: true }));
    g.add(orb);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.035, 8, 80), mat(MINT, { t: true, opacity: 0.5, add: true }));
    ring.rotation.x = Math.PI / 2.4; g.add(ring);
    var ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.025, 8, 80), mat(LAV, { t: true, opacity: 0.3, add: true }));
    ring2.rotation.x = Math.PI / 2.2; ring2.rotation.y = 0.4; g.add(ring2);
    var dust = [];
    for (var i = 0; i < 26; i++) {
      var d = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 8, 8), mat(Math.random() < 0.5 ? PERI : LAV, { add: true, opacity: 0.6 }));
      d.userData = { r: 3 + Math.random() * 2.4, a: Math.random() * Math.PI * 2, s: 0.08 + Math.random() * 0.12, y: (Math.random() - 0.5) * 3 };
      g.add(d); dust.push(d);
    }
    addAnim(function (t) {
      var b = 1 + Math.sin(t * 0.9) * 0.05;
      orb.scale.setScalar(b);
      orb.material.opacity = 0.24 + Math.sin(t * 0.9 + 1) * 0.08;
      ring.rotation.z = t * 0.12; ring2.rotation.z = -t * 0.09;
      dust.forEach(function (d) {
        var u = d.userData;
        d.position.set(Math.cos(t * u.s + u.a) * u.r, Math.sin(t * u.s * 0.7 + u.a) * 0.4 + u.y, Math.sin(t * u.s + u.a) * u.r);
      });
    });
  })();

  /* ================= Scene 7 — Join Node ================= */
  (function () {
    var g = new THREE.Group(); g.position.copy(SCENES[6].pos); scene.add(g);
    var knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.4, 0.28, 96, 14), mat(MINT, { t: true, opacity: 0.95 }));
    knot.position.y = 2.4; g.add(knot);
    var badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), mat(POP, { add: true, opacity: 0.95 }));
    badge.position.set(1.7, 3.4, 0.4); g.add(badge);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.03, 8, 64), mat(PERI, { t: true, opacity: 0.7, add: true }));
    ring.position.y = 2.4; ring.rotation.x = Math.PI / 2.6; g.add(ring);
    var beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.9, 14, 12, 1, true), mat(MINT, { t: true, opacity: 0.12, add: true }));
    beacon.position.y = 7; g.add(beacon);
    var sats = [];
    for (var i = 0; i < 8; i++) {
      var s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + Math.random() * 0.08), mat(Math.random() < 0.5 ? MINT : PERI, { add: true, opacity: 0.9 }));
      s.userData = { rad: 3.3 + Math.random() * 0.9, a: (i / 8) * Math.PI * 2, sp: 0.3 + Math.random() * 0.3 };
      s.position.y = 2.4;
      g.add(s); sats.push(s);
    }
    addAnim(function (t) {
      knot.rotation.x += 0.004; knot.rotation.y += 0.006;
      badge.rotation.y = t * 0.8; badge.rotation.x = t * 0.5;
      badge.scale.setScalar(1 + Math.sin(t * 3.2) * 0.15);
      ring.rotation.z = t * 0.2;
      beacon.material.opacity = 0.08 + Math.sin(t * 1.1) * 0.05;
      sats.forEach(function (s) {
        var u = s.userData;
        s.position.x = Math.cos(t * u.sp + u.a) * u.rad;
        s.position.z = Math.sin(t * u.sp + u.a) * u.rad;
        s.rotation.y += 0.03;
      });
    });
  })();

  /* ================= Camera path ================= */
  var PATH = [
    new THREE.Vector3(-14, 7, 18),   // outside, view of the core
    new THREE.Vector3(-6, 5, 10),
    new THREE.Vector3(2, 1.6, 3.4),  // core interior
    new THREE.Vector3(8, 6, 8),
    new THREE.Vector3(12, 5, -2),
    new THREE.Vector3(16.5, 2.3, -4.6), // lab interior
    new THREE.Vector3(21, 6, 2),
    new THREE.Vector3(26, 5, 7),
    new THREE.Vector3(32, 2.8, 3.4), // lanes interior
    new THREE.Vector3(38, 6, -2),
    new THREE.Vector3(42, 7, -9),
    new THREE.Vector3(48, 4.6, -3.4), // constellation interior
    new THREE.Vector3(54, 6, 2),
    new THREE.Vector3(60, 5, 7),
    new THREE.Vector3(66, 2.5, 3.4), // compute interior
    new THREE.Vector3(72, 6, -2),
    new THREE.Vector3(76, 4.6, -9),
    new THREE.Vector3(82, 1.3, -3.6), // quiet interior
    new THREE.Vector3(88, 6, 2),
    new THREE.Vector3(94, 5, 7),
    new THREE.Vector3(101, 2.4, 1.4), // join interior
    new THREE.Vector3(110, 5.5, 6)   // end pull-back
  ];
  var curve = new THREE.CatmullRomCurve3(PATH, false, 'catmullrom', 0.5);

  /* ================= Scroll ================= */
  var sections = Array.prototype.slice.call(document.querySelectorAll('.scene-copy'));
  var sceneIndexEl = document.getElementById('sceneIndex');
  var sceneNameEl = document.getElementById('sceneName');
  var progressFill = document.getElementById('progressFill');
  var N = SCENES.length;

  function scrollable() { return Math.max(1, document.body.scrollHeight - window.innerHeight); }
  var targetT = 0, curT = 0;

  function onScroll() {
    targetT = Math.min(1, Math.max(0, window.scrollY / scrollable()));
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function updateCopy() {
    var active = 0;
    for (var i = 0; i < N; i++) {
      var start = i / N, end = (i + 1) / N;
      var p = (curT - start) / (end - start);
      var o = smoothstep(0.02, 0.24, p) * (1 - smoothstep(0.7, 0.94, p));
      var el = sections[i];
      el.style.opacity = o.toFixed(3);
      el.style.transform = 'translateY(calc(-50% + ' + ((1 - o) * 42).toFixed(1) + 'px))';
      el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
      if (o > 0.35) active = i;
    }
    var idx = Math.min(N - 1, Math.floor(curT * N));
    if (idx !== lastIdx) {
      lastIdx = idx;
      sceneIndexEl.textContent = String(idx + 1).padStart(2, '0');
      sceneNameEl.textContent = SCENES[idx].name;
    }
    progressFill.style.width = (curT * 100).toFixed(2) + '%';
  }
  var lastIdx = -1;

  /* ================= Nav ================= */
  document.querySelectorAll('.site-nav [data-scene]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var s = parseInt(a.getAttribute('data-scene'), 10);
      var top = (s / N) * scrollable();
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  /* ================= Loader ================= */
  var loader = document.getElementById('loader');
  function hideLoader() { if (loader && !loader.classList.contains('done')) loader.classList.add('done'); }
  setTimeout(hideLoader, 5000); // hard fallback
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hideLoader, 900); });
  } else {
    setTimeout(hideLoader, 900);
  }

  /* ================= Resize ================= */
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  /* ================= Main loop ================= */
  var clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    var dt = clock.getDelta();
    var t = clock.elapsedTime;

    // smooth camera follow
    curT += (targetT - curT) * 0.14;
    if (Math.abs(targetT - curT) < 0.0004) curT = targetT;

    var p = curve.getPointAt(curT);
    var look = curve.getPointAt(Math.min(curT + 0.028, 1));
    camera.position.copy(p);
    camera.lookAt(look);

    for (var i = 0; i < anims.length; i++) anims[i](t, dt);

    updateCopy();
    renderer.render(scene, camera);
  }
  loop();
})();
