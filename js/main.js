import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildGirl } from './girl.js';
import { buildLacNhu } from './lacnhu.js';
import { createSky, createGround, createFlowers, createRoad, createSign, createPollen, SKY, ROAD } from './field.js';
import { createHouse, DOOR_X, DOOR_FRONT } from './house.js';
import { createCats } from './cats.js';
import { createFinale } from './finale.js';
import { Audio } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add('touch');
const small = Math.min(screen.width, screen.height) < 820;
const quality = touch && small ? 'low' : 'high';

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, quality === 'low' ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = SKY.horizon.clone();
scene.fog = new THREE.Fog(new THREE.Color('#d4e6fb'), 45, 300);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight('#d6ebff', '#6f9a55', 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3e0', 2.1);
const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const uniforms = { uPlayer: { value: new THREE.Vector3() }, uTile: { value: quality === 'low' ? 44 : 52 }, uTime: { value: 0 } };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loading
let progress = 0;
function setBar(p) { progress = Math.max(progress, p); $('bar-fill').style.width = Math.round(progress * 100) + '%'; }
const gltf = new GLTFLoader();
const loadTexts = ['Đang gieo hạt hoa…', 'Đang trải con đường…', 'Đang xây ngôi nhà nhỏ…', 'Đang gọi các bé mèo…'];
let lt = 0; const ltTimer = setInterval(() => { $('load-text').textContent = loadTexts[++lt % loadTexts.length]; }, 1400);

const audio = new Audio();
const input = new Input(renderer.domElement, $('joy'), $('joy-knob'));

const world = {};
const player = { pos: new THREE.Vector3(0, 0, 30), vel: new THREE.Vector3(), yaw: Math.PI, speed: 0 };
const cam = { yaw: 0, pitch: innerWidth < innerHeight ? 0.27 : 0.2, dist: innerWidth < innerHeight ? 5.2 : 4.6, target: new THREE.Vector3(), pos: new THREE.Vector3() };
const game = { state: 'intro', petted: 0, enteredOnce: false, finaleAt: -1, time: 0, ended: false };

async function load() {
  const sky = createSky(scene);
  const ground = createGround(scene, uniforms);
  const flowers = createFlowers(scene, uniforms, quality);
  const road = createRoad(scene);
  setBar(0.12);
  const pollen = createPollen(scene, quality === 'low' ? 90 : 160);
  try { await Promise.race([document.fonts.load("800 40px 'Baloo 2'"), new Promise((r) => setTimeout(r, 2500))]); } catch (_) { /* ignore */ }
  const signs = [
    createSign(scene, ROAD.half + 0.9, 27.5, ['🏡 Ngôi nhà nhỏ', 'đi thẳng theo đường hoa'], { ry: 0.6 }),
    createSign(scene, -ROAD.half - 0.9, 17, ['🐾 3 bé mèo', 'đang đợi bạn đó'], { ry: -0.6 }),
    createSign(scene, ROAD.half + 0.9, 9.6, ['Sắp tới rồi!', 'ngay phía trước ✿'], { ry: 0.6 }),
  ];
  setBar(0.2);
  const walk = await (await fetch('models/walk.json')).json();
  let girl;
  try { girl = await buildLacNhu(walk); } catch (e) { console.warn('photo model unavailable, using the cartoon one', e); girl = buildGirl(walk); }
  scene.add(girl.root);
  setBar(0.35);
  const house = await createHouse(scene, gltf);
  setBar(0.6);
  const cats = await createCats(scene, gltf, house.center);
  setBar(0.85);
  const finale = await createFinale(scene, gltf, house.center, house.room.eave + 1.5);
  setBar(0.95);
  Object.assign(world, { sky, ground, flowers, road, pollen, signs, girl, house, cats, finale });
  finale.on('bloom', () => { audio.sparkle(); audio.tune(); toast('💐', 1800); });
  finale.on('done', () => setTimeout(showFinale, 2200));
  // warm up shaders so the first frames don't stutter
  player.pos.set(0, 0, 30); updateCamera(0, { look: { dx: 0, dy: 0 }, zoom: 0 });
  renderer.compile(scene, camera);
  clearInterval(ltTimer);
  setBar(1);
  $('load-text').textContent = 'Sẵn sàng rồi!';
  $('start').disabled = false;
}

load().catch((e) => { console.error(e); $('load-text').textContent = 'Không tải được trò chơi: ' + e.message; });

$('start').addEventListener('click', async () => {
  $('intro').classList.add('hidden'); $('hud').classList.remove('hidden');
  game.state = 'walk';
  audio.start();
  setQuest('Đi theo biển chỉ dẫn', 'Đến ngôi nhà nhỏ cuối con đường 🏡');
  toast(touch ? 'Kéo bên trái màn hình để đi' : 'Dùng WASD hoặc phím mũi tên để đi', 3200);
});
$('mute').addEventListener('click', () => { audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? '🔇' : '🔊'; });
$('pet').addEventListener('click', () => { const c = world.cats && world.cats.nearest(player.pos); if (c) petCat(c); });
$('again').addEventListener('click', () => location.reload());
$('admire').addEventListener('click', () => { $('finale').classList.add('hidden'); game.state = 'admire'; setQuest('💙 Happy Women\'s Day', 'You are the most unique flower'); });

// ---------------------------------------------------------------- ui
let toastTimer = 0;
function toast(text, ms = 2200) { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function setQuest(title, text) {
  $('q-title').textContent = title; $('q-text').textContent = text;
  const q = $('quest'); q.classList.add('pop'); setTimeout(() => q.classList.remove('pop'), 350);
}
const bubbles = [];
function bubble(text, pos, ms = 1500) {
  const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text; $('labels').appendChild(el);
  const b = { el, pos: pos.clone(), until: game.time + ms / 1000 }; bubbles.push(b);
  setTimeout(() => el.classList.add('out'), ms - 400); setTimeout(() => { el.remove(); bubbles.splice(bubbles.indexOf(b), 1); }, ms);
}
const _v = new THREE.Vector3();
function placeLabels() {
  for (const b of bubbles) {
    _v.copy(b.pos).project(camera);
    b.el.style.left = ((_v.x + 1) / 2) * innerWidth + 'px'; b.el.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
    b.el.style.display = _v.z < 1 ? '' : 'none';
  }
}
// her name floats above her head
const nameTag = document.createElement('div'); nameTag.className = 'name-tag'; nameTag.textContent = 'Lạc Như';
$('labels').appendChild(nameTag);
function placeNameTag() {
  if (!world.girl || game.state === 'intro') { nameTag.style.display = 'none'; return; }
  _v.copy(player.pos); _v.y += (world.girl.headTop || 1.6) + 0.17; _v.project(camera);
  const hidden = _v.z > 1 || game.ended && !$('finale').classList.contains('hidden');
  nameTag.style.display = hidden ? 'none' : '';
  nameTag.style.left = ((_v.x + 1) / 2) * innerWidth + 'px'; nameTag.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
}
const flash = document.createElement('div');
Object.assign(flash.style, { position: 'fixed', inset: '0', background: '#fff8ea', opacity: '0', pointerEvents: 'none', zIndex: '9', transition: 'opacity 0.35s' });
document.body.appendChild(flash);
function doFlash() { flash.style.transition = 'none'; flash.style.opacity = '0.85'; requestAnimationFrame(() => { flash.style.transition = 'opacity 0.6s'; flash.style.opacity = '0'; }); }

function showFinale() {
  if (game.ended) return; game.ended = true;
  $('finale').classList.remove('hidden');
  $('pet').classList.add('hidden');
  confetti();
}
function confetti() {
  const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '19', overflow: 'hidden' });
  document.body.appendChild(box);
  const glyphs = ['✿', '❀', '💙', '✦', '❁'];
  const cols = ['#3f7fe6', '#7fb0ff', '#bcd6fb', '#f3b7cf', '#ffffff'];
  for (let i = 0; i < 46; i++) {
    const s = document.createElement('span'); s.textContent = glyphs[i % glyphs.length];
    const dur = 4 + Math.random() * 4, x = Math.random() * 100, size = 14 + Math.random() * 18;
    Object.assign(s.style, { position: 'absolute', left: x + 'vw', top: '-40px', fontSize: size + 'px', color: cols[i % cols.length], textShadow: '0 2px 6px rgba(31,79,168,.25)' });
    s.animate([{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 30}vw, 110vh) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0.9 }],
      { duration: dur * 1000, delay: Math.random() * 2500, iterations: Infinity, easing: 'linear' });
    box.appendChild(s);
  }
}

