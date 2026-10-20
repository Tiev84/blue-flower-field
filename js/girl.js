import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The player: a girl in a pink striped shirt, white trousers, white sneakers,
// round glasses and long wavy black hair, built from simple lofts and skinned
// to a small humanoid rig. The walk cycle is motion capture retargeted from
// the Pisculli walk (models/walk.json holds per-bone local rotations relative
// to a bind pose whose world rotations are all identity).

// Bind pose joint positions (metres, facing +z, character's left = +x).
const ARM = new THREE.Vector3(0.828, -0.561, 0.03).normalize();
const FORE = new THREE.Vector3(0.826, -0.552, 0.13).normalize();
const J = {
  hips: [0, 0.86, 0], spine: [0, 0.96, 0.005], chest: [0, 1.1, 0], neck: [0, 1.29, -0.012], head: [0, 1.36, -0.005],
  hairA: [0, 1.4, -0.1], hairB: [0, 1.18, -0.13],
  clavL: [0.03, 1.232, -0.02], armL: [0.148, 1.205, -0.02],
  thighL: [0.085, 0.835, 0], shinL: [0.085, 0.47, 0.0], footL: [0.085, 0.095, -0.02], toeL: [0.085, 0.025, 0.085],
};
const elbow = new THREE.Vector3(...J.armL).addScaledVector(ARM, 0.25);
const wrist = elbow.clone().addScaledVector(FORE, 0.225);
J.foreL = elbow.toArray(); J.handL = wrist.toArray();
for (const k of Object.keys(J)) if (k.endsWith('L')) { const p = J[k]; J[k.slice(0, -1) + 'R'] = [-p[0], p[1], p[2]]; }
const V = (k) => new THREE.Vector3(...J[k]);

const COL = { skin: '#f7d8c6', shirt: '#f3b7cf', pants: '#f7f6f2', hair: '#1c1614', shoe: '#fbfbfb', sole: '#d9d9d9', frame: '#4a2f24' };

function stripes() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d'); g.fillStyle = COL.shirt; g.fillRect(0, 0, 64, 8);
  g.fillStyle = '#fde9f1'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 2, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; return t;
}

function faceTexture() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = COL.skin; g.fillRect(0, 0, W, H);
  // the front of the head is u = 0.25 (x = 128), equator v = 0.5 (y = 128)
  const cx = 128, ey = 132;
  g.fillStyle = 'rgba(255,140,150,0.35)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 30, ey + 26, 13, 8, 0, 0, 7); g.fill(); }
  for (const s of [-1, 1]) {
    const x = cx + s * 21;
    g.fillStyle = '#2a1a14'; g.beginPath(); g.ellipse(x, ey, 7.5, 9.5, 0, 0, 7); g.fill();
    g.fillStyle = '#5a3a2c'; g.beginPath(); g.ellipse(x, ey + 2.5, 5, 5.5, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 2.5, ey - 3.5, 2.6, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 2.6, ey + 3, 1.2, 0, 7); g.fill();
    g.strokeStyle = '#2a1a14'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, ey - 1, 9, 10.5, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.strokeStyle = '#3a2620'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x - 8 * s + s * 0, ey - 18); g.quadraticCurveTo(x, ey - 22, x + 9 * s, ey - 17); g.stroke();
  }
  g.fillStyle = 'rgba(200,120,110,0.5)'; g.beginPath(); g.ellipse(cx, ey + 17, 2, 1.4, 0, 0, 7); g.fill();
  g.strokeStyle = '#c96a6a'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 6, ey + 29); g.quadraticCurveTo(cx, ey + 34, cx + 6, ey + 29); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function hairTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = COL.hair; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 128; g.strokeStyle = `rgba(${90 + Math.random() * 40},${70 + Math.random() * 30},${60 + Math.random() * 30},${0.25 + Math.random() * 0.3})`;
    g.lineWidth = 0.6 + Math.random(); g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= 128; y += 8) g.lineTo(x + Math.sin(y * 0.09 + i) * 3, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------------------------------------------------------------- skinning
// weights: array of [boneName, w]; helpers return a function pos -> weights
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'hairA', 'hairB', 'clavL', 'armL', 'foreL', 'handL', 'clavR', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));

