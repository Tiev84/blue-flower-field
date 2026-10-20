import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Three cats sit and lie in a ring in the middle of the room, leaving a gap
// in the centre. Pet each one (it meows and hops); when all three have been
// petted the ending starts.

const RING = 1.45;

function normalise(obj, size, axis = 'y') {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  const k = size / (axis === 'y' ? s.y : Math.max(s.x, s.z));
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  const wrap = new THREE.Group(); wrap.add(obj); return wrap;
}

function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ff7fa8'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 36, 6, 10, 22, 10); g.bezierCurveTo(28, 10, 32, 15, 32, 19);
  g.bezierCurveTo(32, 15, 36, 10, 42, 10); g.bezierCurveTo(58, 10, 60, 36, 32, 54); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(22, 20, 5, 3, -0.6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function createCats(scene, gltf, center) {
  const tl = new THREE.TextureLoader();
  const tex = (u) => tl.loadAsync(u).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; });
  const [munch, fig, mx, mxTex, mxWh] = await Promise.all([
    gltf.loadAsync('models/munchkin.glb'), gltf.loadAsync('models/catfigure.glb'),
    new FBXLoader().loadAsync('models/maxwell.fbx'), tex('models/dingus_nowhiskers.jpg'), tex('models/maxwell_whiskers.png'),
  ]);
  const toon = (m) => { m.roughness = 0.85; m.metalness = 0; return m; };
  munch.scene.traverse((o) => { if (o.isMesh) { toon(o.material); o.castShadow = true; } });
  fig.scene.traverse((o) => { if (o.isMesh) { toon(o.material); o.castShadow = true; } });
  mx.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material).map((m) => (/whisk/i.test(m.name)
      ? new THREE.MeshLambertMaterial({ map: mxWh, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ map: mxTex })));
    o.material = mats.length > 1 ? mats : mats[0]; o.castShadow = true;
  });

  // [model, size, size axis, facing of the model (radians, 0 = +z), meow pitch, name]
  const defs = [
    { obj: normalise(munch.scene, 0.95, 'y'), face: 0, rate: 1.0, name: 'Munchkin' },
    { obj: normalise(fig.scene, 1.0, 'xz'), face: -Math.PI / 2, rate: 1.18, name: 'Mochi' },
    { obj: normalise(mx, 0.95, 'xz'), face: 0, rate: 0.88, name: 'Maxwell' },
  ];
  const heartTex = heartTexture();
  const cats = defs.map((d, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
    const x = center.x + Math.cos(a) * RING, z = center.z + Math.sin(a) * RING;
    const g = new THREE.Group(); g.position.set(x, center.y, z);
    g.rotation.y = Math.atan2(center.x - x, center.z - z) - d.face;
    g.add(d.obj); scene.add(g);
    // a soft ring on the floor shows which cat is in reach
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, center.y + 0.02, z); scene.add(ring);
    return { ...d, group: g, ring, petted: false, t: 10, phase: Math.random() * 6, pos: new THREE.Vector3(x, center.y, z), radius: 0.55 };
  });

  const hearts = [];
  function burst(pos, n = 6) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5));
      s.scale.setScalar(0.18 + Math.random() * 0.12);
      s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4), life: 0, max: 1.4 + Math.random() * 0.6 };
      scene.add(s); hearts.push(s);
    }
  }

  return {
    list: cats,
    nearest(p, reach = 1.7) {
      let best = null, bd = reach;
      for (const c of cats) { const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z) - c.radius; if (d < bd) { bd = d; best = c; } }
      return best;
    },
    pet(c) {
      c.t = 0; burst(c.pos, 7);
      const first = !c.petted; c.petted = true; return first;
    },
    meshes() { return cats.map((c) => c.group); },
    update(dt, time, focus, inside) {
      for (const c of cats) {
        c.t += dt;
        // a happy hop and squash after being petted, gentle breathing otherwise
        const t = c.t; let sy = 1 + Math.sin(time * 2.4 + c.phase) * 0.018, sx = 1, hop = 0;
        if (t < 0.9) { const k = t / 0.9; hop = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.16; sy += Math.sin(k * Math.PI * 3) * 0.12 * (1 - k); sx = 1 - (sy - 1) * 0.5; }
        c.obj.scale.set(sx, sy, sx); c.obj.position.y = hop;
        c.obj.rotation.z = t < 0.9 ? Math.sin(t * 14) * 0.06 * (1 - t / 0.9) : 0;
        const on = inside && c === focus;
        c.ring.material.opacity += ((on ? 0.65 + Math.sin(time * 5) * 0.2 : 0) - c.ring.material.opacity) * Math.min(1, dt * 8);
        c.ring.material.color.set(c.petted ? '#ffd2e3' : '#ffffff');
      }
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i], u = h.userData; u.life += dt;
        h.position.addScaledVector(u.v, dt); u.v.y *= 0.99;
        h.material.opacity = 1 - Math.max(0, (u.life - u.max * 0.5) / (u.max * 0.5));
        if (u.life > u.max) { scene.remove(h); h.material.dispose(); hearts.splice(i, 1); }
      }
    },
  };
}