// ---------------------------------------------------------------- cats
function petCat(c) {
  if (!world.house.state.inside || game.state === 'intro') return;
  const first = world.cats.pet(c);
  audio.playMeow(c.rate * (0.96 + Math.random() * 0.08));
  bubble(['Meow~', 'Meo meo!', 'Purrr…'][world.cats.list.indexOf(c)] + ' 💙', c.pos.clone().add(new THREE.Vector3(0, 1.15, 0)));
  // turn to look at the cat
  player.yaw = Math.atan2(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
  if (first) {
    game.petted++;
    const i = world.cats.list.indexOf(c);
    document.querySelector(`#q-cats span[data-i="${i}"]`).classList.add('done');
    if (game.petted < 3) setQuest('Nhiệm vụ', `Vuốt ve cả 3 chú mèo 🐾 (${game.petted}/3)`);
    else {
      setQuest('✨ Điều kỳ diệu…', 'Nhìn vào giữa ba chú mèo nhé');
      game.state = 'finale'; game.finaleAt = game.time + 1.0;
      $('pet').classList.add('hidden');
    }
  }
}

// ---------------------------------------------------------------- update
const raycaster = new THREE.Raycaster();
const WALK = 1.3, BRISK = 1.9;

function updatePlayer(dt) {
  const ax = game.state === 'intro' ? { x: 0, y: 0, run: false } : input.axes();
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x;
  const mag = Math.min(1, Math.hypot(mx, mz));
  const top = (ax.run ? BRISK : WALK) * mag;
  player.speed += (top - player.speed) * Math.min(1, dt * 6);
  if (mag > 0.05) {
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    const want = Math.atan2(mx, mz);
    let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * 9);
  }
  const dirx = Math.sin(player.yaw), dirz = Math.cos(player.yaw);
  player.pos.x += dirx * player.speed * dt; player.pos.z += dirz * player.speed * dt;
  const H = world.house;
  // cats are solid
  for (const c of world.cats.list) {
    const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z, d = Math.hypot(dx, dz), r = c.radius + 0.28;
    if (d < r && d > 1e-4) { player.pos.x = c.pos.x + dx / d * r; player.pos.z = c.pos.z + dz / d * r; }
  }
  if (world.finale.phase !== 'idle') {
    const b = H.center, dx = player.pos.x - b.x, dz = player.pos.z - b.z, d = Math.hypot(dx, dz);
    if (d < 0.6 && d > 1e-4) { player.pos.x = b.x + dx / d * 0.6; player.pos.z = b.z + dz / d * 0.6; }
  }
  for (const s of world.signs) { const dx = player.pos.x - s.position.x, dz = player.pos.z - s.position.z, d = Math.hypot(dx, dz); if (d < 0.38 && d > 1e-4) { player.pos.x = s.position.x + dx / d * 0.38; player.pos.z = s.position.z + dz / d * 0.38; } }
  H.collide(player.pos, 0.28);
  const gy = H.groundAt(player.pos.x, player.pos.z);
  player.pos.y += (gy - player.pos.y) * Math.min(1, dt * 12);
  const g = world.girl;
  g.root.position.copy(player.pos);
  g.root.rotation.y = player.yaw;
  g.update(dt, player.speed);
}

