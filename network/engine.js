/* engine.js — renderer, composer, lights, shared world (premium pass) */
import * as THREE from 'three';
import { EffectComposer } from './addons/postprocessing/EffectComposer.js';
import { RenderPass } from './addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './addons/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from './addons/shaders/GammaCorrectionShader.js';

export const MINT = 0x4DE3C1, PERI = 0x7C6CFF, LAV = 0xF2F0FF, POP = 0xFF6EC7, BLUE = 0x5a8bff, CORAL = 0xff5a8b;

export const IS_MOBILE = window.innerWidth < 900;

const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x060612);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = !IS_MOBILE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060612, 0.0045);

export const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(-16, 9, 16);

/* Composer: render → bloom → gamma */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.5, 0.22);
composer.addPass(bloom);
composer.addPass(new ShaderPass(GammaCorrectionShader));
export { composer, renderer };

/* ---------- Lights ---------- */
scene.add(new THREE.HemisphereLight(PERI, 0x03030a, 0.75));

const key = new THREE.DirectionalLight(MINT, 1.0);
key.position.set(30, 40, 18);
key.castShadow = !IS_MOBILE;
if (!IS_MOBILE) {
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -80; key.shadow.camera.right = 80;
  key.shadow.camera.top = 40; key.shadow.camera.bottom = -40;
  key.shadow.camera.far = 220;
}
scene.add(key);

const pCore = new THREE.PointLight(MINT, 1.1, 60);
pCore.position.set(0, 4, 0);
scene.add(pCore);
const pQuiet = new THREE.PointLight(PERI, 0.8, 70);
pQuiet.position.set(118, 6, -5);
scene.add(pQuiet);
const pJoin = new THREE.PointLight(POP, 0.6, 50);
pJoin.position.set(142, 8, 0);
scene.add(pJoin);

/* ---------- Material helpers ---------- */
export function matAdd(hex, opacity) {
  return new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: opacity == null ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
export function matStd(color, o) {
  o = o || {};
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: o.roughness == null ? 0.55 : o.roughness,
    metalness: o.metalness == null ? 0.15 : o.metalness,
    emissive: o.emissive == null ? 0x000000 : o.emissive,
    emissiveIntensity: o.emissiveIntensity == null ? 0 : o.emissiveIntensity,
    transparent: !!o.t,
    opacity: o.opacity == null ? 1 : o.opacity
  });
}

/* ---------- Animation registry ---------- */
const anims = [];
export function addAnim(fn) { anims.push(fn); }
export function runAnims(t, dt) { for (let i = 0; i < anims.length; i++) anims[i](t, dt); }

/* ---------- Shared world ---------- */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(340, 160), matStd(0x0a0a20, { roughness: 0.95, metalness: 0 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(71, -0.2, -1);
floor.receiveShadow = !IS_MOBILE;
scene.add(floor);

const grid = new THREE.GridHelper(320, 80, MINT, MINT);
grid.position.set(71, -0.16, -1);
grid.material.transparent = true;
grid.material.opacity = 0.09;
scene.add(grid);

/* neural field particles — filtered off the camera path */
export const PATH_PTS = [
  new THREE.Vector3(-16, 9, 16), new THREE.Vector3(-8, 6.5, 11), new THREE.Vector3(6.2, 3.4, 4.8), new THREE.Vector3(12, 8, 10),
  new THREE.Vector3(17, 8, -15), new THREE.Vector3(28.6, 4.2, -4.8), new THREE.Vector3(32, 8, -2),
  new THREE.Vector3(36, 8, 12), new THREE.Vector3(42, 3.4, -5), new THREE.Vector3(56, 8, 8),
  new THREE.Vector3(58, 11, -14), new THREE.Vector3(74.8, 8.6, -2.8), new THREE.Vector3(82, 10, -12),
  new THREE.Vector3(84, 8, 12), new THREE.Vector3(99.6, 3.8, 5.6), new THREE.Vector3(108, 8, 8),
  new THREE.Vector3(106, 8, -14), new THREE.Vector3(123.2, 3, -2.4), new THREE.Vector3(130, 8, -12),
  new THREE.Vector3(130, 9, 11), new THREE.Vector3(146.9, 5.2, 2), new THREE.Vector3(156, 7, 8)
];

(function buildParticles() {
  const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const palette = [new THREE.Color(MINT), new THREE.Color(PERI), new THREE.Color(LAV)];
  let placed = 0, guard = 0;
  while (placed < N && guard < 20000) {
    guard++;
    const x = -30 + Math.random() * 200, y = 0.5 + Math.random() * 34, z = -24 + Math.random() * 48;
    let ok = true;
    for (let i = 0; i < PATH_PTS.length; i++) {
      const dx = x - PATH_PTS[i].x, dy = y - PATH_PTS[i].y, dz = z - PATH_PTS[i].z;
      if (dx * dx + dy * dy + dz * dz < 14) { ok = false; break; }
    }
    if (!ok) continue;
    pos[placed * 3] = x; pos[placed * 3 + 1] = y; pos[placed * 3 + 2] = z;
    const c = palette[(Math.random() * palette.length) | 0];
    col[placed * 3] = c.r; col[placed * 3 + 1] = c.g; col[placed * 3 + 2] = c.b;
    placed++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, placed * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, placed * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.22, vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(pts);
})();

/* network backbone lines */
export const SCENES = [
  { name: 'THE CORE', pos: new THREE.Vector3(0, 0, 0) },
  { name: 'WORKSHOP LAB', pos: new THREE.Vector3(22, 0, -8) },
  { name: 'SIGNAL PATHS', pos: new THREE.Vector3(46, 0, 3) },
  { name: 'CONSTELLATION', pos: new THREE.Vector3(70, 4, -5) },
  { name: 'COMPUTE', pos: new THREE.Vector3(94, 0, 3) },
  { name: 'QUIET NODE', pos: new THREE.Vector3(118, -1, -5) },
  { name: 'JOIN NODE', pos: new THREE.Vector3(142, 1, 0) }
];
(function buildNetworkLines() {
  const verts = [];
  for (let i = 0; i < SCENES.length - 1; i++) {
    verts.push(SCENES[i].pos.x, SCENES[i].pos.y + 0.6, SCENES[i].pos.z);
    verts.push(SCENES[i + 1].pos.x, SCENES[i + 1].pos.y + 0.6, SCENES[i + 1].pos.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: PERI, transparent: true, opacity: 0.35 })));
})();

export function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
