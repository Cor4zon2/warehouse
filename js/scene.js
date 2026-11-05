// Изометрическая 3D-сцена склада (Three.js, ортографическая камера).
import * as THREE from 'three';
import { SKUS } from './data.js';

const M = {}; // кеш материалов
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  return (M[key] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02, ...opts }));
}
const G = {}; // кеш геометрий
function boxGeo(w, h, d) { const k = `b${w}|${h}|${d}`; return (G[k] ||= new THREE.BoxGeometry(w, h, d)); }

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'object' ? color : mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function plane(w, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
  return m;
}
function textTexture(text, { w = 512, h = 128, bg = null, color = '#2850e8', font = 'bold 64px Inter, Arial', align = 'center' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(text, align === 'center' ? w / 2 : 24, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- модели ----------
function makePallet(sku) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.18, 1.2, 0xb58a5a, 0, 0.09, 0));
  const c = SKUS[sku]?.color ?? 0xd9a066;
  const b = box(1.25, 0.95, 1.08, c, 0, 0.66, 0);
  g.add(b);
  g.add(box(1.27, 0.12, 0.25, 0xf1e2c4, 0, 1.0, 0)); // лента
  return g;
}

const carrierTex = {};
function makeTruck(t) {
  const g = new THREE.Group();
  const col = t.carrier;
  g.add(box(13.4, 0.5, 2.3, 0x2b2f3a, -0.2, 0.85, 0)); // рама
  const trailer = box(10.2, 3.5, 3.1, 0xf7f8fb, -1.9, 2.85, 0);
  g.add(trailer);
  g.add(box(10.22, 0.35, 3.12, col.stripe, -1.9, 1.35, 0));
  // надпись перевозчика на бортах
  const tex = (carrierTex[col.name] ||= textTexture(col.name, { color: '#' + col.stripe.toString(16).padStart(6, '0'), font: 'italic bold 70px Inter, Arial' }));
  const lm = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), lm);
    p.position.set(-1.9, 3.0, s * 1.57); if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  // кабина
  g.add(box(2.9, 2.9, 3.0, col.cab, 5.15, 2.35, 0));
  g.add(box(1.2, 1.0, 3.0, col.cab, 6.0, 1.3, 0));
  g.add(box(0.08, 1.25, 2.6, 0x1b2236, 6.62, 2.95, 0, { roughness: 0.2, metalness: 0.4 }));
  for (const s of [1, -1]) g.add(box(1.4, 1.0, 0.06, 0x1b2236, 5.4, 2.95, s * 1.51, { roughness: 0.2 }));
  g.add(box(0.12, 0.25, 0.5, 0xfff3c4, 6.65, 1.35, 1.1, { emissive: 0xfff3c4, emissiveIntensity: 0.6 }));
  g.add(box(0.12, 0.25, 0.5, 0xfff3c4, 6.65, 1.35, -1.1, { emissive: 0xfff3c4, emissiveIntensity: 0.6 }));
  // колёса
  const wg = (G.wheel ||= new THREE.CylinderGeometry(0.58, 0.58, 0.5, 16).rotateX(Math.PI / 2));
  for (const x of [-5.9, -4.6, 3.9, 5.7]) for (const s of [1, -1]) {
    const w = new THREE.Mesh(wg, mat(0x20232b)); w.position.set(x, 0.58, s * 1.25); w.castShadow = true; g.add(w);
  }
  // индикатор загрузки на крыше (растёт с прогрессом)
  const fill = box(1, 0.06, 2.6, 0x22c55e, -1.9, 4.64, 0);
  fill.scale.x = 0.001; fill.castShadow = false;
  g.add(fill);
  g.userData.fill = fill;
  return g;
}

