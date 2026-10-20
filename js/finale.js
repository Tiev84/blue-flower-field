import * as THREE from 'three';

// The ending: a shaft of light falls into the gap between the three cats,
// glows for three seconds, and a bouquet of blue flowers appears in it.

export async function createFinale(scene, gltf, center, ceiling) {
  const bouquetGltf = await gltf.loadAsync('models/bouquet.glb');
  const bq = bouquetGltf.scene;
  bq.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const c = o.material.color;
    o.material = new THREE.MeshToonMaterial({ color: c });
    if (c.b > c.r * 2) { o.material.emissive = c.clone().multiplyScalar(0.25); }
  });
  // stand it on the floor, 1.2 m tall
  bq.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(bq), s = b.getSize(new THREE.Vector3()), k = 1.2 / s.y;
  bq.scale.setScalar(k);
  const bc = b.getCenter(new THREE.Vector3());
  bq.position.set(-bc.x * k, -b.min.y * k, -bc.z * k);
  const bouquet = new THREE.Group(); bouquet.add(bq); bouquet.position.copy(center); bouquet.visible = false; scene.add(bouquet);

  // the light shaft: an open cone with soft vertical streaks, additive
  const H = ceiling - center.y;
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, amp: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float time, amp; varying vec2 vUv;
      void main(){
        float streak = 0.55 + 0.45 * sin(vUv.x * 62.83 + time * 1.5) * sin(vUv.x * 25.13 - time * 0.7);
        float fall = smoothstep(0.0, 0.2, vUv.y) * (0.6 + 0.4 * (1.0 - vUv.y));
        float edge = 1.0 - pow(abs(sin(vUv.x * 3.14159 * 2.0)), 6.0) * 0.0;
        vec3 c = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.97, 0.85), vUv.y);
        gl_FragColor = vec4(c * streak * fall * edge * amp * 0.2, 1.0);
      }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, H, 40, 1, true), beamMat);
  beam.position.set(center.x, center.y + H / 2, center.z); beam.visible = false; scene.add(beam);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, H, 24, 1, true), beamMat);
  core.position.copy(beam.position); core.visible = false; scene.add(core);
  // a glowing pool on the floor
  const pc = document.createElement('canvas'); pc.width = pc.height = 128; const g = pc.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(0.5, 'rgba(200,225,255,0.55)'); grd.addColorStop(1, 'rgba(160,200,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(center.x, center.y + 0.03, center.z); scene.add(pool);
  const spot = new THREE.PointLight('#fff4d6', 0, 6, 1.2); spot.position.set(center.x, center.y + 1.6, center.z); scene.add(spot);

  // sparkles drifting up through the beam
  const N = 140, sp = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) { seeds[i] = Math.random(); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sc = document.createElement('canvas'); sc.width = sc.height = 32; const sx = sc.getContext('2d');
  const sgrd = sx.createRadialGradient(16, 16, 0, 16, 16, 16); sgrd.addColorStop(0, 'rgba(255,255,255,1)'); sgrd.addColorStop(0.3, 'rgba(210,230,255,0.8)'); sgrd.addColorStop(1, 'rgba(180,210,255,0)');
  sx.fillStyle = sgrd; sx.fillRect(0, 0, 32, 32);
  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.12, map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  sparks.frustumCulled = false; scene.add(sparks);

  const st = { phase: 'idle', t: 0 };
  const events = {};
  return {
    bouquet,
    on(name, fn) { events[name] = fn; },
    start() { if (st.phase === 'idle') { st.phase = 'beam'; st.t = 0; beam.visible = core.visible = true; } },
    get phase() { return st.phase; },
    update(dt, time) {
      beamMat.uniforms.time.value = time;
      if (st.phase === 'idle') return;
      st.t += dt;
      const t = st.t;
      let amp;
      if (st.phase === 'beam') {
        amp = Math.min(1, t / 0.8);
        if (t > 3) { st.phase = 'bloom'; st.t = 0; bouquet.visible = true; bouquet.scale.setScalar(0.001); events.bloom && events.bloom(); }
      } else {
        // after the bouquet appears the beam settles into a soft glow
        amp = 1 - Math.min(0.6, t / 2.5) ;
        const k = Math.min(1, t / 1.1);
        const e = k === 1 ? 1 : 1 - Math.pow(2, -9 * k) * Math.cos(k * 9.5); // elastic out
        bouquet.scale.setScalar(Math.max(0.001, e));
        bouquet.rotation.y += dt * 0.5;
        bouquet.position.y = center.y + Math.sin(time * 1.6) * 0.015;
        if (st.phase === 'bloom' && t > 1.8) { st.phase = 'done'; events.done && events.done(); }
      }
      beamMat.uniforms.amp.value = amp;
      pool.material.opacity = amp * 0.32;
      spot.intensity = amp * 2.2;
      sparks.material.opacity = Math.min(1, amp * 1.2);
      const a = sg.attributes.position;
      for (let i = 0; i < N; i++) {
        const s = seeds[i], life = (time * (0.18 + s * 0.2) + s) % 1;
        const r = 0.15 + s * 0.75, ang = s * 40 + time * (0.3 + s * 0.4);
        a.setXYZ(i, center.x + Math.cos(ang) * r * (1 - life * 0.4), center.y + life * H * 0.85, center.z + Math.sin(ang) * r * (1 - life * 0.4));
      }
      a.needsUpdate = true;
    },
  };
}
