import * as THREE from 'three';
import { GirlRig } from './girl.js';

// Lạc Như, built from her front / back / side photos: the mesh is a visual
// hull of the three silhouettes (tools/lacnhu.py) and the photos themselves
// are projected back on it, blended by which way the surface faces.

const LIMBS = [['arm', 'fore'], ['fore', 'hand'], ['thigh', 'shin'], ['shin', 'foot'], ['foot', 'toe']];

export async function buildLacNhu(walk, base = '') {
  const [meta, bin, atlas] = await Promise.all([
    fetch(base + 'models/lacnhu.json').then((r) => r.json()),
    fetch(base + 'models/lacnhu.bin').then((r) => r.arrayBuffer()),
    new THREE.TextureLoader().loadAsync(base + 'models/lacnhu.jpg'),
  ]);
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  const n = meta.count;
  const f32 = (off, k) => new Float32Array(bin, off, n * k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(f32(meta.pos, 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(f32(meta.nrm, 3), 3));
  g.setAttribute('uvF', new THREE.BufferAttribute(f32(meta.uvF, 2), 2));
  g.setAttribute('uvB', new THREE.BufferAttribute(f32(meta.uvB, 2), 2));
  g.setAttribute('uvS', new THREE.BufferAttribute(f32(meta.uvS, 2), 2));
  g.setAttribute('wv', new THREE.BufferAttribute(f32(meta.wv, 3), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(bin, meta.si, n * 4), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(f32(meta.sw, 4), 4));
  g.setIndex(new THREE.BufferAttribute(meta.idx32 ? new Uint32Array(bin, meta.idx, meta.tris * 3) : new Uint16Array(bin, meta.idx, meta.tris * 3), 1));

  // the photos already carry soft studio light, so the scene light only
  // shades them a little
  const mat = new THREE.MeshLambertMaterial({ map: atlas });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec2 uvF; attribute vec2 uvB; attribute vec2 uvS; attribute vec3 wv;
      varying vec2 vF; varying vec2 vB; varying vec2 vS; varying vec3 vW3;`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvF = uvF; vB = uvB; vS = uvS; vW3 = wv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vF; varying vec2 vB; varying vec2 vS; varying vec3 vW3;`)
      .replace('#include <map_fragment>', `
        vec4 photo = texture2D(map, vF) * vW3.x + texture2D(map, vB) * vW3.y + texture2D(map, vS) * vW3.z;
        diffuseColor *= photo;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.55;');
  };
  mat.defines = { USE_UV: '' };

  const J = meta.joints;
  const V = (k) => new THREE.Vector3(...J[k]);
  const bones = {}; const list = [];
  for (const [name, parent] of walk.bones) {
    const b = new THREE.Bone(); b.name = name; bones[name] = b; list.push(b);
    const p = V(name); if (parent) p.sub(V(parent));
    b.position.copy(p);
    if (parent) bones[parent].add(b);
  }
  const mesh = new THREE.SkinnedMesh(g, mat);
  const root = new THREE.Group(); root.add(mesh);
  mesh.add(bones.hips); root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(list));
  mesh.castShadow = true; mesh.frustumCulled = false;

  // her limbs hang in the photos; the capture's bind pose holds them out.
  // Q rotates each limb from her pose to the capture's.
  const R = walk.ref; const Q = {};
  for (const s of ['L', 'R']) for (const [a, b] of LIMBS) {
    const mine = V(b + s).sub(V(a + s)).normalize();
    const ref = new THREE.Vector3(...R[b + s]).sub(new THREE.Vector3(...R[a + s])).normalize();
    Q[a + s] = new THREE.Quaternion().setFromUnitVectors(mine, ref);
  }
  for (const s of ['L', 'R']) { Q['hand' + s] = Q['fore' + s]; Q['toe' + s] = Q['foot' + s]; }
  const rig = new GirlRig(root, mesh, bones, walk, { Q, idle: {}, headScale: 1 });
  rig.headTop = meta.height;
  return rig;
}
