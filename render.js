// render.js — everything the player sees: the three.js scene.
// One job: build the Quarry from world.js data, and mirror sim state into
// meshes each frame. No game logic lives here; it only reads state.
// Hot loops reuse pooled objects: nothing is allocated per frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WALLS, SITES } from './world.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function sandTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b59a68';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const shade = 140 + Math.floor(Math.random() * 80);
    g.fillStyle = `rgb(${shade},${Math.floor(shade * 0.82)},${Math.floor(shade * 0.55)})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,14,16,0.55)';
  g.fillRect(0, 16, 256, 96);
  g.fillStyle = color;
  g.font = 'bold 64px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(5, 2.5, 1);
  return spr;
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 130);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
  camera.rotation.order = 'YXZ';

  // --- lights: warm low sun + sky bounce ---
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.25);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xfff2dd, 0.3));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.0);
  sun.position.set(12, 42, 40);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb8cc, 0.35);
  fill.position.set(-20, 30, -30);
  scene.add(fill);

  // --- materials (shared; the palette is one look) ---
  const matGround = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 });
  const matWall = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.95 });
  const matWallDark = new THREE.MeshStandardMaterial({ color: PALETTE.wallDark, roughness: 0.95 });
  const matConcrete = new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.9 });
  const matRust = new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.85, metalness: 0.25 });
  const matTeal = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.8, metalness: 0.2 });
  const matCrate = new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.9 });
  const matCrateDark = new THREE.MeshStandardMaterial({ color: PALETTE.crateDark, roughness: 0.9 });
  const matHazard = new THREE.MeshStandardMaterial({ color: PALETTE.hazard, roughness: 0.8 });

  // --- ground ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), matGround);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // --- walls and crates from the map data ---
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of WALLS) {
    const isOuter = w.x0 <= -33 || w.x1 >= 33 || w.z0 <= -25 || w.z1 >= 25;
    const mat = w.kind === 'crate'
      ? (w.h > 2 ? matCrateDark : matCrate)
      : isOuter ? matWallDark : matWall;
    const mesh = new THREE.Mesh(boxGeo, mat);
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    mesh.position.set(cx, w.h / 2, cz);
    mesh.scale.set(w.x1 - w.x0, w.h, w.z1 - w.z0);
    scene.add(mesh);
    // hazard stripe on tall crates
    if (w.kind === 'crate' && w.h > 2) {
      const stripe = new THREE.Mesh(boxGeo, matHazard);
      stripe.position.set(cx, w.h + 0.03, cz);
      stripe.scale.set((w.x1 - w.x0) * 0.9, 0.06, (w.z1 - w.z0) * 0.9);
      scene.add(stripe);
    }
  }

  // --- site dressing: crusher at A, silos at B (original props, styled boxes) ---
  const crusher = new THREE.Mesh(boxGeo, matRust);
  crusher.position.set(-29.5, 1.6, -22.5);
  crusher.scale.set(4, 3.2, 2);
  scene.add(crusher);
  const crusherTop = new THREE.Mesh(boxGeo, matTeal);
  crusherTop.position.set(-29.5, 3.4, -22.5);
  crusherTop.scale.set(4.4, 0.4, 2.4);
  scene.add(crusherTop);
  for (let i = 0; i < 3; i++) {
    const silo = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 5.5, 14),
      i === 1 ? matTeal : matConcrete,
    );
    silo.position.set(28.5 + i * 0, 2.75, -22.5 + (i - 1) * 0);
    silo.position.x = 27 + i * 2.2;
    scene.add(silo);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.2, 14), matRust);
    cap.position.set(silo.position.x, 6.1, silo.position.z);
    scene.add(cap);
  }
  // mid watchtower frame (visual landmark, no collision)
  const tower = new THREE.Mesh(boxGeo, matTeal);
  tower.position.set(0, 2.2, -8.5);
  tower.scale.set(0.5, 4.4, 0.5);
  scene.add(tower);

  // --- bombsite markers: painted rings + floating letters ---
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    const label = textSprite(key === 'A' ? 'A · CRUSHER' : 'B · SILOS', key === 'A' ? '#7db8e8' : '#f0a35e');
    label.position.set(s.x, 5.2, s.z);
    scene.add(label);
  }

  // --- agent meshes: one stylised humanoid per agent, built once ---
  const agentMeshes = new Map();
  function buildAgentMesh(team) {
    const color = team === 'viper' ? PALETTE.viper : PALETTE.jackal;
    const g = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.8 });
    const matSkin = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 10), matBody);
    body.position.y = 1.0;
    g.add(body);
    const vest = new THREE.Mesh(boxGeo, matDark);
    vest.position.set(0, 1.05, 0);
    vest.scale.set(0.62, 0.5, 0.4);
    g.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), matSkin);
    head.position.y = 1.62;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), matDark);
    helmet.position.y = 1.66;
    g.add(helmet);
    const gun = new THREE.Mesh(boxGeo, matDark);
    gun.position.set(0.28, 1.15, 0.45);
    gun.scale.set(0.09, 0.12, 0.85);
    g.add(gun);
    const legL = new THREE.Mesh(boxGeo, matDark);
    legL.position.set(-0.16, 0.35, 0);
    legL.scale.set(0.2, 0.7, 0.24);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    g.add(legR);
    g.userData = { head, body, gun, legL, legR };
    return g;
  }

  // --- viewmodel gun (attached to the camera) ---
  const viewmodel = new THREE.Group();
  {
    const matGun = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.5 });
    const matAccent = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.5, metalness: 0.4 });
    const receiver = new THREE.Mesh(boxGeo, matGun);
    receiver.scale.set(0.09, 0.13, 0.55);
    viewmodel.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10), matGun);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.42);
    viewmodel.add(barrel);
    const mag = new THREE.Mesh(boxGeo, matAccent);
    mag.scale.set(0.06, 0.2, 0.1);
    mag.position.set(0, -0.14, -0.05);
    viewmodel.add(mag);
    const sight = new THREE.Mesh(boxGeo, matAccent);
    sight.scale.set(0.02, 0.05, 0.08);
    sight.position.set(0, 0.09, -0.1);
    viewmodel.add(sight);
    viewmodel.position.set(0.24, -0.25, -0.55);
    viewmodel.scale.setScalar(0.82);
    camera.add(viewmodel);
  }
  scene.add(camera);

  // --- pooled effects: tracers, muzzle flash, smoke, explosions ---
  const tracers = [];
  const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  const flash = new THREE.PointLight(0xffc860, 0, 9, 1.8);
  scene.add(flash);
  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  flashQuad.position.set(0.26, -0.2, -0.95);
  camera.add(flashQuad);
  const smokePool = [];
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({
      color: 0xcfd0cc, roughness: 1, transparent: true, opacity: 0,
    }));
    m.visible = false;
    scene.add(m);
    smokePool.push({ mesh: m, until: 0 });
  }
  const bombMesh = new THREE.Group();
  {
    const body = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.6 }));
    body.scale.set(0.5, 0.28, 0.34);
    bombMesh.add(body);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3020 }),
    );
    light.position.set(0, 0.18, 0);
    bombMesh.add(light);
    bombMesh.userData.light = light;
  }
  bombMesh.visible = false;
  scene.add(bombMesh);
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.4 }),
  );
  grenadeMesh.visible = false;
  scene.add(grenadeMesh);
  const blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false }),
  );
  blastMesh.visible = false;
  scene.add(blastMesh);
  let blastLife = 0;

  function agentMeshFor(agent) {
    let m = agentMeshes.get(agent.id);
    if (!m) {
      m = buildAgentMesh(agent.team);
      scene.add(m);
      agentMeshes.set(agent.id, m);
    }
    return m;
  }

  // Mirror sim state into the scene. `time` is wall seconds for blinking.
  function update(state, time) {
    const p = state.player;
    // camera: player eye, or a slow death-cam pan
    if (p.alive) {
      camera.position.set(p.x, p.crouch ? 1.08 : 1.62, p.z);
      // The sim's forward is (sin yaw, cos yaw); a three.js camera looks
      // down -z at rotation.y = 0, so the camera needs yaw + PI to agree
      // with the sim's aim and movement directions.
      camera.rotation.y = p.yaw + Math.PI;
      camera.rotation.x = p.pitch + p.recoil;
      camera.rotation.z = 0;
      viewmodel.visible = true;
      // recoil kick + walk sway on the viewmodel
      viewmodel.position.z = -0.5 + p.recoil * 1.4;
      viewmodel.position.y = -0.24 + Math.sin(time * 9) * 0.006 * Math.min(1, p.speed / 5);
    } else {
      const a = state.time * 0.15;
      camera.position.set(p.x + Math.sin(a) * 3, 2.6, p.z + Math.cos(a) * 3);
      camera.lookAt(p.x, 1, p.z);
      viewmodel.visible = false;
    }
    // agents
    for (const agent of state.agents) {
      if (agent.isPlayer) continue;
      const m = agentMeshFor(agent);
      m.visible = true;
      m.position.set(agent.x, 0, agent.z);
      if (!agent.alive) {
        m.rotation.set(-Math.PI / 2, agent.yaw, 0);
        m.position.y = 0.25;
      } else {
        m.rotation.set(0, agent.yaw, 0);
        m.position.y = 0;
        m.scale.y = agent.crouch ? 0.72 : 1;
        // walk cycle on the legs
        const swing = Math.sin(time * 10) * 0.35 * Math.min(1, agent.speed / 4);
        m.userData.legL.rotation.x = swing;
        m.userData.legR.rotation.x = -swing;
      }
    }
    // bomb: carried (hidden), dropped or planted
    if (state.bomb.planted) {
      bombMesh.visible = true;
      bombMesh.position.set(state.bomb.x, 0.16, state.bomb.z);
      const blink = Math.sin(time * 8) > 0;
      bombMesh.userData.light.material.color.setHex(blink ? 0xff3020 : 0x881108);
    } else if (state.bomb.dropped) {
      bombMesh.visible = true;
      bombMesh.position.set(state.bomb.x, 0.16, state.bomb.z);
    } else {
      bombMesh.visible = false;
    }
    // grenades in flight
    const flying = state.grenades[0];
    if (flying) {
      grenadeMesh.visible = true;
      grenadeMesh.position.set(flying.x, flying.y, flying.z);
    } else {
      grenadeMesh.visible = false;
    }
    // smoke puffs
    let si = 0;
    for (const s of state.smokes) {
      if (si >= smokePool.length) break;
      const puff = smokePool[si++];
      puff.mesh.visible = true;
      puff.mesh.position.set(s.x, s.y, s.z);
      const scale = s.r * (1 + Math.sin(time * 0.7 + si) * 0.05);
      puff.mesh.scale.setScalar(scale);
      puff.mesh.material.opacity = 0.82;
    }
    for (; si < smokePool.length; si++) {
      smokePool[si].mesh.visible = false;
      smokePool[si].mesh.material.opacity = 0;
    }
    // tracers + flash fade
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= 1 / 60;
        t.mesh.material.opacity = Math.max(0, t.life / 0.09);
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    flash.intensity = Math.max(0, flash.intensity - 0.6);
    flashQuad.material.opacity = Math.max(0, flashQuad.material.opacity - 0.25);
    // explosion flash
    if (blastLife > 0) {
      blastLife -= 1 / 60;
      blastMesh.material.opacity = Math.max(0, blastLife / 0.5) * 0.55;
      blastMesh.scale.setScalar(1 + (0.5 - blastLife) * 22);
      if (blastLife <= 0) blastMesh.visible = false;
    }
  }

  function spawnTracer(from, to, color) {
    let slot = null;
    for (const t of tracers) if (t.life <= 0) { slot = t; break; }
    if (!slot) slot = tracers[0];
    const m = slot.mesh;
    _v1.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = _v1.length();
    m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    m.scale.set(1, len, 1);
    _v2.set(0, 1, 0);
    m.quaternion.setFromUnitVectors(_v2, _v1.normalize());
    m.material.color.setHex(color);
    m.material.opacity = 0.9;
    m.visible = true;
    slot.life = 0.09;
  }

  function muzzleAt(pos, dir) {
    flash.position.set(pos.x + dir.x * 0.6, pos.y + dir.y * 0.6, pos.z + dir.z * 0.6);
    flash.intensity = 3.2;
    flashQuad.material.opacity = 0.95;
  }

  function explosionAt(x, y, z, radius) {
    blastMesh.visible = true;
    blastMesh.position.set(x, y, z);
    blastMesh.scale.setScalar(1);
    blastLife = 0.5;
    flash.position.set(x, y + 1, z);
    flash.intensity = 6;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return { renderer, scene, camera, update, spawnTracer, muzzleAt, explosionAt, resize };
}