function finish(geo, weightFn, mat) {
  const p = geo.attributes.position, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const w = weightFn(v).filter((x) => x[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = w.reduce((a, x) => a + x[1], 0) || 1;
    w.forEach((x, k) => { si[i * 4 + k] = BI[x[0]]; sw[i * 4 + k] = x[1] / s; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) geo.deleteAttribute(k);
  const out = geo.index ? geo.toNonIndexed() : geo;
  out.userData.mat = mat;
  return out;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// blend along a chain of joints: weights by projection onto the segments
function chainWeights(names, blend = 0.035) {
  const pts = names.map(V);
  return (p) => {
    // segment i goes pts[i] -> pts[i+1] and belongs to names[i]
    let best = 0, bt = 0, bd = 1e9;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      ab.subVectors(pts[i + 1], pts[i]); ap.subVectors(p, pts[i]);
      const L = ab.length(); let t = ap.dot(ab) / (L * L);
      const tc = Math.min(1, Math.max(0, t));
      const d = ap.addScaledVector(ab, -tc).length() + (t < 0 || t > 1 ? 0.0001 : 0);
      if (d < bd) { bd = d; best = i; bt = t * L; }
    }
    const L = pts[best + 1].distanceTo(pts[best]);
    const out = [[names[best], 1]];
    if (best > 0 && bt < blend) { const w = 0.5 * (1 - smooth(-blend, blend, bt)); out[0][1] = 1 - w; out.push([names[best - 1], w]); }
    if (best < names.length - 2 && bt > L - blend) { const w = 0.5 * smooth(L - blend, L + blend, bt); out[0][1] -= w; out.push([names[best + 1], w]); }
    if (best === names.length - 2 && names.length > 2 && bt > L) out[0] = [names[best + 1], 1];
    return out;
  };
}

// tube along a path with per-point radius (rings perpendicular to the path)
function tube(path, radii, seg = 10, capEnd = false, scaleZ = 1) {
  const pos = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < path.length; i++) {
    const t = new THREE.Vector3().subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize();
    let a = new THREE.Vector3().crossVectors(t, up); if (a.lengthSq() < 1e-4) a.set(1, 0, 0); a.normalize();
    const b = new THREE.Vector3().crossVectors(a, t).normalize();
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      const q = path[i].clone().addScaledVector(a, Math.cos(th) * radii[i]).addScaledVector(b, Math.sin(th) * radii[i] * scaleZ);
      pos.push(q.x, q.y, q.z); uv.push(k / seg, i / (path.length - 1));
    }
  }
  const R = seg + 1;
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * R + k, b = a + 1, c = a + R, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  if (capEnd) {
    const ci = pos.length / 3, e = path[path.length - 1]; pos.push(e.x, e.y, e.z); uv.push(0.5, 1);
    for (let k = 0; k < seg; k++) idx.push((path.length - 1) * R + k, ci, (path.length - 1) * R + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

// vertical loft of ellipses: rows [y, rx, rzFront, rzBack, zc]
function loft(rows, seg = 24, opts = {}) {
  const pos = [], uv = [], idx = [];
  const { cap = false, back = 0 } = opts;
  rows.forEach(([y, rx, rf, rb, zc = 0], i) => {
    for (let k = 0; k <= seg; k++) {
      const th = (k / seg) * Math.PI * 2; // 0 = +x, PI/2 = +z (front)
      const s = Math.sin(th), c = Math.cos(th);
      const rz = s > 0 ? rf : rb;
      // the back of the shirt hangs a little lower
      const yy = y - (opts.hemDrop && i === 0 ? Math.max(0, -s) * opts.hemDrop : 0);
      pos.push(c * rx, yy, zc + s * rz); uv.push(k / seg * (opts.uRep || 1), y * (opts.vRep || 1));
    }
  });
  const R = seg + 1;
  for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * R + k, b = a + 1, c = a + R, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  if (cap) {
    const top = rows[rows.length - 1]; const ci = pos.length / 3; pos.push(0, top[0] + 0.005, top[4] || 0); uv.push(0, 0);
    for (let k = 0; k < seg; k++) idx.push((rows.length - 1) * R + k, (rows.length - 1) * R + k + 1, ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function ellipsoid(c, r, ws = 16, hs = 12, phiStart = 0, phiLen = Math.PI * 2, thStart = 0, thLen = Math.PI) {
  const g = new THREE.SphereGeometry(1, ws, hs, phiStart, phiLen, thStart, thLen);
  g.scale(r[0], r[1], r[2]); g.translate(c[0], c[1], c[2]); return g;
}

const fixed = (name) => () => [[name, 1]];

export function buildGirl(walk) {
  const shirtTex = stripes();
  const mats = {
    skin: new THREE.MeshToonMaterial({ color: COL.skin }),
    face: new THREE.MeshToonMaterial({ map: faceTexture() }),
    shirt: new THREE.MeshToonMaterial({ map: shirtTex }),
    collar: new THREE.MeshToonMaterial({ map: shirtTex, side: THREE.DoubleSide }),
    pants: new THREE.MeshToonMaterial({ color: COL.pants }),
    hair: new THREE.MeshToonMaterial({ map: hairTexture(), side: THREE.DoubleSide }),
    shoe: new THREE.MeshToonMaterial({ color: COL.shoe }),
    sole: new THREE.MeshToonMaterial({ color: COL.sole }),
    frame: new THREE.MeshToonMaterial({ color: COL.frame }),
    button: new THREE.MeshToonMaterial({ color: '#ffffff' }),
  };
  const grad = new THREE.DataTexture(new Uint8Array([185, 185, 185, 255, 228, 228, 228, 255, 255, 255, 255, 255]), 3, 1);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  for (const m of Object.values(mats)) m.gradientMap = grad;

  const parts = [];
  const add = (g, w, mat) => parts.push(finish(g, w, mat));

  // --- legs (straight white trousers) and sneakers
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    const P = [V('thigh' + s).add(new THREE.Vector3(0, 0.04, 0)), V('thigh' + s), V('thigh' + s).lerp(V('shin' + s), 0.5), V('shin' + s), V('shin' + s).lerp(V('foot' + s), 0.5), V('foot' + s).add(new THREE.Vector3(0, 0.035, 0))];
    add(tube(P, [0.085, 0.085, 0.074, 0.064, 0.06, 0.062], 12), chainWeights(['thigh' + s, 'shin' + s, 'foot' + s], 0.06), 'pants');
    // ankle
    add(tube([V('foot' + s).add(new THREE.Vector3(0, 0.05, 0)), V('foot' + s).add(new THREE.Vector3(0, -0.02, 0))], [0.038, 0.04], 8), fixed('foot' + s), 'skin');
    // sneaker: rounded body from heel to toe + sole
    const f = V('foot' + s), t = V('toe' + s);
    const shoe = ellipsoid([x * 0.085, 0.045, 0.03], [0.05, 0.05, 0.115], 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
    add(shoe, (p) => (p.z > 0.06 ? [['toe' + s, smooth(0.06, 0.1, p.z)], ['foot' + s, 1 - smooth(0.06, 0.1, p.z)]] : [['foot' + s, 1]]), 'shoe');
    const sole = ellipsoid([x * 0.085, 0.018, 0.03], [0.054, 0.02, 0.12], 14, 6);
    add(sole, (p) => (p.z > 0.06 ? [['toe' + s, smooth(0.06, 0.1, p.z)], ['foot' + s, 1 - smooth(0.06, 0.1, p.z)]] : [['foot' + s, 1]]), 'sole');
    void f; void t;
  }
  // pelvis
  add(loft([[0.7, 0.12, 0.08, 0.09], [0.78, 0.145, 0.088, 0.1], [0.86, 0.14, 0.085, 0.095], [0.9, 0.125, 0.075, 0.085]], 20),
    (p) => {
      const side = p.x > 0 ? 'L' : 'R'; const leg = smooth(0.82, 0.68, p.y) * smooth(0.02, 0.09, Math.abs(p.x));
      return [['hips', 1 - leg], ['thigh' + side, leg]];
    }, 'pants');

  // --- shirt: a loose loft from the hem to the shoulders
  const shirtRows = [
    [0.76, 0.175, 0.125, 0.13], [0.82, 0.168, 0.118, 0.123], [0.92, 0.152, 0.105, 0.11], [1.0, 0.146, 0.1, 0.104],
    [1.1, 0.152, 0.108, 0.105], [1.18, 0.16, 0.105, 0.1], [1.22, 0.156, 0.094, 0.09], [1.25, 0.137, 0.082, 0.08, -0.005], [1.275, 0.097, 0.064, 0.065, -0.01], [1.295, 0.052, 0.05, 0.05, -0.012],
  ];
  const torsoW = (p) => {
    const w = [];
    const hs = 1 - smooth(0.9, 1.0, p.y), ch = smooth(1.02, 1.12, p.y);
    w.push(['hips', hs]); w.push(['spine', Math.max(0, 1 - hs - ch)]); w.push(['chest', ch]);
    const ax = Math.abs(p.x), side = p.x > 0 ? 'L' : 'R';
    const sh = smooth(0.11, 0.16, ax) * smooth(1.14, 1.24, p.y);
    if (sh > 0) { for (const x of w) x[1] *= 1 - sh * 0.5; w.push(['arm' + side, sh * 0.35]); w.push(['clav' + side, sh * 0.15]); }
    // the hem follows the thighs a little so they don't poke through
    const hem = (1 - smooth(0.76, 0.86, p.y)) * 0.25;
    if (hem > 0) { for (const x of w) x[1] *= 1 - hem; w.push(['thigh' + side, hem]); }
    return w;
  };
  add(loft(shirtRows, 28, { uRep: 7, vRep: 1, hemDrop: 0.03 }), torsoW, 'shirt');
  // collar: two flaps standing around the neck, open at the front
  {
    const pos = [], idx = [], uv = []; const seg = 16;
    for (let k = 0; k <= seg; k++) {
      const th = Math.PI / 2 + 0.35 + (k / seg) * (Math.PI * 2 - 0.7);
      const c = Math.cos(th), s = Math.sin(th);
      pos.push(c * 0.06, 1.285, -0.012 + s * 0.055, c * 0.085, 1.245, -0.012 + s * 0.08);
      uv.push(k / seg * 3, 0, k / seg * 3, 0.3);
    }
    for (let k = 0; k < seg; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); add(g, fixed('chest'), 'collar');
  }
  const rfAt = (y) => { for (let i = 0; i < shirtRows.length - 1; i++) { const a = shirtRows[i], b = shirtRows[i + 1]; if (y >= a[0] && y <= b[0]) return a[2] + (b[2] - a[2]) * (y - a[0]) / (b[0] - a[0]); } return 0.1; };
  for (let i = 0; i < 5; i++) {
    const y = 1.17 - i * 0.09; const z = rfAt(y) + 0.001;
    add(ellipsoid([0, y, z], [0.008, 0.008, 0.004], 6, 4), y > 1.05 ? fixed('chest') : fixed('spine'), 'button');
  }

  // --- arms: sleeves, cuffs, hands
  for (const s of ['L', 'R']) {
    const sh = V('arm' + s), el = V('fore' + s), wr = V('hand' + s);
    const P = [sh.clone().lerp(V('clav' + s), 0.75), sh, sh.clone().lerp(el, 0.5), el, el.clone().lerp(wr, 0.5), wr.clone().lerp(el, 0.12)];
    add(tube(P, [0.04, 0.056, 0.051, 0.047, 0.045, 0.046], 12, false), chainWeights(['clav' + s, 'arm' + s, 'fore' + s], 0.05), 'shirt');
    const dir = new THREE.Vector3().subVectors(wr, el).normalize();
    add(tube([wr.clone().addScaledVector(dir, -0.04), wr.clone().addScaledVector(dir, -0.005)], [0.049, 0.049], 12), fixed('fore' + s), 'shirt');
    // hand: a soft mitten
    const hand = new THREE.SphereGeometry(1, 10, 8); hand.scale(0.028, 0.045, 0.04);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    hand.applyQuaternion(q); const hc = wr.clone().addScaledVector(dir, 0.045); hand.translate(hc.x, hc.y, hc.z);
    add(hand, fixed('hand' + s), 'skin');
    add(tube([wr.clone().addScaledVector(dir, -0.02), wr.clone().addScaledVector(dir, 0.02)], [0.03, 0.03], 8), fixed('hand' + s), 'skin');
  }

  // --- neck and head
  add(tube([new THREE.Vector3(0, 1.24, -0.015), new THREE.Vector3(0, 1.38, -0.01)], [0.042, 0.04], 10), (p) => [['neck', 1 - smooth(1.33, 1.38, p.y)], ['head', smooth(1.33, 1.38, p.y)]], 'skin');
  const HC = [0, 1.47, 0.005], HR = [0.112, 0.128, 0.118];
  const head = ellipsoid(HC, HR, 28, 20);
  add(head, fixed('head'), 'face');
  for (const x of [-1, 1]) add(ellipsoid([x * 0.112, 1.46, -0.005], [0.016, 0.028, 0.018], 8, 6), fixed('head'), 'skin');

  // glasses: two round rims, a bridge and temples
  for (const x of [-1, 1]) {
    const rim = new THREE.TorusGeometry(0.031, 0.0033, 6, 20); rim.translate(x * 0.042, 1.465, 0.122);
    rim.rotateX(0); add(rim, fixed('head'), 'frame');
    add(tube([new THREE.Vector3(x * 0.075, 1.47, 0.115), new THREE.Vector3(x * 0.112, 1.475, 0.06), new THREE.Vector3(x * 0.116, 1.47, -0.02)], [0.004, 0.004, 0.004], 5), fixed('head'), 'frame');
  }
  add(tube([new THREE.Vector3(-0.011, 1.472, 0.126), new THREE.Vector3(0, 1.476, 0.128), new THREE.Vector3(0.011, 1.472, 0.126)], [0.0035, 0.0035, 0.0035], 5), fixed('head'), 'frame');

  // --- hair: scalp cap with a centre parting, long wavy curtain down the back
  // and two locks falling over the front of the shoulders
  {
    const cap = ellipsoid([HC[0], HC[1] + 0.006, HC[2] - 0.006], [HR[0] + 0.012, HR[1] + 0.012, HR[2] + 0.012], 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
    // pull the front edge up to make a hairline and leave the face open
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const front = Math.max(0, (z - HC[2]) / (HR[2] + 0.012));
      if (front > 0.3) {
        // a soft centre parting: the hairline is highest in the middle and
        // comes down towards the temples
        const ax = Math.min(1, Math.abs(x) / 0.1);
        const line = HC[1] + 0.058 - smooth(0.25, 0.85, ax) * 0.075;
        const yy = Math.max(y, line * smooth(0.3, 0.7, front) + y * (1 - smooth(0.3, 0.7, front)));
        p.setY(i, yy);
      }
    }
    cap.computeVertexNormals();
    add(cap, fixed('head'), 'hair');
    // the curtain: a partial lathe hanging from the crown, open at the face;
    // its front edges fall over the front of the shoulders
    const pos = [], uv = [], idx = [];
    const rows = 16, seg = 28, A = Math.PI * 0.7;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows; const y = 1.53 - t * 0.64;
      for (let k = 0; k <= seg; k++) {
        const u = k / seg; const a = (u * 2 - 1) * A; // 0 = back (-z)
        const edge = Math.abs(u * 2 - 1);
        let r = 0.131 + smooth(0.0, 0.18, t) * 0.012 + smooth(0.22, 0.5, t) * 0.07 + t * 0.015;
        r += (Math.sin(t * 15 + u * 7) * 0.009 + Math.sin(u * 37) * 0.004) * smooth(0.15, 0.5, t);
        const x = Math.sin(a) * r;
        let z = -Math.cos(a) * r * (t > 0.3 ? 0.8 : 1) - 0.01;
        // locks in front of the shoulders are shorter than the back
        let yy = y + (t === 1 ? Math.sin(u * 31) * 0.025 : 0);
        yy += smooth(0.75, 1, edge) * t * 0.18;
        if (t > 0.3) z += smooth(0.8, 1, edge) * 0.02;
        pos.push(x, yy, z); uv.push(u * 3, t * 2);
      }
    }
    const R = seg + 1;
    for (let i = 0; i < rows; i++) for (let k = 0; k < seg; k++) { const a = i * R + k; idx.push(a, a + R, a + 1, a + 1, a + R, a + R + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    add(g, (p) => {
      const back = p.z < 0.0;
      const d = 1.42 - p.y;
      if (!back) return [['head', 1 - smooth(0.0, 0.2, d) * 0.85], ['chest', smooth(0.0, 0.2, d) * 0.85]];
      return [['head', 1 - smooth(0.02, 0.22, d)], ['hairA', smooth(0.02, 0.22, d) * (1 - smooth(0.28, 0.5, d))], ['hairB', smooth(0.28, 0.5, d)]];
    }, 'hair');
  }

  // ---------------------------------------------------------------- rig
  const groups = {};
  for (const g of parts) (groups[g.userData.mat] ||= []).push(g);
  const order = Object.keys(groups);
  const geo = mergeGeometries(order.map((k) => mergeGeometries(groups[k], false)), true);
  const bones = {}; const list = [];
  for (const [name, parent] of walk.bones) {
    const b = new THREE.Bone(); b.name = name; bones[name] = b; list.push(b);
    const p = V(name); if (parent) p.sub(V(parent));
    b.position.copy(p);
    if (parent) bones[parent].add(b);
  }
  const skel = new THREE.Skeleton(list);
  const mesh = new THREE.SkinnedMesh(geo, order.map((k) => mats[k]));
  const root = new THREE.Group(); root.add(mesh);
  mesh.add(bones.hips); root.updateMatrixWorld(true); mesh.bind(skel);
  mesh.castShadow = true; mesh.frustumCulled = false;
  return new GirlRig(root, mesh, bones, walk);
}

// ---------------------------------------------------------------- animation
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const idle = {};
// relaxed standing: arms hang by the sides (bind pose has them 34 degrees out)
idle.armL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0, -0.92));
idle.armR = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0, 0.92));
idle.foreL = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.1, -0.1));
idle.foreR = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, -0.1, 0.1));

