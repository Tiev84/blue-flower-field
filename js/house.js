import * as THREE from 'three';

// The little house sits on its garden plot at the end of the road. The model
// came from casa.blend (converted to glTF); it is scaled up so the girl fits
// through the door. Model space -> world: (m - ORIGIN) * S + LIFT.
export const S = 3.6;
const ORIGIN = new THREE.Vector3(0.6327, -1.2003, 0.4051); // plot centre (x, top, z) in model units
const LIFT = 0.12;                                          // plot top above the field
const w = (x, y, z) => new THREE.Vector3((x - ORIGIN.x) * S, (y - ORIGIN.y) * S + LIFT, (z - ORIGIN.z) * S);

// key measurements (world units)
const WALL = { x0: w(-0.2156, 0, 0).x, x1: w(1.4776, 0, 0).x, z0: w(0, 0, -0.5052).z, z1: w(0, 0, 1.3123).z, eave: w(0, 0.0, 0).y, ridge: w(0, 1.05, 0).y };
const DOOR = { x0: w(0.3274, 0, 0).x, x1: w(0.9855, 0, 0).x, zBack: w(0, 0, 1.1737).z, zFront: w(0, 0, 1.2754).z, top: w(0, -0.4706, 0).y };
export const PLOT = { half: (2.3582 + 1.0929) / 2 * S, top: LIFT };
const T = 0.28; // inner wall thickness
export const ROOM = { x0: WALL.x0 + T, x1: WALL.x1 - T, z0: WALL.z0 + T, z1: DOOR.zBack, floor: LIFT + 0.01, eave: WALL.eave };
export const CENTER = new THREE.Vector3((ROOM.x0 + ROOM.x1) / 2, ROOM.floor, (ROOM.z0 + ROOM.z1) / 2 - 0.15);
export const DOOR_X = (DOOR.x0 + DOOR.x1) / 2;
export const DOOR_FRONT = WALL.z1;

function woodTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  const tones = ['#d7a978', '#cf9f6c', '#dcb084', '#c99764'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % 4]; g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(120,80,40,0.35)'; g.fillRect(0, i * 32, 256, 2);
    const cut = (i * 97) % 256; g.fillRect(cut, i * 32, 2, 32);
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(140,95,55,0.12)'; g.fillRect(0, i * 32 + 6 + k * 4, 256, 1); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

