/* scenes-b.js — Compute Cluster, Quiet Node, Join Node */
import * as THREE from 'three';
import { MINT, PERI, LAV, POP, matAdd, matStd, addAnim } from './engine.js';

export function buildScenesB(scene, SCENES) {
  /* ============ Scene 5 — Compute Cluster ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[4].pos); scene.add(g);
    const padDefs = [[-4.4, 0], [4.4, 0], [0, -3.2], [0, 3.2], [0, 0]];
    padDefs.forEach(function (p) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.3, 36), matStd(0x10102e, { roughness: 0.8 }));
      pad.position.set(p[0], 0, p[1]); pad.receiveShadow = true; g.add(pad);
    });

    const racks = [];
    const rackDefs = [
      { p: [-4.4, 0], n: 3 }, { p: [4.4, 0], n: 3 }, { p: [0, -3.2], n: 2 }, { p: [0, 3.2], n: 3 }, { p: [0, 0], n: 2 }
    ];
    rackDefs.forEach(function (rd, ri) {
      const isZ = (ri === 2 || ri === 3);
      for (let i = 0; i < rd.n; i++) {
        const off = (i - (rd.n - 1) / 2) * 1.9;
        const rack = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.7, 1.05), matStd(0x1c1c46, { roughness: 0.45, emissive: 0x1c1c46, emissiveIntensity: 0.4 }));
        body.position.y = 1.35; body.castShadow = true; rack.add(body);
        const strips = [];
        for (let j = 0; j < 6; j++) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.02), matStd(MINT, { emissive: MINT, emissiveIntensity: 0.85, roughness: 0.3 }));
          strip.position.set(0, 0.3 + j * 0.45, 0.53);
          rack.add(strip); strips.push(strip);
        }
        if (isZ) { rack.position.set(rd.p[0], 0, rd.p[1] + off); rack.rotation.y = Math.PI / 2; }
        else { rack.position.set(rd.p[0] + off, 0, rd.p[1]); }
        g.add(rack);
        racks.push({ strips, phase: ri * 0.8 + i * 0.5 });
      }
    });

    const cool1 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 2.6, 14), matStd(0x232350, { roughness: 0.4, emissive: 0x232350, emissiveIntensity: 0.4 }));
    cool1.position.set(-2.2, 1.3, 3.2); cool1.castShadow = true; g.add(cool1);
    const cool2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 2.2, 14), matStd(0x232350, { roughness: 0.4, emissive: 0x232350, emissiveIntensity: 0.4 }));
    cool2.position.set(2.2, 1.1, -3.2); cool2.castShadow = true; g.add(cool2);

    const hol = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 8.5, 14, 1, true), matAdd(MINT, 0.16));
    hol.position.y = 4.4; g.add(hol);
    const holCore = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), matAdd(0xffffff, 0.9));
    holCore.position.y = 4.4; g.add(holCore);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 0.6), matAdd(PERI, 0.3));
    vent.position.set(0, 0.06, 0); g.add(vent);

    addAnim(function (t) {
      racks.forEach(function (r) {
        r.strips.forEach(function (s, j) {
          s.material.emissiveIntensity = 0.35 + Math.abs(Math.sin(t * 2.4 + r.phase + j * 0.7)) * 0.65;
        });
      });
      holCore.position.y = 4.4 + Math.sin(t * 1.3) * 0.7;
      holCore.scale.setScalar(1 + Math.sin(t * 2.6) * 0.2);
      hol.material.opacity = 0.12 + Math.sin(t * 0.9) * 0.05;
    });
  })();

  /* ============ Scene 6 — Quiet Node ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[5].pos); scene.add(g);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(3.6, 48, 48), matStd(PERI, { roughness: 0.4, metalness: 0.1, emissive: PERI, emissiveIntensity: 0.3, t: true, opacity: 0.92 }));
    orb.position.y = 0; orb.castShadow = true; g.add(orb);
    const coreLine = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 24), matAdd(LAV, 0.8));
    g.add(coreLine);

    const rings = [];
    [[4.8, 0.045, Math.PI / 2.4, 0, MINT], [5.8, 0.03, Math.PI / 2.1, 0.4, LAV]].forEach(function (r) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r[0], r[1], 10, 90), matAdd(r[4], 0.55));
      ring.rotation.x = r[2]; ring.rotation.y = r[3];
      g.add(ring); rings.push(ring);
    });

    const dust = [];
    for (let i = 0; i < 34; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 10, 10), matAdd(Math.random() < 0.5 ? PERI : LAV, 0.65));
      d.userData = { r: 3.8 + Math.random() * 3, a: Math.random() * Math.PI * 2, s: 0.06 + Math.random() * 0.1, y: (Math.random() - 0.5) * 4 };
      g.add(d); dust.push(d);
    }

    const shards = [];
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + i * 0.12), matAdd(i === 1 ? MINT : PERI, 0.85));
      sh.userData = { r: 4.4 + i * 0.9, a: i * 2.1, s: 0.1 + i * 0.03, y: 0.5 + i * 0.6 };
      g.add(sh); shards.push(sh);
    }

    addAnim(function (t) {
      const b = 1 + Math.sin(t * 0.9) * 0.05;
      orb.scale.setScalar(b);
      orb.material.emissiveIntensity = 0.22 + Math.sin(t * 0.9 + 1) * 0.1;
      coreLine.scale.setScalar(1 + Math.sin(t * 1.4) * 0.2);
      rings.forEach(function (r, i) { r.rotation.z = t * (0.1 + i * 0.04); });
      dust.forEach(function (d) {
        const u = d.userData;
        d.position.set(Math.cos(t * u.s + u.a) * u.r, Math.sin(t * u.s * 0.7 + u.a) * 0.5 + u.y, Math.sin(t * u.s + u.a) * u.r);
      });
      shards.forEach(function (sh) {
        const u = sh.userData;
        sh.position.set(Math.cos(t * u.s + u.a) * u.r, u.y + Math.sin(t * 0.5 + u.a) * 0.3, Math.sin(t * u.s + u.a) * u.r);
        sh.rotation.x += 0.01; sh.rotation.y += 0.015;
      });
    });
  })();

  /* ============ Scene 7 — Join Node ============ */
  (function () {
    const g = new THREE.Group(); g.position.copy(SCENES[6].pos); scene.add(g);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.6, 0.35, 48), matStd(0x10102e, { roughness: 0.8 }));
    pad.position.y = 0; pad.receiveShadow = true; g.add(pad);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.05, 8, 80), matAdd(PERI, 0.5));
    padRing.rotation.x = Math.PI / 2; padRing.position.y = 0.2; g.add(padRing);

    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.8, 0.34, 120, 16), matStd(MINT, { roughness: 0.3, metalness: 0.2, emissive: MINT, emissiveIntensity: 0.5 }));
    knot.position.y = 3.4; knot.castShadow = true; g.add(knot);
    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), matAdd(POP, 0.95));
    badge.position.set(2.4, 4.9, 0.7); g.add(badge);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.04, 10, 80), matAdd(PERI, 0.75));
    ring.position.y = 3.4; ring.rotation.x = Math.PI / 2.6; g.add(ring);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 17, 14, 1, true), matAdd(MINT, 0.14));
    beacon.position.y = 8.5; g.add(beacon);

    const sats = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + Math.random() * 0.1), matAdd(Math.random() < 0.5 ? MINT : PERI, 0.9));
      s.userData = { rad: 4.4 + Math.random() * 1.2, a: (i / 10) * Math.PI * 2, sp: 0.3 + Math.random() * 0.3 };
      s.position.y = 3.4;
      g.add(s); sats.push(s);
    }
    const trails = [];
    for (let i = 0; i < 2; i++) {
      const tr = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), matAdd(0xffffff, 0.95));
      tr.userData = { r: 4.6 + i * 0.5, a: i * Math.PI, sp: 0.5 + i * 0.15 };
      tr.position.y = 3.4; g.add(tr); trails.push(tr);
    }

    addAnim(function (t) {
      knot.rotation.x += 0.004; knot.rotation.y += 0.006;
      badge.rotation.y = t * 0.8; badge.rotation.x = t * 0.5;
      badge.scale.setScalar(1 + Math.sin(t * 3.2) * 0.18);
      ring.rotation.z = t * 0.2;
      beacon.material.opacity = 0.1 + Math.sin(t * 1.1) * 0.06;
      sats.forEach(function (s) {
        const u = s.userData;
        s.position.x = Math.cos(t * u.sp + u.a) * u.rad;
        s.position.z = Math.sin(t * u.sp + u.a) * u.rad;
        s.rotation.y += 0.03;
      });
      trails.forEach(function (tr) {
        const u = tr.userData;
        tr.position.x = Math.cos(t * u.sp + u.a) * u.r;
        tr.position.z = Math.sin(t * u.sp + u.a) * u.r;
      });
    });
  })();
}