const AMP = { thighL: 1.35, thighR: 1.35, shinL: 1.25, shinR: 1.25, armL: 1.3, armR: 1.3, foreL: 1.2, foreR: 1.2 };

export class GirlRig {
  constructor(root, mesh, bones, walk, opts = {}) {
    this.opts = opts;
    this.parent = Object.fromEntries(walk.bones.map((b) => [b[0], b[1]]));
    this.root = root; this.mesh = mesh; this.bones = bones; this.walk = walk;
    this.T = walk.times[walk.times.length - 1]; this.phase = 0; this.blend = 0; this.time = 0;
    this.names = walk.bones.map((b) => b[0]);
    this.q = Object.fromEntries(this.names.map((n) => [n, walk.q[n].map((a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]))]));
    this.hipsY = bones.hips.position.y;
    bones.head.scale.setScalar(opts.headScale || 1.12); // a slightly bigger head reads cuter
    // markers under the soles to keep the lowest foot on the ground
    this.markers = [];
    for (const s of ['L', 'R']) {
      const heel = new THREE.Object3D(); heel.position.set(0, -0.09, -0.02); bones['foot' + s].add(heel);
      const toe = new THREE.Object3D(); toe.position.set(0, -0.022, 0.05); bones['toe' + s].add(toe);
      this.markers.push(heel, toe);
    }
    this.stride = this.measureStride();
    this.lift = 0;
  }
  sample(t, out) {
    const ts = this.walk.times; t = ((t % this.T) + this.T) % this.T;
    let i = 0; while (i < ts.length - 2 && ts[i + 1] < t) i++;
    const f = (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i]);
    for (const n of this.names) {
      out[n] = (out[n] || new THREE.Quaternion()).copy(this.q[n][i]).slerp(this.q[n][i + 1], Math.min(1, Math.max(0, f)));
      const amp = AMP[n] || 1; if (amp !== 1) out[n].copy(_q3.identity().slerp(out[n], amp));
    }
    // a bind pose that differs from the capture's (arms hanging instead of
    // out at 34 degrees): local' = conj(Q parent) * local * Q bone
    const Q = this.opts.Q;
    if (Q) for (const n of this.names) {
      const qb = Q[n], qp = Q[this.parent[n]];
      if (qb || qp) { const o = out[n]; if (qp) o.premultiply(_q3.copy(qp).invert()); if (qb) o.multiply(qb); }
    }
    return out;
  }
  measureStride() {
    // how far a planted foot travels per second of animation
    const pose = {}; let prev = null; let dist = 0; let n = 0; const p = new THREE.Vector3();
    for (let k = 0; k <= 120; k++) {
      this.sample((k / 120) * this.T, pose);
      for (const nm of this.names) this.bones[nm].quaternion.copy(pose[nm]);
      this.root.updateMatrixWorld(true);
      this.bones.footL.getWorldPosition(p);
      if (prev && p.y < 0.13) { dist += Math.max(0, prev - p.z); n++; }
      prev = p.z;
    }
    return dist / (this.T * Math.max(1, n) / 120); // metres per second while planted
  }
  update(dt, speed) {
    this.time += dt;
    const target = Math.min(1, speed / 0.6);
    this.blend += (target - this.blend) * Math.min(1, dt * 8);
    const rate = speed > 0.05 ? speed / this.stride : 1;
    this.phase += dt * Math.max(0.6, rate) * (this.blend > 0.02 ? 1 : 0);
    const pose = this.sample(this.phase, this._pose || (this._pose = {}));
    const br = Math.sin(this.time * 2.2);
    for (const n of this.names) {
      const b = this.bones[n];
      _q.copy((this.opts.idle || idle)[n] || _q2.identity());
      if (n === 'chest') _q.multiply(_q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), br * 0.012));
      if (n === 'head') _q.multiply(_q2.setFromEuler(new THREE.Euler(Math.sin(this.time * 0.7) * 0.03, Math.sin(this.time * 0.45) * 0.06, 0)));
      if (n === 'hairA' || n === 'hairB') _q.multiply(_q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.sin(this.time * 1.3) * 0.02));
      b.quaternion.copy(_q).slerp(pose[n], this.blend);
    }
    // keep the lowest sole on the ground
    const h = this.bones.hips; h.position.y = this.hipsY;
    this.root.updateMatrixWorld(true);
    let lo = 1e9; const p = new THREE.Vector3();
    for (const m of this.markers) { m.getWorldPosition(p); lo = Math.min(lo, p.y - this.root.position.y); }
    this.lift += (-lo - this.lift) * Math.min(1, dt * 20);
    h.position.y = this.hipsY + this.lift;
  }
}
