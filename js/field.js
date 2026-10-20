import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The endless blue flower field: a sky dome with cartoon clouds, a ground
// that reads as a carpet of flowers in the distance, and instanced flowers
// and grass that wrap around the player on the GPU (one tile follows the
// player, so the field never ends and costs nothing on the CPU).

export const ROAD = { x: 0, half: 1.25, z0: 6.9 };  // straight road along +z, starting at the garden
export const HOUSE_CLEAR = 7.2;                     // no flowers on the house plot

export const SKY = { top: new THREE.Color('#2f7be8'), mid: new THREE.Color('#79b4f5'), horizon: new THREE.Color('#e3f0ff') };

// shared GLSL: which ground spots are kept clear of flowers
const CLEAR_GLSL = /* glsl */`
  uniform vec3 uPlayer;
  uniform float uTile;
  uniform float uTime;
  float clearMask(vec2 p) {
    float road = step(abs(p.x - ${ROAD.x.toFixed(2)}), ${(ROAD.half + 0.25).toFixed(2)}) * step(${(ROAD.z0 - 0.6).toFixed(2)}, p.y);
    float house = step(abs(p.x), ${HOUSE_CLEAR.toFixed(2)}) * step(abs(p.y), ${HOUSE_CLEAR.toFixed(2)});
    return max(road, house);
  }
`;

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY.top }, mid: { value: SKY.mid }, horizon: { value: SKY.horizon }, sun: { value: new THREE.Vector3(0.4, 0.55, -0.73).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, mid, horizon, sun; varying vec3 vDir;
      void main(){ float h = max(vDir.y, 0.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.15, 0.75, h));
        float s = max(dot(normalize(vDir), sun), 0.0); c += vec3(1.0,0.95,0.8) * (pow(s, 40.0) * 0.6 + pow(s, 6.0) * 0.12);
        if (vDir.y < 0.0) c = horizon;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat); sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // fluffy clouds: clumps of flattened spheres with a soft blue underside
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#cfe0f7', emissiveIntensity: 0.55, fog: false });
  const clouds = new THREE.Group();
  const rnd = mulberry(7);
  const base = new THREE.IcosahedronGeometry(1, 2);
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, d = 230 + rnd() * 150, h = 45 + rnd() * 70;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, s = 9 + rnd() * 10;
    const n = 6 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const g = base.clone();
      const r = s * (0.55 + rnd() * 0.6) * (k === 0 ? 1.3 : 1);
      const ox = (rnd() - 0.5) * s * 3.4, oy = rnd() * s * 0.6, oz = (rnd() - 0.5) * s * 1.2;
      g.scale(r * 1.15, r * 0.8, r); g.translate(cx + ox, h + oy, cz + oz);
      parts.push(g);
    }
  }
  // a low bank of clouds sitting on the horizon
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rnd() * 0.2, d = 470 + rnd() * 60, s = 14 + rnd() * 12;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    for (let k = 0; k < 5; k++) {
      const g = base.clone(); const r = s * (0.6 + rnd() * 0.6);
      g.scale(r * 1.6, r * 0.75, r); g.translate(cx + (rnd() - 0.5) * s * 3, -r * 0.1 + rnd() * s * 0.35, cz + (rnd() - 0.5) * s * 1.5);
      parts.push(g);
    }
  }
  const cm = new THREE.Mesh(mergeGeometries(parts), cloudMat); cm.frustumCulled = false;
  clouds.add(cm); scene.add(clouds);
  return {
    update(dt, player) { sky.position.set(player.x, 0, player.z); clouds.position.set(player.x, 0, player.z); clouds.rotation.y += dt * 0.004; },
  };
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- ground
export function createGround(scene, uniforms) {
  const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', fog: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW;
      ${CLEAR_GLSL}
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      vec3 L(float r, float g, float b){ return pow(vec3(r, g, b), vec3(2.2)); } // sRGB -> linear
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec2 p = vW.xz;
        float n = vnoise(p * 0.08) * 0.6 + vnoise(p * 0.31) * 0.4;
        vec3 grass = mix(L(0.22, 0.42, 0.18), L(0.34, 0.56, 0.26), vnoise(p * 0.5));
        vec3 bloom = mix(L(0.27, 0.47, 0.95), L(0.52, 0.7, 1.0), n);
        float d = length(vW.xz - uPlayer.xz);
        // near the player the real flowers stand on green; farther out the ground itself turns into flowers
        float far = smoothstep(uTile * 0.22, uTile * 0.46, d);
        vec2 cell = floor(p * 4.0); vec2 f = fract(p * 4.0) - 0.5;
        vec2 o = vec2(h21(cell), h21(cell + 7.1)) - 0.5;
        float r = length(f - o * 0.35);
        float dot_ = 1.0 - smoothstep(0.2, 0.3, r);
        float heart = 1.0 - smoothstep(0.05, 0.11, r);
        float fade = smoothstep(5.0, 16.0, d);
        float speck = mix(dot_, 0.7, fade);
        vec3 petal = mix(bloom, L(0.95, 0.97, 1.0), heart * (1.0 - fade));
        vec3 c = mix(grass, petal, clamp(mix(0.15 + speck * 0.8, 0.86 + n * 0.1, far), 0.0, 1.0));
        // distance haze towards a soft blue, meeting the sky at the horizon
        float patchy = vnoise(p * 0.03) * 0.65 + vnoise(p * 0.11) * 0.35;
        vec3 farc = mix(L(0.2, 0.34, 0.82), L(0.3, 0.46, 0.92), patchy);
        farc = mix(farc, L(0.3, 0.48, 0.26), smoothstep(0.75, 0.92, vnoise(p * 0.05 + 3.0)) * 0.45);
        c = mix(c, farc, smoothstep(14.0, 60.0, d) * 0.85);
        // aerial perspective: the far field pales gently into the sky
        c = mix(c, L(0.6, 0.72, 0.95), smoothstep(70.0, 680.0, d) * 0.85);
        float plot = step(abs(p.x), ${(HOUSE_CLEAR - 0.6).toFixed(2)}) * step(abs(p.y), ${(HOUSE_CLEAR - 0.6).toFixed(2)});
        c = mix(c, grass * 1.05, plot * (1.0 - far));
        vec4 diffuseColor = vec4( c, opacity );`);
  };
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
  return { mesh: m, update(player) { m.position.set(Math.round(player.x / 10) * 10, 0, Math.round(player.z / 10) * 10); } };
}

// ---------------------------------------------------------------- flowers
function flowerGeometry() {
  // a nemophila: five rounded, slightly cupped petals with a white heart,
  // on a thin stem with two leaves. Vertex colours carry the shading.
  const pos = [], col = [], nrm = [];
  const push = (p, c, n) => { pos.push(...p); col.push(...c); nrm.push(...n); };
  const white = [0.86, 0.93, 1.0], mid = [0.2, 0.44, 1.0], edge = [0.045, 0.17, 0.88], green = [0.07, 0.26, 0.05], dark = [0.03, 0.12, 0.02];
  const H = 1; // head height is unit; instances scale it
  const R = 0.36;
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI * 2;
    const fan = 2;
    for (let j = 0; j < fan; j++) {
      const t0 = a0 - 0.55 + (j / fan) * 1.1, t1 = a0 - 0.55 + ((j + 1) / fan) * 1.1;
      const rr = (t) => R * (0.75 + 0.25 * Math.cos((t - a0) * 2.6));
      const P0 = [0, H, 0];
      const P1 = [Math.cos(t0) * rr(t0), H + rr(t0) * 0.45, Math.sin(t0) * rr(t0)];
      const P2 = [Math.cos(t1) * rr(t1), H + rr(t1) * 0.45, Math.sin(t1) * rr(t1)];
      const m0 = [P1[0] * 0.3, H + 0.04, P1[2] * 0.3], m1 = [P2[0] * 0.3, H + 0.04, P2[2] * 0.3];
      const n = [0, 1, 0];
      push(P0, white, n); push(m0, white, n); push(m1, white, n);
      push(m0, mid, n); push(P1, edge, n); push(P2, edge, n);
      push(m0, mid, n); push(P2, edge, n); push(m1, mid, n);
    }
  }
  // the dark-dotted centre
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, b = ((k + 1) / 5) * Math.PI * 2;
    push([0, H + 0.05, 0], [0.95, 0.8, 0.3], [0, 1, 0]); push([Math.cos(a) * 0.06, H + 0.04, Math.sin(a) * 0.06], [0.08, 0.09, 0.22], [0, 1, 0]); push([Math.cos(b) * 0.06, H + 0.04, Math.sin(b) * 0.06], [0.08, 0.09, 0.22], [0, 1, 0]);
  }
  // face the petals upwards (counter-clockwise seen from above)
  for (let v = 0; v < pos.length / 3; v += 3) {
    for (const arr of [pos, col, nrm]) for (let c = 0; c < 3; c++) { const a = (v + 1) * 3 + c, b = (v + 2) * 3 + c; const t = arr[a]; arr[a] = arr[b]; arr[b] = t; }
  }
  // stem: two crossed ribbons
  for (const [dx, dz] of [[0.025, 0.012]]) {
    const q = [[-dx, 0, -dz], [dx, 0, dz], [dx, H, dz], [-dx, H, -dz]];
    const n = [dz * 40, 0, dx * 40];
    for (const i of [0, 1, 2, 0, 2, 3]) push(q[i], i < 2 ? dark : green, n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

function farFlowerGeometry() {
  // a cheap distant bloom: a pentagon head on a single ribbon
  const pos = [], col = [], nrm = [];
  const blue = [0.06, 0.2, 0.9], light = [0.3, 0.55, 1.0], green = [0.05, 0.2, 0.04];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, b = ((k + 1) / 5) * Math.PI * 2;
    pos.push(0, 1.04, 0, Math.cos(b) * 0.4, 1, Math.sin(b) * 0.4, Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4);
    col.push(...light, ...blue, ...blue); nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  pos.push(-0.03, 0, 0, 0.03, 0, 0, 0.03, 1, 0, -0.03, 0, 0, 0.03, 1, 0, -0.03, 1, 0);
  for (let i = 0; i < 6; i++) { col.push(...green); nrm.push(0, 0, 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

function grassGeometry() {
  const pos = [], col = [], nrm = [];
  const rnd = mulberry(3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + rnd() * 0.4, w = 0.022, h = 0.7 + rnd() * 0.5, lean = (rnd() - 0.5) * 0.3;
    const cx = Math.cos(a), sz = Math.sin(a);
    const b0 = [-cx * w, 0, -sz * w], b1 = [cx * w, 0, sz * w], t = [lean * sz, h, lean * cx];
    const n = [sz, 0.4, -cx];
    pos.push(...b0, ...b1, ...t); col.push(0.03, 0.15, 0.02, 0.03, 0.15, 0.02, 0.12, 0.36, 0.06); nrm.push(...n, ...n, ...n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

function scatter(base, count, tile, seed, sizeRange, heightRange) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes = base.attributes;
  const rnd = mulberry(seed);
  const off = new Float32Array(count * 4), tint = new Float32Array(count * 3);
  const side = Math.ceil(Math.sqrt(count)), cell = tile / side;
  for (let i = 0; i < count; i++) {
    const gx = i % side, gz = Math.floor(i / side);
    off[i * 4] = (gx + rnd()) * cell - tile / 2;
    off[i * 4 + 1] = (gz + rnd()) * cell - tile / 2;
    off[i * 4 + 2] = sizeRange[0] + rnd() * (sizeRange[1] - sizeRange[0]);  // head size
    off[i * 4 + 3] = heightRange[0] + rnd() * (heightRange[1] - heightRange[0]); // stem height
    const v = rnd();
    tint[i * 3] = 0.85 + v * 0.3; tint[i * 3 + 1] = 0.9 + rnd() * 0.2; tint[i * 3 + 2] = rnd() * Math.PI * 2;
  }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  g.instanceCount = count;
  return g;
}

function instancedMaterial(uniforms, kind, tile = null, ring = null) {
  const T = tile ? tile.toFixed(1) : 'uTile';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aOff; attribute vec3 aTint;
      ${CLEAR_GLSL}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor.rgb *= vec3(${kind !== 'grass' ? 'aTint.x * 0.95, aTint.x, 1.0' : 'aTint.y, aTint.y, aTint.y'});`)
      .replace('#include <begin_vertex>', `
        // wrap this instance into the tile that follows the player
        vec2 rel = mod(aOff.xy - uPlayer.xz + ${T} * 0.5, ${T}) - ${T} * 0.5;
        vec2 wp = uPlayer.xz + rel;
        float d = length(rel);
        float keep = (1.0 - clearMask(wp)) * (1.0 - smoothstep(${T} * 0.36, ${T} * 0.48, d));
        ${ring ? `keep *= smoothstep(${ring[0].toFixed(1)}, ${ring[1].toFixed(1)}, d);` : ''}
        // squash flowers the player walks through
        float near = length(wp - uPlayer.xz);
        float push = smoothstep(0.9, 0.2, near);
        vec3 transformed = position;
        float ang = aTint.z; float ca = cos(ang), sa = sin(ang);
        ${kind === 'far' ? `transformed.y *= aOff.w; transformed.xz *= aOff.z * 4.0;` : kind === 'flower' ? `
        float stem = aOff.w, head = aOff.z;
        // the head is modelled at y = 1: scale it, then lift it onto the stem
        if (transformed.y > 0.95) { transformed.y -= 1.0; transformed.xz *= head * 4.0; transformed.y *= head * 4.0; transformed.y += stem; }
        else { transformed.y *= stem; transformed.xz *= 0.6 + head * 2.0; }
        ` : `transformed *= vec3(aOff.z, aOff.w, aOff.z);`}
        transformed.xz = mat2(ca, -sa, sa, ca) * transformed.xz;
        float h01 = clamp(transformed.y / 0.6, 0.0, 1.5);
        float w = sin(uTime * 1.7 + wp.x * 0.35 + wp.y * 0.21) * 0.6 + sin(uTime * 2.9 + wp.x * 0.9) * 0.25;
        transformed.x += w * 0.06 * h01 * h01;
        transformed.z += w * 0.03 * h01 * h01;
        vec2 away = near > 0.001 ? (wp - uPlayer.xz) / near : vec2(0.0);
        transformed.xz += away * push * 0.3 * h01;
        transformed.y *= 1.0 - push * 0.35;
        transformed *= keep;
        transformed.xz += wp;
      `);
  };
  return mat;
}

