/* scenes-a.js — Core, Workshop Lab, Signal Paths, Constellation */
import * as THREE from 'three';
import { MINT, PERI, LAV, POP, BLUE, CORAL, matAdd, matStd, addAnim } from './engine.js';

export function buildScenesA(scene, SCENES) {
  /* ============ Scene 1 — The Core ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[0].pos); scene.add(g);
    const core = new THREE.Mesh(new THREE.SphereGeometry(3.2, 48, 48), matStd(MINT, { roughness: 0.35, metalness: 0.1, emissive: MINT, emissiveIntensity: 0.45 }));
    core.castShadow = true;
    const hot = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 32), matAdd(0xffffff, 0.95));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(4.1, 1), matAdd(PERI, 0.4));
    shell.material.wireframe = true;
    g.add(core); g.add(hot); g.add(shell);

    const rings = [];
    [[5.4, 0.06, 0, 0, MINT], [6.2, 0.04, 1, 0.5, PERI], [7.0, 0.03, 0.6, 1.1, LAV]].forEach(function (r) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r[0], r[1], 10, 90), matAdd(r[4], 0.75));
      ring.rotation.x = r[2]; ring.rotation.y = r[3];
      g.add(ring); rings.push(ring);
    });

    const sats = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 + Math.random() * 0.16), matAdd(Math.random() < 0.5 ? MINT : PERI, 0.9));
      s.userData = { rad: 8 + Math.random() * 2.4, speed: (0.25 + Math.random() * 0.45) * (Math.random() < 0.5 ? 1 : -1), y: (Math.random() - 0.5) * 3.2, phase: Math.random() * Math.PI * 2 };
      g.add(s); sats.push(s);
    }

    const swarm = [];
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), matAdd(i % 3 === 0 ? LAV : MINT, 0.7));
      c.userData = { r: 5.5 + Math.random() * 3.5, a: Math.random() * Math.PI * 2, s: 0.2 + Math.random() * 0.4, y: (Math.random() - 0.5) * 5, ph: Math.random() * 6 };
      g.add(c); swarm.push(c);
    }

    addAnim(function (t) {
      const p = 1 + Math.sin(t * 2.2) * 0.07;
      core.scale.setScalar(p); hot.scale.setScalar(1 + Math.sin(t * 2.2 + 0.6) * 0.16);
      rings.forEach(function (r, i) { r.rotation.z = t * (0.25 + i * 0.07); });
      sats.forEach(function (s) {
        const u = s.userData;
        s.position.set(Math.cos(t * u.speed + u.phase) * u.rad, Math.sin(t * 1.4 + u.phase) * 0.7 + u.y, Math.sin(t * u.speed + u.phase) * u.rad);
        s.rotation.x += 0.02; s.rotation.y += 0.02;
      });
      swarm.forEach(function (c) {
        const u = c.userData;
        c.position.set(Math.cos(t * u.s + u.a) * u.r, u.y + Math.sin(t * 1.1 + u.ph) * 0.5, Math.sin(t * u.s + u.a) * u.r);
        c.rotation.x += 0.03; c.rotation.y += 0.03;
      });
    });
  })();

  /* ============ Scene 2 — Workshop Lab ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[1].pos); scene.add(g);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 48), matStd(0x10102e, { roughness: 0.8 }));
    pad.position.y = 0; pad.receiveShadow = true; g.add(pad);
    const padEdge = new THREE.Mesh(new THREE.TorusGeometry(7, 0.06, 8, 64), matAdd(PERI, 0.5));
    padEdge.rotation.x = Math.PI / 2; padEdge.position.y = 0.22; g.add(padEdge);

    const desks = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const dg = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 1.1), matStd(0x1a1a40, { roughness: 0.5, emissive: 0x1a1a40, emissiveIntensity: 0.35 }));
      base.position.y = 0.6; base.castShadow = true; dg.add(base);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), matStd(MINT, { emissive: MINT, emissiveIntensity: 0.85, roughness: 0.3 }));
      scr.position.set(0, 1.4, 0.06); scr.rotation.x = -0.1; dg.add(scr);
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), matStd(0x0d0d24, { roughness: 0.9 }));
      chair.position.set(0, 0.25, -1.15); dg.add(chair);
      dg.position.set(Math.cos(ang) * 4.4, 0, Math.sin(ang) * 4.4);
      dg.rotation.y = ang + Math.PI;
      g.add(dg); desks.push(dg);
    }

    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 1.5), matStd(0x232350, { roughness: 0.4, emissive: 0x232350, emissiveIntensity: 0.4 }));
    ped.position.y = 1.1; ped.castShadow = true; g.add(ped);
    const pedScr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.95), matStd(PERI, { emissive: PERI, emissiveIntensity: 0.9, roughness: 0.3 }));
    pedScr.position.y = 1.9; pedScr.rotation.x = -0.15; g.add(pedScr);

    const lamp = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.05, 8, 64), matAdd(MINT, 0.55));
    lamp.position.y = 4.6; lamp.rotation.x = Math.PI / 2; g.add(lamp);

    addAnim(function (t) {
      desks.forEach(function (d, i) {
        d.children[1].material.emissiveIntensity = 0.6 + Math.sin(t * 2 + i * 1.1) * 0.3;
      });
      pedScr.material.emissiveIntensity = 0.65 + Math.sin(t * 1.6 + 1) * 0.25;
      lamp.rotation.z = t * 0.1;
    });
  })();

  /* ============ Scene 3 — Signal Paths ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[2].pos); scene.add(g);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.35, 48), matStd(0x10102e, { roughness: 0.8 }));
    pad.position.y = 0; pad.receiveShadow = true; g.add(pad);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 24), matStd(MINT, { roughness: 0.3, emissive: MINT, emissiveIntensity: 0.7 }));
    hub.position.y = 1.1; hub.castShadow = true; g.add(hub);

    const lanes = [];
    const defs = [
      [0, 0.15, 13, MINT], [0.6, 0.4, 12.5, PERI], [-0.6, 0.35, 12.5, LAV],
      [1.3, 0, 11.5, MINT], [-1.3, -0.1, 11.5, PERI], [0, 0.85, 12, POP]
    ];
    defs.forEach(function (d, i) {
      const end = new THREE.Vector3(d[0] * 6, d[1] * 6, d[2]);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 1.1, 0.6), end), 28, 0.22, 10, false),
        matAdd(d[3], 0.55)
      );
      g.add(tube);
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 18), matStd(d[3], { roughness: 0.3, emissive: d[3], emissiveIntensity: 0.9 }));
      node.position.copy(end); node.castShadow = true; g.add(node);
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), matAdd(0xffffff, 0.95));
      g.add(pulse);
      lanes.push({ tube, node, pulse, start: new THREE.Vector3(0, 1.1, 0.6), end, phase: i * 0.9 });
    });

    addAnim(function (t) {
      lanes.forEach(function (l) {
        l.tube.material.opacity = 0.38 + Math.sin(t * 1.8 + l.phase) * 0.22;
        l.node.scale.setScalar(1 + Math.sin(t * 3 + l.phase) * 0.18);
        const u = (t * 0.6 + l.phase) % 1;
        l.pulse.position.lerpVectors(l.start, l.end, u);
      });
    });
  })();

  /* ============ Scene 4 — Project Constellation ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[3].pos); scene.add(g);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.65, 24, 24), matStd(MINT, { roughness: 0.3, emissive: MINT, emissiveIntensity: 0.85 }));
    hub.position.y = 0; hub.castShadow = true; g.add(hub);

    const stars = [];
    const defs = [
      [3.2, 1.9, 1.4, MINT, 0.85], [-2.8, 2.5, 1.9, PERI, 0.7], [2.4, -2.1, 2.4, POP, 0.6],
      [-3.6, -1.6, 1.2, BLUE, 0.75], [0.6, 3.0, -1.8, CORAL, 0.55], [-1.0, -3.2, -1.6, LAV, 0.7],
      [4.4, 0.4, -0.6, MINT, 0.5], [-4.2, 0.8, -1.4, PERI, 0.6]
    ];
    defs.forEach(function (d) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(d[4]), matStd(d[3], { roughness: 0.3, emissive: d[3], emissiveIntensity: 0.8 }));
      s.position.set(d[0], d[1], d[2]); s.castShadow = true; g.add(s);
      const ln = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), s.position]),
        new THREE.LineBasicMaterial({ color: PERI, transparent: true, opacity: 0.4 })
      );
      g.add(ln);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.06, 24), matAdd(d[3], 0.35));
      disc.position.set(d[0], -0.05, d[2]); disc.rotation.x = Math.PI / 2; g.add(disc);
      stars.push({ m: s, base: s.position.clone(), phase: Math.random() * 6 });
    });

    const links = [[0, 3], [1, 5], [2, 4], [3, 7], [4, 6]];
    links.forEach(function (pair) {
      const a = defs[pair[0]], b = defs[pair[1]];
      const ln = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2])]),
        new THREE.LineBasicMaterial({ color: LAV, transparent: true, opacity: 0.25 })
      );
      g.add(ln);
    });

    addAnim(function (t) {
      stars.forEach(function (s) {
        s.m.position.y = s.base.y + Math.sin(t * 1.2 + s.phase) * 0.4;
        s.m.rotation.x += 0.008; s.m.rotation.y += 0.012;
      });
      hub.scale.setScalar(1 + Math.sin(t * 2.6) * 0.14);
    });
  })();
}