const _ray = new THREE.Ray(), _hit = new THREE.Vector3(), _box = new THREE.Box3();
function updateCamera(dt, ev) {
  const inside = world.house && world.house.state.inside;
  cam.yaw -= ev.look.dx * 0.006; cam.pitch += ev.look.dy * 0.004;
  cam.pitch = Math.min(1.25, Math.max(inside ? 0.25 : 0.05, cam.pitch));
  cam.dist = Math.min(7.5, Math.max(2.4, cam.dist + ev.zoom * 0.4));
  if (game.state === 'finale' && inside) {
    // orbit the bouquet from the far side, so the girl is seen facing it
    const C = world.house.center;
    if (cam.orbit === undefined) {
      // look in through the gap between two cats that is farthest from the girl
      const po = Math.atan2(player.pos.x - C.x, player.pos.z - C.z);
      let best = 0, bd = -1;
      for (const g of [0, Math.PI * 2 / 3, -Math.PI * 2 / 3]) { const d = Math.abs(Math.atan2(Math.sin(g - po), Math.cos(g - po))); if (d > bd) { bd = d; best = g; } }
      cam.orbit = best; cam.orbit0 = best;
    }
    cam.orbit = cam.orbit0 + Math.sin(game.time * 0.25) * 0.18;
    const want = new THREE.Vector3(C.x + Math.sin(cam.orbit) * 2.5, C.y + 2.5, C.z + Math.cos(cam.orbit) * 2.5);
    const k = dt > 0 ? Math.min(1, dt * 1.8) : 1;
    cam.target.lerp(C.clone().add(new THREE.Vector3(0, 0.75, 0)), k);
    camera.position.lerp(want, k); cam.pos.copy(camera.position); camera.lookAt(cam.target);
    cam.yaw = Math.atan2(camera.position.x - cam.target.x, camera.position.z - cam.target.z);
    return;
  }
  const tgt = player.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
  cam.target.lerp(tgt, dt > 0 ? Math.min(1, dt * 8) : 1);
  let dist = inside ? Math.min(cam.dist, 4.2) : cam.dist;
  const pitch = inside ? Math.max(cam.pitch, 0.32) : cam.pitch;
  const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(cam.yaw) * Math.cos(pitch));
  if (world.house && !inside) {
    _box.copy(world.house.wallBox).expandByScalar(0.25);
    _ray.set(cam.target, dir);
    if (_ray.intersectBox(_box, _hit)) { const d = _hit.distanceTo(cam.target); if (d < dist) dist = Math.max(0.8, d - 0.15); }
  }
  if (inside) {
    // stay inside the room: pull in along the view ray instead of squashing
    const R = world.house.room, m = 0.25;
    _box.min.set(R.x0 + m, R.floor + 0.4, R.z0 + m); _box.max.set(R.x1 - m, R.eave + 1.8, R.z1 - m);
    _ray.set(cam.target, dir);
    if (_ray.intersectBox(_box, _hit)) dist = Math.min(dist, _hit.distanceTo(cam.target));
  }
  const p = cam.target.clone().addScaledVector(dir, dist);
  p.y = Math.max(p.y, (world.house ? world.house.groundAt(p.x, p.z) : 0) + 0.35);
  cam.pos.copy(p);
  camera.position.copy(p); camera.lookAt(cam.target);
  const fov = (camera.aspect < 1 ? 66 : 55) + (inside ? 8 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (dt > 0 ? Math.min(1, dt * 4) : 1); camera.updateProjectionMatrix(); }
}