function wallpaper() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#fbf3e6'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e9f0fb'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 14, 128);
  g.fillStyle = '#8fb6ec'; g.font = '18px serif'; g.textAlign = 'center';
  for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { g.globalAlpha = 0.55; g.fillText('✿', x + 7 + ((y / 32) % 2) * 16, y + 22); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function rugTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const rings = ['#f7c6d9', '#fff2f6', '#bcd6fb', '#fff2f6', '#f7c6d9', '#fde3ec'];
  rings.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(128, 128, 126 - i * 20, 0, 7); g.fill(); });
  g.fillStyle = '#fff'; for (let a = 0; a < 24; a++) { g.beginPath(); g.arc(128 + Math.cos(a / 24 * 6.283) * 116, 128 + Math.sin(a / 24 * 6.283) * 116, 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function createHouse(scene, loader) {
  const [house, door] = await Promise.all([loader.loadAsync('models/house.glb'), loader.loadAsync('models/door.glb')]);
  const root = new THREE.Group(); scene.add(root);

  // exterior shell (walls, roof, window boxes, garden) in one group
  const shell = house.scene;
  shell.scale.setScalar(S); shell.position.set(-ORIGIN.x * S, -ORIGIN.y * S + LIFT, -ORIGIN.z * S);
  shell.traverse((o) => {
    if (!o.isMesh) return;
    o.material.roughness = 0.95; o.material.metalness = 0;
    if (o.material.map) o.material.map.anisotropy = 4;
    o.receiveShadow = true;
  });
  root.add(shell);

  // the door swings out on a hinge at its left edge
  const hinge = new THREE.Group(); hinge.position.set(DOOR.x0, 0, DOOR.zFront); root.add(hinge);
  const d = door.scene; d.scale.setScalar(S); d.position.set(-ORIGIN.x * S - DOOR.x0, -ORIGIN.y * S + LIFT, -ORIGIN.z * S - DOOR.zFront);
  d.traverse((o) => { if (o.isMesh) { o.material.roughness = 0.9; o.material.color.set(o.geometry.attributes.position.count > 300 ? '#d8b25a' : '#a8683f'); o.castShadow = true; } });
  hinge.add(d);

  // a warm glow fills the doorway once the door is open
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { open: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float open; varying vec2 vUv;
      void main(){ vec3 c = mix(vec3(0.55,0.32,0.18), vec3(1.0,0.86,0.6), smoothstep(0.0, 0.9, vUv.y) * 0.6 + 0.25);
        c += vec3(1.0,0.9,0.7) * smoothstep(0.6, 0.0, length(vUv - vec2(0.5, 0.35))) * 0.35;
        gl_FragColor = vec4(c, open); }`,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.x1 - DOOR.x0, DOOR.top - LIFT), glowMat);
  glow.position.set(DOOR_X, (DOOR.top + LIFT) / 2, DOOR.zBack + 0.01); root.add(glow);

  // ---------------------------------------------------------------- interior
  // the inside of the walls is a copy of the wall shell drawn from inside,
  // pulled in a little; the exterior is culled from in there by itself
  const interior = new THREE.Group(); root.add(interior); interior.visible = false;
  {
    // a room box up to the eaves with a gable above, seen from inside
    const X0 = ROOM.x0, X1 = ROOM.x1, Z0 = ROOM.z0, Z1 = ROOM.z1, Y0 = ROOM.floor, YE = WALL.eave - 0.15, YR = WALL.ridge - 0.5, XM = (X0 + X1) / 2;
    const v = [];
    const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
    quad([X0, Y0, Z0], [X1, Y0, Z0], [X1, YE, Z0], [X0, YE, Z0]); // back
    quad([X1, Y0, Z1], [X0, Y0, Z1], [X0, YE, Z1], [X1, YE, Z1]); // front
    quad([X0, Y0, Z1], [X0, Y0, Z0], [X0, YE, Z0], [X0, YE, Z1]); // left
    quad([X1, Y0, Z0], [X1, Y0, Z1], [X1, YE, Z1], [X1, YE, Z0]); // right
    v.push(X0, YE, Z0, X1, YE, Z0, XM, YR, Z0); // back gable
    v.push(X1, YE, Z1, X0, YE, Z1, XM, YR, Z1); // front gable
    quad([X0, YE, Z0], [X0, YE, Z1], [XM, YR, Z1], [XM, YR, Z0]); // roof slopes
    quad([X1, YE, Z1], [X1, YE, Z0], [XM, YR, Z0], [XM, YR, Z1]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(v.length / 3 * 2), 2));
    const m = new THREE.MeshLambertMaterial({ map: wallpaper(), side: THREE.DoubleSide });
    // wallpaper by world position
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <map_fragment>', `vec2 wuv = vec2(vWp.x + vWp.z, vWp.y) * 0.9; vec4 sampledDiffuseColor = texture2D(map, wuv);
          float skirting = step(vWp.y, ${(ROOM.floor + 0.35).toFixed(2)});
          float beam = step(${(WALL.eave - 0.15).toFixed(2)}, vWp.y);
          sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.86, 0.66, 0.47), skirting);
          sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.98, 0.95, 0.9), beam * 0.6);
          diffuseColor *= sampledDiffuseColor;`);
    };
    interior.add(new THREE.Mesh(g, m));
    // beams under the roof
    const beamMat = new THREE.MeshLambertMaterial({ color: '#a7764c' });
    for (let i = 0; i < 3; i++) {
      const bz = Z0 + (Z1 - Z0) * (i + 0.5) / 3;
      const bm = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.18, 0.18), beamMat); bm.position.set(XM, YE, bz); interior.add(bm);
    }
  }
  // wooden floor and a round rug in the middle
  const wood = woodTexture(); wood.repeat.set((ROOM.x1 - ROOM.x0) / 1.6, (ROOM.z1 - ROOM.z0) / 1.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL.x1 - WALL.x0, WALL.z1 - WALL.z0), new THREE.MeshLambertMaterial({ map: wood }));
  floor.rotation.x = -Math.PI / 2; floor.position.set((WALL.x0 + WALL.x1) / 2, ROOM.floor, (WALL.z0 + WALL.z1) / 2); floor.receiveShadow = true;
  interior.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), new THREE.MeshLambertMaterial({ map: rugTexture() }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(CENTER.x, ROOM.floor + 0.01, CENTER.z); rug.receiveShadow = true; interior.add(rug);
  // a bright doorway on the inside of the front wall
  const exitMat = new THREE.MeshBasicMaterial({ color: '#fff7e0' });
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.x1 - DOOR.x0 - 0.1, DOOR.top - LIFT - 0.05), exitMat);
  exit.position.set(DOOR_X, (DOOR.top + LIFT) / 2, ROOM.z1 - 0.02); exit.rotation.y = Math.PI; interior.add(exit);
  const frameMat = new THREE.MeshLambertMaterial({ color: '#9b6a43' });
  for (const [x, y, sx, sy] of [[DOOR.x0, (DOOR.top + LIFT) / 2, 0.14, DOOR.top - LIFT], [DOOR.x1, (DOOR.top + LIFT) / 2, 0.14, DOOR.top - LIFT], [DOOR_X, DOOR.top, DOOR.x1 - DOOR.x0 + 0.14, 0.14]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.08), frameMat); b.position.set(x, y, ROOM.z1 - 0.04); interior.add(b);
  }
  // cosy bits: two windows with daylight, a shelf with pots, a lamp
  const winMat = new THREE.MeshBasicMaterial({ color: '#d9ecff' });
  const sill = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  for (const sx of [ROOM.x0 + 0.02, ROOM.x1 - 0.02]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), winMat); win.position.set(sx, 2.3, CENTER.z); win.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; interior.add(win);
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), sill); bar1.position.copy(win.position); interior.add(bar1);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.5), sill); bar2.position.copy(win.position); interior.add(bar2);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 1.7), sill); sl.position.set(sx + (sx < 0 ? 0.1 : -0.1), 1.62, CENTER.z); interior.add(sl);
  }
  const shelf = new THREE.Group(); interior.add(shelf);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.35), frameMat); plank.position.set(CENTER.x, 1.9, ROOM.z0 + 0.2); shelf.add(plank);
  const potCols = ['#f3b7cf', '#8fb6ec', '#ffd98a'];
  for (let i = 0; i < 3; i++) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.2, 10), new THREE.MeshLambertMaterial({ color: potCols[i] }));
    pot.position.set(CENTER.x - 0.7 + i * 0.7, 2.04, ROOM.z0 + 0.2); shelf.add(pot);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: '#5aa35a', flatShading: true }));
    leaf.position.set(pot.position.x, 2.24, pot.position.z); shelf.add(leaf);
  }
  const lamp = new THREE.PointLight('#ffe2b8', 2.2, 12, 1.4); lamp.position.set(CENTER.x, WALL.eave - 0.6, CENTER.z); interior.add(lamp);

  // ---------------------------------------------------------------- colliders
  // boxes in the xz plane: [x0, z0, x1, z1]
  const outer = [
    [WALL.x0, WALL.z0, WALL.x1, WALL.z1 - 0.01, 'body'],
  ];
  const doorGap = [DOOR.x0 + 0.05, DOOR.x1 - 0.05];
  const state = { open: 0, inside: false };

  function collide(p, r) {
    // keep the girl out of the walls, except through the open doorway
    const inRoomX = p.x > ROOM.x0 - 0.5 && p.x < ROOM.x1 + 0.5;
    const throughDoor = p.x > doorGap[0] + r && p.x < doorGap[1] - r && state.open > 0.6;
    if (state.inside) {
      p.x = Math.min(ROOM.x1 - r, Math.max(ROOM.x0 + r, p.x));
      p.z = Math.max(ROOM.z0 + r, p.z);
      if (p.z > ROOM.z1 - r && !(p.x > doorGap[0] + r && p.x < doorGap[1] - r)) p.z = ROOM.z1 - r;
      return;
    }
    void inRoomX;
    for (const [x0, z0, x1, z1] of outer) {
      if (p.x > x0 - r && p.x < x1 + r && p.z > z0 - r && p.z < z1 + r) {
        if (throughDoor && p.z > DOOR.zBack - 0.2) {
          // inside the doorway recess: only the jambs block
          p.x = Math.min(doorGap[1] - r, Math.max(doorGap[0] + r, p.x));
          continue;
        }
        const dx0 = p.x - (x0 - r), dx1 = x1 + r - p.x, dz0 = p.z - (z0 - r), dz1 = z1 + r - p.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) p.x = x0 - r; else if (m === dx1) p.x = x1 + r; else if (m === dz0) p.z = z0 - r; else p.z = z1 + r;
      }
    }
  }

  function update(dt, player) {
    const near = Math.hypot(player.x - DOOR_X, player.z - DOOR_FRONT) < 4.2 || state.inside;
    state.open += ((near ? 1 : 0) - state.open) * Math.min(1, dt * 3);
    hinge.rotation.y = -state.open * 1.75;
    glowMat.uniforms.open.value = Math.min(1, state.open * 1.2);
    // crossing the inner face of the doorway switches between outside and in
    const wasInside = state.inside;
    if (!state.inside && player.z < ROOM.z1 - 0.05 && player.x > ROOM.x0 && player.x < ROOM.x1) state.inside = true;
    else if (state.inside && player.z > ROOM.z1 + 0.05) state.inside = false;
    if (wasInside !== state.inside) { interior.visible = state.inside; glow.visible = !state.inside; shell.visible = !state.inside; hinge.visible = !state.inside; }
    return state.inside !== wasInside;
  }

  // ground height (the garden plot is a step up from the field)
  function groundAt(x, z) { return Math.abs(x) < PLOT.half && Math.abs(z) < PLOT.half ? (state.inside ? ROOM.floor : LIFT) : 0; }

  return { root, shell, interior, state, collide, update, groundAt, room: ROOM, center: CENTER,
    wallBox: new THREE.Box3(new THREE.Vector3(WALL.x0, 0, WALL.z0), new THREE.Vector3(WALL.x1, 9, WALL.z1)) };
}