function makeForklift() {
  const g = new THREE.Group();
  const Y = 0xf5b800;
  g.add(box(1.9, 0.9, 1.3, Y, -0.1, 0.75, 0));
  g.add(box(0.6, 0.8, 1.32, 0x3a3f4b, -0.95, 0.85, 0)); // противовес
  for (const [x, z] of [[-0.75, 0.55], [-0.75, -0.55], [0.55, 0.55], [0.55, -0.55]]) g.add(box(0.08, 1.4, 0.08, 0x2b2f3a, x, 1.9, z));
  g.add(box(1.45, 0.08, 1.25, 0x2b2f3a, -0.1, 2.62, 0));
  g.add(box(0.5, 0.5, 0.5, 0x2b2f3a, -0.35, 1.45, 0));
  const mast = new THREE.Group(); mast.position.x = 1.0; g.add(mast);
  mast.add(box(0.12, 2.6, 0.12, 0x2b2f3a, 0, 1.4, 0.42));
  mast.add(box(0.12, 2.6, 0.12, 0x2b2f3a, 0, 1.4, -0.42));
  const carriage = new THREE.Group(); mast.add(carriage);
  carriage.add(box(0.1, 0.7, 1.0, 0x3a3f4b, 0.08, 0.5, 0));
  carriage.add(box(1.3, 0.07, 0.16, 0x9aa1ad, 0.75, 0.2, 0.32));
  carriage.add(box(1.3, 0.07, 0.16, 0x9aa1ad, 0.75, 0.2, -0.32));
  const load = new THREE.Group(); load.position.set(0.8, 0.2, 0); carriage.add(load);
  const wg = (G.fw ||= new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12).rotateX(Math.PI / 2));
  for (const x of [-0.7, 0.6]) for (const s of [1, -1]) {
    const w = new THREE.Mesh(wg, mat(0x20232b)); w.position.set(x, 0.32, s * 0.62); g.add(w);
  }
  const beacon = box(0.18, 0.15, 0.18, 0xff8a00, -0.1, 2.74, 0, { emissive: 0xff8a00, emissiveIntensity: 1 });
  g.add(beacon);
  g.userData = { carriage, load, beacon, loadSku: null };
  return g;
}

function makeTree(s = 1) {
  const g = new THREE.Group();
  g.add(box(0.35 * s, 1.6 * s, 0.35 * s, 0x8a6a4a, 0, 0.8 * s, 0));
  const sph = (G.tree ||= new THREE.SphereGeometry(1, 14, 10));
  const c = new THREE.Mesh(sph, mat(0x5fbf6a)); c.scale.set(1.25 * s, 1.6 * s, 1.25 * s); c.position.y = 2.7 * s; c.castShadow = true;
  g.add(c);
  return g;
}

function makePin(color = 0x2f6bff) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), mat(color, { emissive: color, emissiveIntensity: 0.25 }));
  head.position.y = 2.1;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 18), mat(color));
  tip.rotation.x = Math.PI; tip.position.y = 1.15;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), mat(0xffffff));
  dot.position.set(0, 2.15, 0.62);
  g.add(head, tip, dot);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- сцена ----------