export function createFlowers(scene, uniforms, quality) {
  const tile = uniforms.uTile.value;
  const flowerCount = quality === 'low' ? 7500 : 14000;
  const grassCount = quality === 'low' ? 1800 : 3500;
  const fl = new THREE.Mesh(scatter(flowerGeometry(), flowerCount, tile, 11, [0.07, 0.11], [0.2, 0.42]), instancedMaterial(uniforms, 'flower'));
  const gr = new THREE.Mesh(scatter(grassGeometry(), grassCount, tile, 23, [0.6, 1.0], [0.16, 0.3]), instancedMaterial(uniforms, 'grass'));
  // a ring of cheap blooms farther out, so the carpet keeps its relief
  const farTile = 130, nearR = tile * 0.36;
  const far = new THREE.Mesh(scatter(farFlowerGeometry(), quality === 'low' ? 7000 : 12000, farTile, 31, [0.07, 0.1], [0.22, 0.38]), instancedMaterial(uniforms, 'far', farTile, [nearR - 2, nearR + 3]));
  for (const m of [fl, gr, far]) { m.frustumCulled = false; scene.add(m); }
  return { flowers: fl, grass: gr, far };
}

// ---------------------------------------------------------------- road & signs
export function createRoad(scene) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(214,187,140,0)'); grd.addColorStop(0.12, 'rgba(214,187,140,1)'); grd.addColorStop(0.88, 'rgba(214,187,140,1)'); grd.addColorStop(1, 'rgba(214,187,140,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
  const rnd = mulberry(5);
  for (let i = 0; i < 260; i++) {
    const x = 16 + rnd() * 96, y = rnd() * 256, r = 0.8 + rnd() * 2.4;
    g.fillStyle = rnd() < 0.5 ? 'rgba(170,140,100,0.55)' : 'rgba(240,222,190,0.7)';
    g.beginPath(); g.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, 7); g.fill();
  }
  // two faint wheel ruts
  g.fillStyle = 'rgba(180,150,110,0.25)'; g.fillRect(36, 0, 10, 256); g.fillRect(82, 0, 10, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  const len = 900;
  const geo = new THREE.PlaneGeometry(ROAD.half * 2 + 0.8, len, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(ROAD.x, 0.012, ROAD.z0 + len / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 3);
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.renderOrder = 1; scene.add(m);
  return m;
}

function signTexture(lines, w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#a8794e'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 26) { g.fillStyle = y % 52 ? '#9c6f46' : '#b4855a'; g.fillRect(0, y, w, 24); }
  g.strokeStyle = '#7a5434'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#fff8ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const sizes = lines.length > 1 ? [62, 40] : [66];
  lines.forEach((t, i) => { g.font = `800 ${sizes[i]}px 'Baloo 2', system-ui, sans-serif`; g.fillText(t, w / 2, lines.length > 1 ? (i === 0 ? h * 0.4 : h * 0.76) : h / 2); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// a wooden signpost; the board is an arrow pointing along -z (towards the house)
export function createSign(scene, x, z, lines, opts = {}) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z);
  const wood = new THREE.MeshLambertMaterial({ color: '#8a5d39' });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.2, 8), wood); post.position.y = 1.1; post.castShadow = true; grp.add(post);
  const tex = signTexture(lines);
  // arrow-shaped wooden board pointing to -z, with the words on both faces
  const shape = new THREE.Shape();
  const W = 1.95, Hh = 0.32;
  shape.moveTo(-W / 2, -Hh); shape.lineTo(W / 2 - 0.25, -Hh); shape.lineTo(W / 2, 0); shape.lineTo(W / 2 - 0.25, Hh); shape.lineTo(-W / 2, Hh); shape.closePath();
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }); bg.translate(0, 0, -0.03);
  const board = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: '#a8794e' })); board.castShadow = true;
  const holder = new THREE.Group(); holder.position.y = 1.8; holder.rotation.y = opts.flip ? -Math.PI / 2 : Math.PI / 2; holder.add(board);
  const text = new THREE.MeshLambertMaterial({ map: tex });
  for (const side of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.36, Hh * 2 - 0.05), text);
    pl.position.set(-0.13, 0, side * 0.032); if (side < 0) pl.rotation.y = Math.PI;
    if (side < 0) pl.position.x = -0.13; // same spot; the text stays readable from behind
    holder.add(pl);
  }
  grp.add(holder);
  grp.rotation.y = opts.ry || 0;
  scene.add(grp);
  return grp;
}

// drifting pollen sparkles around the player
export function createPollen(scene, count = 160) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(count * 3); const rnd = mulberry(9);
  for (let i = 0; i < count; i++) { p[i * 3] = (rnd() - 0.5) * 30; p[i * 3 + 1] = 0.3 + rnd() * 3; p[i * 3 + 2] = (rnd() - 0.5) * 30; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const grd = x.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(1, 'rgba(255,255,240,0)');
  x.fillStyle = grd; x.fillRect(0, 0, 32, 32);
  const m = new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.85 });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return {
    update(dt, t, player) {
      const a = g.attributes.position;
      for (let i = 0; i < count; i++) {
        let x = a.getX(i), y = a.getY(i), z = a.getZ(i);
        x += Math.sin(t * 0.5 + i) * dt * 0.15; y += Math.sin(t * 0.7 + i * 1.3) * dt * 0.08; z += Math.cos(t * 0.4 + i) * dt * 0.15;
        if (x - player.x > 15) x -= 30; if (x - player.x < -15) x += 30;
        if (z - player.z > 15) z -= 30; if (z - player.z < -15) z += 30;
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
    },
  };
}