function handleTaps(ev) {
  if (!world.cats) return;
  if (ev.pressed.has('KeyE') || ev.pressed.has('Space') || ev.pressed.has('Enter')) { const c = world.cats.nearest(player.pos); if (c) petCat(c); }
  for (const t of ev.taps) {
    raycaster.setFromCamera(new THREE.Vector2((t.x / innerWidth) * 2 - 1, -(t.y / innerHeight) * 2 + 1), camera);
    const hits = raycaster.intersectObjects(world.cats.meshes(), true);
    if (hits.length) {
      const c = world.cats.list.find((k) => { let o = hits[0].object; while (o) { if (o === k.group) return true; o = o.parent; } return false; });
      if (c && Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 4.5) petCat(c);
    }
  }
}

let wasInside = false;
function step(dt) {
  game.time += dt;
  uniforms.uTime.value = game.time;
  const ev = input.consume();
  if (game.state !== 'intro') handleTaps(ev);
  updatePlayer(dt);
  const H = world.house;
  if (H.update(dt, player.pos)) {
    doFlash();
    if (H.state.inside) {
      cam.yaw = 0; cam.pitch = 0.42;
      if (!game.enteredOnce) {
        game.enteredOnce = true;
        setQuest('Nhiệm vụ', 'Vuốt ve cả 3 chú mèo 🐾 (0/3)');
        $('q-cats').classList.remove('hidden');
        toast(touch ? 'Chạm vào từng chú mèo để vuốt ve' : 'Lại gần mèo và nhấn E (hoặc bấm vào mèo)', 3500);
      }
    }
  }
  wasInside = H.state.inside;
  if (game.state === 'finale' && game.finaleAt > 0 && game.time > game.finaleAt) { game.finaleAt = -1; world.finale.start(); audio.shimmer(3); }
  if (game.state === 'finale' && player.speed < 0.1) {
    // turn to watch the light
    const C = H.center; let d = Math.atan2(C.x - player.pos.x, C.z - player.pos.z) - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * 3);
  }
  uniforms.uPlayer.value.copy(player.pos);
  const near = H.state.inside && game.state === 'walk' ? world.cats.nearest(player.pos) : null;
  $('pet').classList.toggle('hidden', !near);
  if (near) $('pet').textContent = touch ? '🐾 Vuốt ve' : '🐾 Vuốt ve (E)';
  world.cats.update(dt, game.time, near, H.state.inside);
  world.finale.update(dt, game.time);
  world.sky.update(dt, player.pos);
  world.ground.update(player.pos);
  world.pollen.update(dt, game.time, player.pos);
  updateCamera(dt, ev);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 30); sun.target.position.copy(player.pos);
  hemi.intensity = H.state.inside ? 1.45 : 1.25;
  placeLabels();
  placeNameTag();
}

// frame-rate watchdog: drop resolution on slow phones
let acc = 0, frames = 0, checked = false;
function watchdog(dt) {
  if (checked || game.state === 'intro') return;
  acc += dt; frames++;
  if (acc > 3) {
    checked = true;
    const fps = frames / acc;
    if (fps < 42 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); }
    if (fps < 30) world.flowers.grass.visible = false;
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!world.girl) return;
  step(dt);
  watchdog(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// test hook: advance the simulation without relying on requestAnimationFrame
window.flowerfield = {
  world, player, cam, game,
  advance(sec, keys = []) {
    for (const k of keys) input.keys.add(k);
    const n = Math.round(sec * 30);
    for (let i = 0; i < n; i++) step(1 / 30);
    for (const k of keys) input.keys.delete(k);
    renderer.render(scene, camera);
  },
  start() { $('start').click(); },
  pet(i) { petCat(world.cats.list[i]); },
  teleport(x, z, yaw) { player.pos.set(x, 0, z); if (yaw !== undefined) { player.yaw = yaw; cam.yaw = yaw + Math.PI; } },
};
void DOOR_X; void DOOR_FRONT; void wasInside;