export class Scene3D {
  constructor(container, world, { onPick, labelLayer }) {
    this.world = world;
    this.onPick = onPick;
    this.labelLayer = labelLayer;
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef2f8);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000);
    this.cam = { target: new THREE.Vector3(0, 0, 14), az: Math.PI / 4, el: 0.62, half: 46, tAz: Math.PI / 4, tHalf: 46, tTarget: new THREE.Vector3(0, 0, 14) };

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d3e6, 1.35));
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 1.9));
    sun.position.set(-60, 110, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 1, far: 400 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);

    this.siteGroup = new THREE.Group();
    this.scene.add(this.siteGroup);
    this.dyn = new Map();
    this.labels = new Map();
    this.selected = null;
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40), new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.8 }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.selPin = makePin(); this.selPin.visible = false; this.scene.add(this.selPin);

    this.initControls();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / Math.max(1, h);
  }

  // ---- управление камерой: ЛКМ — сдвиг, ПКМ/Shift — поворот, колесо — масштаб ----
  initControls() {
    const el = this.renderer.domElement;
    const pts = new Map();
    let down = null, mode = null, pinch0 = 0, half0 = 0;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, moved: 0 };
      mode = e.button === 2 || e.shiftKey ? 'rot' : 'pan';
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); half0 = this.cam.tHalf; mode = 'pinch';
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) { this.hover(e); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'pinch' && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.cam.tHalf = THREE.MathUtils.clamp(half0 * (pinch0 / d), 14, 95);
      } else if (mode === 'rot') {
        this.cam.tAz -= dx * 0.008;
      } else if (mode === 'pan') {
        const wpp = (2 * this.cam.half) / this.container.clientHeight;
        const az = this.cam.az;
        const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
        const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
        this.cam.tTarget.addScaledVector(right, -dx * wpp).addScaledVector(fwd, dy * wpp / Math.sin(this.cam.el));
        this.cam.target.copy(this.cam.tTarget);
        this.clampTarget();
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (down && down.moved < 6 && mode !== 'pinch') this.pick(e);
      if (pts.size === 0) { down = null; mode = null; }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.tHalf = THREE.MathUtils.clamp(this.cam.tHalf * Math.exp(e.deltaY * 0.0012), 14, 95);
    }, { passive: false });
  }
  clampTarget() {
    const t = this.cam.tTarget;
    t.x = THREE.MathUtils.clamp(t.x, -110, 110); t.z = THREE.MathUtils.clamp(t.z, -60, 80);
  }
  zoomBy(f) { this.cam.tHalf = THREE.MathUtils.clamp(this.cam.tHalf * f, 14, 95); }
  rotateBy(a) { this.cam.tAz += a; }
  resetView() {
    const s = this.site;
    this.cam.tAz = Math.PI / 4; this.cam.tHalf = s ? 38 + s.cfg.building.w * 0.18 : 46;
    // смещаем центр вправо, чтобы сцена не пряталась под правой панелью
    const off = window.innerWidth > 900 ? 12 : 0;
    this.cam.tTarget.set(-6 + Math.cos(this.cam.tAz) * off, 0, (s ? s.dockZ + 6 : 14) - Math.sin(this.cam.tAz) * off);
  }
  focus(x, z, half) {
    this.cam.tTarget.set(x, 0, z);
    if (half) this.cam.tHalf = half;
  }

  updateCamera(dt) {
    const c = this.cam, k = Math.min(1, dt * 6);
    c.az += (c.tAz - c.az) * k;
    c.half += (c.tHalf - c.half) * k;
    c.target.lerp(c.tTarget, k);
    const d = 200;
    const pos = new THREE.Vector3(
      Math.sin(c.az) * Math.cos(c.el), Math.sin(c.el), Math.cos(c.az) * Math.cos(c.el)
    ).multiplyScalar(d).add(c.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(c.target);
    this.camera.left = -c.half * this.aspect; this.camera.right = c.half * this.aspect;
    this.camera.top = c.half; this.camera.bottom = -c.half;
    this.camera.updateProjectionMatrix();
  }

  // ---- построение площадки ----
  setSite(site) {
    this.site = site;
    // очистка
    this.siteGroup.clear();
    for (const [, o] of this.dyn) this.scene.remove(o);
    this.dyn.clear();
    for (const [, l] of this.labels) l.remove();
    this.labels.clear();
    this.selected = null;

    const { w, d, h } = site.cfg.building;
    const blue = site.id === 'WH-01';
    const G0 = this.siteGroup;
    const R = site.roadZ;

    G0.add(plane(600, 400, 0xf4f6fa, 0, 0, 0));
    // площадка / асфальт
    G0.add(plane(w + 76, R - 3 + d / 2 + 14, 0xe6eaf1, -6, 0.02, (R - 3 - d / 2 - 14) / 2));
    // дорога + полоса ожидания
    G0.add(plane(600, 15, 0xd6dce6, 0, 0.03, R + 3));
    for (let x = -280; x < 280; x += 8) G0.add(plane(3.6, 0.35, 0xffffff, x, 0.05, R + 3));
    G0.add(plane(600, 0.3, 0xffffff, 0, 0.05, R - 4.2));
    G0.add(plane(600, 0.3, 0xffffff, 0, 0.05, R + 10.2));
    // разметка у ворот
    for (let i = 0; i <= site.docks.length; i++) {
      const x = i < site.docks.length ? site.docks[i].x - (w / (site.docks.length + 1)) / 2 : site.docks[i - 1].x + (w / (site.docks.length + 1)) / 2;
      G0.add(plane(0.3, 17, 0xffffff, x, 0.05, d / 2 + 9.5));
    }
    // зона складирования (staging)
    const S = site.staging;
    G0.add(plane(12.5, 12.5, 0xdfe5ef, S.x, 0.04, S.z + 4.8));
    for (const [dx, dz, ww, dd] of [[0, -6.25, 12.5, 0.3], [0, 6.25, 12.5, 0.3], [-6.25, 0, 0.3, 12.5], [6.25, 0, 0.3, 12.5]]) {
      G0.add(plane(ww, dd, 0xf5b800, S.x + dx, 0.06, S.z + 4.8 + dz));
    }
    const stagingHit = box(12.5, 0.1, 12.5, 0xdfe5ef, S.x, 0.03, S.z + 4.8);
    stagingHit.material = new THREE.MeshBasicMaterial({ visible: false });
    stagingHit.userData.ref = { kind: 'stock' };
    G0.add(stagingHit);
    this.stackGroup = new THREE.Group(); G0.add(this.stackGroup); this.stackKey = '';

    // стеллажи
    const rack = new THREE.Group();
    rack.position.set(S.x, 0, S.z - 7.5);
    for (let i = 0; i < 3; i++) {
      const rx = (i - 1) * 4.2;
      for (const [ox, oz] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) rack.add(box(0.18, 5.4, 0.18, 0x2f55d4, rx + ox, 2.7, oz));
      for (const y of [0.4, 2.1, 3.8]) {
        rack.add(box(4.2, 0.16, 0.16, 0xf08a24, rx, y, -1));
        rack.add(box(4.2, 0.16, 0.16, 0xf08a24, rx, y, 1));
        for (const bx of [-1.2, 0.9]) {
          if ((i + y * 3 + bx) % 3 > 0.6) {
            const p = makePallet(Object.keys(site.stock)[(i + Math.round(y)) % Object.keys(site.stock).length]);
            p.position.set(rx + bx, y + 0.08, 0); p.scale.setScalar(0.95); rack.add(p);
          }
        }
      }
    }
    rack.userData.ref = { kind: 'stock' };
    G0.add(rack);

    // здание
    const b = new THREE.Group(); b.userData.ref = { kind: 'site' };
    const wallC = blue ? 0x2f5be0 : 0xf2f5fb, trimC = blue ? 0x1f3fb0 : 0x2f5be0;
    b.add(box(w, h, d, wallC, 0, h / 2, 0));
    b.add(box(w + 0.4, 0.8, d + 0.4, trimC, 0, h + 0.1, 0));
    // крыша: панели
    b.add(box(w - 1, 0.25, d - 1, blue ? 0x3d6cf0 : 0xdfe6f3, 0, h + 0.55, 0));
    for (let x = -w / 2 + 4; x < w / 2 - 2; x += 4) b.add(box(0.15, 0.2, d - 2, blue ? 0x5a84f7 : 0xc8d2e6, x, h + 0.75, 0));
    for (let i = 0; i < 3; i++) b.add(box(1.6, 0.8, 1.6, 0xb8c2d6, w / 2 - 5 - i * 3, h + 1.0, -d / 2 + 3));
    // логотип на крыше
    const logo = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshStandardMaterial({ map: textTexture('◈', { w: 256, h: 256, bg: '#ffffff', color: '#2f5be0', font: 'bold 190px Arial' }) }));
    logo.rotation.x = -Math.PI / 2; logo.position.set(-w / 2 + 8, h + 0.9, 0);
    b.add(logo);
    // вывеска
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.2), new THREE.MeshBasicMaterial({ map: textTexture(`${site.id} · ${site.cfg.name}`, { w: 1024, h: 140, bg: '#ffffff', color: '#1f3fb0', font: 'bold 78px Inter, Arial' }) }));
    sign.position.set(w / 2 - 10, h - 1.4, d / 2 + 0.05);
    b.add(sign);
    // окна
    for (let x = -w / 2 + 3; x < w / 2 - 2; x += 3.2) b.add(box(1.8, 0.9, 0.1, blue ? 0xa9c1ff : 0x9db3e8, x, h - 1.4, -d / 2 - 0.05));
    G0.add(b);

    // ворота
    this.doors = [];
    site.docks.forEach((dk, i) => {
      const dg = new THREE.Group(); dg.position.set(dk.x, 0, d / 2);
      dg.userData.ref = { kind: 'dock', idx: i };
      dg.add(box(5.6, 5.8, 0.35, 0x1d2b5c, 0, 2.9, 0.1));
      dg.add(box(4.6, 4.9, 0.3, 0x0d1222, 0, 2.6, 0.15));
      const panel = box(4.6, 4.9, 0.2, 0xe9edf5, 0, 2.6, 0.3);
      dg.add(panel);
      for (let k = 0; k < 6; k++) { const l = box(4.6, 0.06, 0.05, 0xc3cbdb, 0, 0.6 + k * 0.8, 0.42); panel.add(l); l.position.set(0, -2.0 + k * 0.8, 0.12); }
      dg.add(box(5.2, 1.1, 2.2, 0x9aa3b5, 0, 0.55, 1.2)); // рампа
      dg.add(box(0.35, 0.9, 0.35, 0x111111, -2.1, 1.3, 2.25));
      dg.add(box(0.35, 0.9, 0.35, 0x111111, 2.1, 1.3, 2.25));
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: textTexture(String(i + 1), { w: 128, h: 80, bg: '#ffffff', color: '#1d2b5c', font: 'bold 64px Inter, Arial' }) }));
      num.position.set(0, 6.4, 0.36); dg.add(num);
      const lamp = box(0.5, 0.5, 0.2, 0x22c55e, 2.0, 6.4, 0.4, { emissive: 0x22c55e, emissiveIntensity: 0.8 });
      lamp.material = lamp.material.clone();
      dg.add(lamp);
      G0.add(dg);
      this.doors.push({ panel, lamp });
    });

    // зарядная станция
    const ch = new THREE.Group(); ch.position.set(site.charger.x, 0, site.charger.z - 2);
    ch.add(box(2.4, 2.2, 0.8, 0xf2f5fb, 0, 1.1, 0));
    ch.add(box(1.4, 0.4, 0.1, 0x22c55e, 0, 1.6, 0.42, { emissive: 0x22c55e, emissiveIntensity: 1 }));
    G0.add(ch);
    G0.add(plane(5, 5, 0xd6f5e0, site.charger.x, 0.05, site.charger.z));
    // парковка погрузчиков
    site.forklifts.forEach((f) => G0.add(plane(2.6, 3.6, 0xfff3c4, f.home.x, 0.05, f.home.z)));

    // КПП
    const gateX = -w / 2 - 6;
    const kpp = new THREE.Group(); kpp.position.set(gateX + 10, 0, R - 7.5);
    kpp.add(box(3, 2.8, 3, 0xf7f8fb, 0, 1.4, 0));
    kpp.add(box(3.4, 0.3, 3.4, 0x2f5be0, 0, 2.95, 0));
    kpp.add(box(3.05, 0.9, 1.6, 0x9db3e8, 0, 1.9, 0));
    kpp.add(box(9, 0.18, 0.18, 0xe11d48, -5.5, 1.1, 1.8));
    G0.add(kpp);

    // забор
    const fz0 = -d / 2 - 10, fz1 = R - 5, fx0 = -w / 2 - 34, fx1 = w / 2 + 22;
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 4);
      for (let i = 0; i <= n; i++) {
        const t = i / n; G0.add(box(0.14, 1.6, 0.14, 0xaab4c6, x0 + (x1 - x0) * t, 0.8, z0 + (z1 - z0) * t));
      }
      const rail = box(Math.abs(x1 - x0) || 0.08, 0.08, Math.abs(z1 - z0) || 0.08, 0xaab4c6, (x0 + x1) / 2, 1.4, (z0 + z1) / 2);
      rail.castShadow = false; G0.add(rail);
    };
    fence(fx0, fz0, fx1, fz0); fence(fx0, fz0, fx0, fz1); fence(fx1, fz0, fx1, fz1);
    fence(fx1, fz1, w / 2 + 2, fz1); fence(fx0, fz1, gateX - 4, fz1);

    // контейнер и декор
    const cont = box(12, 5, 4.8, 0x14b8a6, fx0 + 9, 2.5, fz0 + 5);
    G0.add(cont);
    for (let i = 0; i < 9; i++) G0.add(box(0.12, 4.9, 0.05, 0x0f8f83, fx0 + 4 + i * 1.2, 2.5, fz0 + 7.43));
    for (let i = 0; i < 4; i++) {
      const p = makePallet(Object.keys(site.stock)[i % 3]);
      p.position.set(w / 2 + 14 + (i % 2) * 1.8, 0, -d / 2 + 2 + Math.floor(i / 2) * 1.6);
      G0.add(p);
    }

    // деревья
    let seed = site.cfg.seed;
    const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 34; i++) {
      const side = i % 3;
      let x, z;
      if (side === 0) { x = -120 + r() * 240; z = R + 15 + r() * 22; }
      else if (side === 1) { x = fx0 - 6 - r() * 30; z = fz0 + r() * (fz1 - fz0 + 10); }
      else { x = -80 + r() * 170; z = fz0 - 6 - r() * 26; }
      const t = makeTree(0.8 + r() * 0.6); t.position.set(x, 0, z); G0.add(t);
    }
    for (let x = fx0 + 3; x < fx1; x += 9) { const t = makeTree(0.75); t.position.set(x, 0, fz0 - 2.5); G0.add(t); }

    this.resetView();
    this.cam.az = this.cam.tAz; this.cam.half = this.cam.tHalf; this.cam.target.copy(this.cam.tTarget);
  }

  // визуальный буфер: число паллет на площадке пропорционально заполненности склада
  updateStacks() {
    const s = this.site;
    const fill = s.totalStock / s.cfg.capacity;
    const n = Math.round(THREE.MathUtils.clamp(fill, 0, 1) * 22) + 2;
    const skus = Object.keys(s.stock).sort((a, b) => s.stock[b] - s.stock[a]);
    const key = n + skus.join();
    if (key === this.stackKey) return;
    this.stackKey = key;
    this.stackGroup.clear();
    for (let i = 0; i < n; i++) {
      const spot = s.stagingSpot(i % 9), lvl = Math.floor(i / 9);
      const p = makePallet(skus[i % skus.length]);
      p.position.set(spot.x, lvl * 1.12, spot.z); p.rotation.y = ((i * 37) % 7) * 0.03;
      this.stackGroup.add(p);
    }
  }

  // ---- синхронизация динамики ----
  syncDynamic(t) {
    const s = this.site;
    const alive = new Set();
    const ents = [...s.trucks, ...s.forklifts];
    for (const e of ents) {
      alive.add(e.id);
      let o = this.dyn.get(e.id);
      if (!o) {
        o = e.kind === 'truck' ? makeTruck(e) : makeForklift();
        o.userData.ref = { kind: e.kind, id: e.id };
        this.scene.add(o); this.dyn.set(e.id, o);
      }
      o.position.set(e.x, 0, e.z);
      o.rotation.y = e.heading;
      if (e.kind === 'truck') {
        const f = o.userData.fill;
        const p = e.pallets ? e.done / e.pallets : 0;
        f.scale.x = Math.max(0.001, (e.inbound ? 1 - p : p) * 10);
        f.position.x = -7 + f.scale.x / 2;
        f.material = mat(e.inbound ? 0xf5a524 : 0x22c55e);
        // покачивание при движении
        o.position.y = e.moving ? Math.abs(Math.sin(t * 9 + e.x)) * 0.05 : 0;
      } else {
        const u = o.userData;
        if (u.loadSku !== e.carrying) {
          u.load.clear();
          if (e.carrying) { const p = makePallet(e.carrying); p.scale.setScalar(0.85); u.load.add(p); }
          u.loadSku = e.carrying;
        }
        const prog = 1 - Math.max(0, e.timer || 0) / 0.9;
        const lift = e.state === 'carrying' ? 0.6 : e.state === 'picking' ? 0.6 * prog : e.state === 'dropping' ? 0.6 * (1 - prog) : 0;
        u.carriage.position.y += (lift - u.carriage.position.y) * 0.2;
        u.beacon.visible = e.moving ? Math.sin(t * 12) > 0 : false;
      }
    }
    for (const [id, o] of this.dyn) if (!alive.has(id)) { this.scene.remove(o); this.dyn.delete(id); const l = this.labels.get(id); if (l) { l.remove(); this.labels.delete(id); } }
    // двери
    s.docks.forEach((d, i) => {
      const dr = this.doors[i]; if (!dr) return;
      dr.panel.scale.y = Math.max(0.08, 1 - d.door * 0.92);
      dr.panel.position.y = 2.6 + (4.9 * (1 - dr.panel.scale.y)) / 2;
      const busy = !!d.truck;
      dr.lamp.material.color.setHex(busy ? 0xf59e0b : 0x22c55e);
      dr.lamp.material.emissive.setHex(busy ? 0xf59e0b : 0x22c55e);
    });
  }

  updateLabels() {
    const s = this.site, w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    const show = this.cam.half < 70;
    for (const t of s.trucks) {
      let l = this.labels.get(t.id);
      if (!l) { l = document.createElement('div'); l.className = 'tag'; this.labelLayer.appendChild(l); this.labels.set(t.id, l); }
      v.set(t.x, 6, t.z).project(this.camera);
      const st = truckStatus(t);
      const html = `<b>${t.id}</b><span class="dot ${st.cls}"></span>${st.short}`;
      if (l._h !== html) { l.innerHTML = html; l._h = html; }
      const sel = this.selected?.id === t.id;
      l.style.display = show || sel ? '' : 'none';
      l.classList.toggle('sel', sel);
      l.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
    for (const f of s.forklifts) {
      let l = this.labels.get(f.id);
      if (!l) { l = document.createElement('div'); l.className = 'tag small'; this.labelLayer.appendChild(l); this.labels.set(f.id, l); }
      v.set(f.x, 3.4, f.z).project(this.camera);
      if (l._h !== f.id) { l.textContent = f.id; l._h = f.id; }
      const sel = this.selected?.id === f.id;
      l.style.display = this.cam.half < 45 || sel ? '' : 'none';
      l.classList.toggle('sel', sel);
      l.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
  }

  setSelected(ref) { this.selected = ref; }

  selectedPos() {
    const r = this.selected; if (!r) return null;
    const s = this.site;
    if (r.kind === 'truck' || r.kind === 'forklift') {
      const e = [...s.trucks, ...s.forklifts].find((x) => x.id === r.id);
      return e ? { x: e.x, z: e.z, y: r.kind === 'truck' ? 5.2 : 3.2, r: r.kind === 'truck' ? 1.5 : 0.8 } : null;
    }
    if (r.kind === 'dock') { const d = s.docks[r.idx]; return { x: d.x, z: s.dockZ + 3, y: 7.4, r: 1 }; }
    if (r.kind === 'stock') return { x: s.staging.x, z: s.staging.z + 4.8, y: 4, r: 2.2 };
    if (r.kind === 'site') return { x: 0, z: 0, y: s.cfg.building.h + 1.5, r: 0 };
    return null;
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(p, this.camera);
    const hits = rc.intersectObjects([...this.dyn.values(), ...this.siteGroup.children], true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.ref) o = o.parent;
      if (o) { this.onPick(o.userData.ref); return; }
    }
    this.onPick(null);
  }
  hover(e) {
    if (this._hoverT && performance.now() - this._hoverT < 60) return;
    this._hoverT = performance.now();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(p, this.camera);
    const hit = rc.intersectObjects([...this.dyn.values(), ...this.siteGroup.children], true).find((h) => { let o = h.object; while (o && !o.userData.ref) o = o.parent; return !!o; });
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  }

  render(dt, t) {
    if (!this.site) return;
    this.updateCamera(dt);
    this.syncDynamic(t);
    this.updateStacks();
    const sp = this.selectedPos();
    if (sp) {
      this.selPin.visible = true;
      this.selPin.position.set(sp.x, sp.y + Math.sin(t * 3) * 0.4, sp.z);
      this.selPin.rotation.y = this.cam.az;
      this.selRing.visible = sp.r > 0;
      this.selRing.position.set(sp.x, 0.08, sp.z);
      this.selRing.scale.setScalar(sp.r * (1 + Math.sin(t * 4) * 0.06));
    } else { this.selPin.visible = false; this.selRing.visible = false; }
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }
}

export function truckStatus(t) {
  const op = t.inbound ? 'Разгрузка' : 'Погрузка';
  switch (t.state) {
    case 'arriving': return { text: 'Подъезжает к КПП', short: 'в пути', cls: 'blue' };
    case 'waiting': return { text: 'Ожидает ворота', short: 'ожидает', cls: 'amber' };
    case 'toDock': return { text: `Подаётся на ${t.dock?.id ?? 'ворота'}`, short: 'подача', cls: 'blue' };
    case 'docked': return { text: `${op} ${t.done}/${t.pallets}`, short: `${op.toLowerCase()} ${t.done}/${t.pallets}`, cls: 'green' };
    case 'closing': return { text: 'Оформление документов', short: 'документы', cls: 'green' };
    case 'departing': return { text: 'Убывает', short: 'убывает', cls: 'gray' };
    default: return { text: t.state, short: t.state, cls: 'gray' };
  }
}
