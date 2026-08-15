/* app.js — main wiring: camera path, scroll scrub, UI, loop (premium pass) */
import * as THREE from 'three';
import { scene, camera, composer, renderer, SCENES, PATH_PTS, addAnim, runAnims, onResize } from './engine.js';
import { buildScenesA } from './scenes-a.js';
import { buildScenesB } from './scenes-b.js';

buildScenesA(scene, SCENES);
buildScenesB(scene, SCENES);

/* ---------- Camera path (clearance-safe: interiors stay outside scene extents) ---------- */
const PATH = [
  new THREE.Vector3(-16, 9, 16),
  new THREE.Vector3(-8, 6.5, 11),
  new THREE.Vector3(6.2, 3.4, 4.8),    // core interior (clearance 8.5 > rings 7.0)
  new THREE.Vector3(12, 8, 10),
  new THREE.Vector3(17, 8, -15),
  new THREE.Vector3(28.6, 4.2, -4.8),  // lab interior (clearance 8.4 > pad 7)
  new THREE.Vector3(32, 8, -2),
  new THREE.Vector3(36, 8, 12),
  new THREE.Vector3(42, 3.4, -5),      // lanes interior (in front of fan)
  new THREE.Vector3(56, 8, 8),
  new THREE.Vector3(58, 11, -14),
  new THREE.Vector3(74.8, 8.6, -2.8),  // constellation interior (clearance 7 > stars 4.4)
  new THREE.Vector3(82, 10, -12),
  new THREE.Vector3(84, 8, 12),
  new THREE.Vector3(99.6, 3.8, 5.6),   // compute interior (clearance 7.4 > racks ~4.5)
  new THREE.Vector3(108, 8, 8),
  new THREE.Vector3(106, 8, -14),
  new THREE.Vector3(123.2, 3, -2.4),   // quiet interior (clearance 7.1 > rings 5.8)
  new THREE.Vector3(130, 8, -12),
  new THREE.Vector3(130, 9, 11),
  new THREE.Vector3(146.9, 5.2, 2),    // join interior (clearance 6.8 > sats 5.2)
  new THREE.Vector3(156, 7, 8)
];
const curve = new THREE.CatmullRomCurve3(PATH, false, 'catmullrom', 0.5);

/* ---------- Scroll ---------- */
const sections = Array.prototype.slice.call(document.querySelectorAll('.scene-copy'));
const sceneIndexEl = document.getElementById('sceneIndex');
const sceneNameEl = document.getElementById('sceneName');
const progressFill = document.getElementById('progressFill');
const N = SCENES.length;

function scrollable() { return Math.max(1, document.body.scrollHeight - window.innerHeight); }
let targetT = 0, curT = 0;

function onScroll() { targetT = Math.min(1, Math.max(0, window.scrollY / scrollable())); }
window.addEventListener('scroll', onScroll, { passive: true });

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

let lastIdx = -1;
function updateCopy() {
  for (let i = 0; i < N; i++) {
    const start = i / N, end = (i + 1) / N;
    const p = (curT - start) / (end - start);
    const o = smoothstep(0.02, 0.24, p) * (1 - smoothstep(0.7, 0.94, p));
    const el = sections[i];
    el.style.opacity = o.toFixed(3);
    el.style.transform = 'translateY(calc(-50% + ' + ((1 - o) * 42).toFixed(1) + 'px))';
    el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
  }
  const idx = Math.min(N - 1, Math.floor(curT * N));
  if (idx !== lastIdx) {
    lastIdx = idx;
    sceneIndexEl.textContent = String(idx + 1).padStart(2, '0');
    sceneNameEl.textContent = SCENES[idx].name;
  }
  progressFill.style.width = (curT * 100).toFixed(2) + '%';
}

/* ---------- Nav ---------- */
document.querySelectorAll('.site-nav [data-scene]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    e.preventDefault();
    const s = parseInt(a.getAttribute('data-scene'), 10);
    window.scrollTo({ top: (s / N) * scrollable(), behavior: 'smooth' });
  });
});

/* ---------- Loader ---------- */
const loader = document.getElementById('loader');
function hideLoader() { if (loader && !loader.classList.contains('done')) loader.classList.add('done'); }
setTimeout(hideLoader, 5000);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { setTimeout(hideLoader, 900); });
} else {
  setTimeout(hideLoader, 900);
}

/* ---------- Resize ---------- */
window.addEventListener('resize', onResize);

/* ---------- Main loop ---------- */
const clock = new THREE.Clock();
const BASE_FOV = 58;
function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  curT += (targetT - curT) * 0.14;
  if (Math.abs(targetT - curT) < 0.0004) curT = targetT;

  const p = curve.getPointAt(curT);
  const look = curve.getPointAt(Math.min(curT + 0.028, 1));
  camera.position.copy(p);
  camera.lookAt(look);

  // FOV punch: narrow to 50 during scene interiors (zoom without clipping)
  const pScene = (curT * N) % 1;
  const punch = smoothstep(0.12, 0.32, pScene) * (1 - smoothstep(0.6, 0.82, pScene));
  const fov = BASE_FOV - 8 * punch;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  runAnims(t, dt);
  updateCopy();
  composer.render();
}
loop();
