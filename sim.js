// sim.js — the fixed-step simulation: the game's single source of truth.
// One job: advance the game state by dt (1/60 s) from an input snapshot.
// It knows nothing about three.js or the DOM; render.js and hud.js only read
// state, and main.js only feeds it input and drains state.events.
// State lives in one object: agents, bomb, grenades, smoke, rounds, economy.
import { SPAWNS, siteAt, moveCircle, circleHitsWall, segmentBlocked } from './world.js';
import { WEAPONS, GRENADES, ARMOR_PRICE, ARMOR_POINTS, currentSpread } from './weapons.js';
import { shotHit, applyDamage } from './combat.js';
import { createBotState, assignOpening, updateBot, mulberry32 } from './bots.js';

export const STEP = 1 / 60;
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const BOMB_FUSE = 40;
const WIN_ROUNDS = 5;

const NAMES = {
  viper: ['You', 'Dune', 'Mira', 'Kestrel', 'Ash'],
  jackal: ['Rook', 'Vex', 'Havoc', 'Slater', 'Onyx'],
};

function makeAgent(id, team, isPlayer) {
  return {
    id, name: NAMES[team][id % 5], team, isPlayer,
    x: 0, z: 0, yaw: 0, pitch: 0,
    hp: 100, armor: 0, alive: true,
    radius: 0.45, crouch: false, speed: 0,
    vx: 0, vz: 0,
    weapons: {
      pistol: { owned: true, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax },
      smg: { owned: false, mag: 0, reserve: 0 },
      rifle: { owned: false, mag: 0, reserve: 0 },
    },
    current: 'pistol',
    grenades: { frag: 0, smoke: 0 },
    money: 800, kills: 0, deaths: 0,
    reloadUntil: 0, nextShotAt: 0, bloom: 0, recoil: 0,
    bot: null,
    intent: { moveX: 0, moveZ: 0 },
    wantFire: false, planting: false, plantProgress: 0,
    defusing: false, defuseProgress: 0,
  };
}

export function createGame() {
  const state = {
    time: 0,
    phase: 'buy', phaseT: BUY_SECONDS,
    round: 1, score: { viper: 0, jackal: 0 },
    agents: [], player: null,
    bomb: { carrier: null, planted: false, site: null, x: 0, z: 0, fuse: 0, dropped: false },
    grenades: [], smokes: [], noises: [],
    events: [],
    rng: mulberry32(1337),
    winReason: null, matchWinner: null,
  };
  for (let i = 0; i < 5; i++) {
    const a = makeAgent(i, 'viper', i === 0);
    a.bot = i === 0 ? null : createBotState('viper', state.rng);
    state.agents.push(a);
    if (i === 0) state.player = a;
  }
  for (let i = 0; i < 5; i++) {
    const a = makeAgent(5 + i, 'jackal', false);
    a.bot = createBotState('jackal', state.rng);
    state.agents.push(a);
  }
  resetRound(state);
  return state;
}

export function aliveCount(state, team) {
  let n = 0;
  for (const a of state.agents) if (a.alive && a.team === team) n++;
  return n;
}

function resetRound(state) {
  for (const a of state.agents) {
    const spawn = SPAWNS[a.team][a.id % 5];
    a.x = spawn.x; a.z = spawn.z; a.yaw = spawn.yaw; a.pitch = 0;
    a.hp = 100; a.alive = true; a.crouch = false;
    a.vx = 0; a.vz = 0; a.bloom = 0; a.recoil = 0;
    a.reloadUntil = 0; a.nextShotAt = 0;
    a.planting = false; a.plantProgress = 0; a.defusing = false; a.defuseProgress = 0;
    a.wantFire = false;
    for (const key of ['pistol', 'smg', 'rifle']) {
      const w = a.weapons[key];
      if (w.owned) { w.mag = WEAPONS[key].mag; w.reserve = WEAPONS[key].reserveMax; }
    }
    a.grenades.frag = 0; a.grenades.smoke = 0;
    if (a.bot) { a.bot.state = 'route'; a.bot.target = null; a.bot.routeLen = 0; }
  }
  state.player.current = state.player.weapons.rifle.owned ? 'rifle'
    : state.player.weapons.smg.owned ? 'smg' : 'pistol';
  state.bomb = { carrier: state.player, planted: false, site: null, x: state.player.x, z: state.player.z, fuse: 0, dropped: false };
  state.grenades = [];
  state.smokes = [];
  state.noises = [];
  state.phase = 'buy';
  state.phaseT = BUY_SECONDS;
  state.winReason = null;
}

function startMatch(state) {
  state.round = 1;
  state.score.viper = 0;
  state.score.jackal = 0;
  state.matchWinner = null;
  for (const a of state.agents) {
    a.money = 800; a.kills = 0; a.deaths = 0; a.armor = 0;
    a.weapons.smg = { owned: false, mag: 0, reserve: 0 };
    a.weapons.rifle = { owned: false, mag: 0, reserve: 0 };
    a.weapons.pistol = { owned: true, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax };
    a.current = 'pistol';
  }
  resetRound(state);
}

export function buyItem(state, id) {
  const p = state.player;
  if (state.phase !== 'buy') return false;
  const price = id === 'armor' ? ARMOR_PRICE
    : id === 'ammo' ? 200
    : WEAPONS[id] ? WEAPONS[id].price
    : GRENADES[id] ? GRENADES[id].price : 0;
  if (p.money < price) { state.events.push({ type: 'denied' }); return false; }
  if (WEAPONS[id]) {
    const w = p.weapons[id];
    if (w.owned) { state.events.push({ type: 'denied' }); return false; }
    w.owned = true; w.mag = WEAPONS[id].mag; w.reserve = WEAPONS[id].reserveMax;
    p.current = id;
  } else if (GRENADES[id]) {
    if (p.grenades[id] >= 2) { state.events.push({ type: 'denied' }); return false; }
    p.grenades[id]++;
  } else if (id === 'armor') {
    p.armor = ARMOR_POINTS;
  } else if (id === 'ammo') {
    const w = p.weapons[p.current];
    w.reserve = WEAPONS[p.current].reserveMax;
  } else return false;
  p.money -= price;
  state.events.push({ type: 'bought', id });
  return true;
}

// --- shooting ---------------------------------------------------------------

function eyePos(a) {
  return { x: a.x, y: a.crouch ? 1.05 : 1.6, z: a.z };
}

function fireWeapon(state, agent, dirX, dirY, dirZ, spread) {
  const w = WEAPONS[agent.current];
  const slot = agent.weapons[agent.current];
  if (slot.mag <= 0 || state.time < agent.nextShotAt || state.time < agent.reloadUntil) return false;
  slot.mag--;
  agent.nextShotAt = state.time + 60 / w.rpm;
  agent.bloom = Math.min(10, agent.bloom + 1);
  // spread cone around the aim direction
  const sx = (Math.random() - 0.5) * 2 * spread;
  const sy = (Math.random() - 0.5) * 2 * spread;
  const dx = dirX + sx, dy = dirY + sy, dz = dirZ;
  const len = Math.hypot(dx, dy, dz);
  const eye = eyePos(agent);
  const hit = shotHit(state, eye.x, eye.y, eye.z, dx / len, dy / len, dz / len, w.range, agent);
  const endX = eye.x + (dx / len) * (hit ? hit.t : w.range);
  const endY = eye.y + (dy / len) * (hit ? hit.t : w.range);
  const endZ = eye.z + (dz / len) * (hit ? hit.t : w.range);
  state.events.push({
    type: 'shot', agent, weapon: w.id,
    from: eye, to: { x: endX, y: endY, z: endZ },
  });
  state.noises.push({ x: agent.x, z: agent.z, team: agent.team, time: state.time });
  if (agent.isPlayer) agent.recoil = Math.min(0.12, agent.recoil + w.recoilPitch);
  if (hit && hit.agent) {
    let dmg = w.damage * (hit.head ? w.headMult : 1);
    if (hit.t > w.range * 0.6) dmg *= 0.7;
    applyDamage(state, hit.agent, dmg, agent, w.id, hit.head);
    state.events.push({ type: 'hit', shooter: agent, target: hit.agent, headshot: hit.head, kill: !hit.agent.alive });
  }
  return true;
}

function startReload(state, agent) {
  const w = WEAPONS[agent.current];
  const slot = agent.weapons[agent.current];
  if (slot.mag >= w.mag || slot.reserve <= 0 || state.time < agent.reloadUntil) return;
  agent.reloadUntil = state.time + w.reloadMs / 1000;
  state.events.push({ type: 'reloadStart', agent });
}

function finishReload(agent) {
  const w = WEAPONS[agent.current];
  const slot = agent.weapons[agent.current];
  const need = w.mag - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
}

// --- grenades ---------------------------------------------------------------

function throwGrenade(state, agent, kind) {
  if (agent.grenades[kind] <= 0) return false;
  agent.grenades[kind]--;
  const eye = eyePos(agent);
  const g = GRENADES[kind];
  const dir = aimDir(agent);
  state.grenades.push({
    kind, x: eye.x, y: eye.y, z: eye.z,
    vx: dir.x * g.throwSpeed, vy: dir.y * g.throwSpeed + 2.5, vz: dir.z * g.throwSpeed,
    fuse: g.fuseMs / 1000, owner: agent, bounced: false,
  });
  state.events.push({ type: 'throw', agent, kind });
  return true;
}

function aimDir(agent) {
  const cy = Math.cos(agent.yaw), sy = Math.sin(agent.yaw);
  const cp = Math.cos(agent.pitch), sp = Math.sin(agent.pitch);
  return { x: sy * cp, y: sp, z: cy * cp };
}

function explodeFrag(state, g) {
  const r = GRENADES.frag.radius;
  state.events.push({ type: 'explosion', x: g.x, y: g.y, z: g.z, radius: r });
  for (const a of state.agents) {
    if (!a.alive) continue;
    const dx = a.x - g.x, dy = 1.0 - g.y, dz = a.z - g.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > r) continue;
    // walls between the blast and the victim block it
    if (segmentBlocked(g.x, g.y, g.z, a.x, 1.0, a.z)) continue;
    const dmg = GRENADES.frag.maxDamage * (1 - d / r * 0.7);
    applyDamage(state, a, dmg, g.owner, 'frag', false);
  }
}

function spawnSmoke(state, g) {
  const r = GRENADES.smoke.radius;
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 1.6;
    state.smokes.push({
      x: g.x + Math.cos(a) * d, y: 0.9 + Math.random() * 0.8, z: g.z + Math.sin(a) * d,
      r: 2.0 + Math.random() * 0.7, until: state.time + GRENADES.smoke.lifeMs / 1000,
    });
  }
  state.events.push({ type: 'smoke', x: g.x, y: g.y, z: g.z, radius: r });
}

// --- rounds -----------------------------------------------------------------

function endRound(state, winner, reason) {
  if (state.phase !== 'live') return;
  state.phase = 'end';
  state.phaseT = 4;
  state.score[winner]++;
  state.winReason = reason;
  for (const a of state.agents) {
    if (a.team === winner) a.money += 3250;
    else a.money += 1900;
  }
  state.events.push({ type: 'roundEnd', winner, reason, score: { ...state.score } });
}

function checkRoundEnd(state) {
  if (state.phase !== 'live') return;
  if (aliveCount(state, 'jackal') === 0) return endRound(state, 'viper', 'elimination');
  if (aliveCount(state, 'viper') === 0) return endRound(state, 'jackal', 'elimination');
  if (state.bomb.planted && state.bomb.fuse <= 0) {
    state.events.push({ type: 'explosion', x: state.bomb.x, y: 0.5, z: state.bomb.z, radius: 12 });
    return endRound(state, 'viper', 'detonation');
  }
  if (state.phaseT <= 0) return endRound(state, 'jackal', 'time');
}

// --- main step --------------------------------------------------------------

export function stepGame(state, input, dt) {
  state.time += dt;
  const p = state.player;

  // ---- phase timers ----
  state.phaseT -= dt;
  if (state.phase === 'buy' && state.phaseT <= 0) {
    state.phase = 'live';
    state.phaseT = ROUND_SECONDS;
    for (const a of state.agents) if (a.bot) assignOpening(a, state, state.rng);
    state.events.push({ type: 'roundStart', round: state.round });
  } else if (state.phase === 'end' && state.phaseT <= 0) {
    if (state.score.viper >= WIN_ROUNDS || state.score.jackal >= WIN_ROUNDS) {
      state.phase = 'matchEnd';
      state.phaseT = 8;
      state.matchWinner = state.score.viper > state.score.jackal ? 'viper' : 'jackal';
      state.events.push({ type: 'matchEnd', winner: state.matchWinner });
    } else {
      state.round++;
      resetRound(state);
    }
  } else if (state.phase === 'matchEnd' && state.phaseT <= 0) {
    startMatch(state);
  }

  // ---- bomb fuse ----
  if (state.bomb.planted) state.bomb.fuse -= dt;

  // ---- player ----
  if (p.alive && state.phase !== 'matchEnd') {
    // look
    p.yaw -= input.lookDX;
    p.pitch -= input.lookDY;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
    p.recoil = Math.max(0, p.recoil - dt * 0.25);
    // crouch
    p.crouch = !!input.crouch;
    // movement: acceleration-based, axis-separated collision (slides on walls)
    const wantRun = input.run && !p.crouch;
    const speed = p.crouch ? 2.6 : wantRun ? 6.8 : 5.2;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const fwdX = sy, fwdZ = cy;
    // camera right is (-cos yaw, sin yaw): rotation.y = yaw + PI maps the
    // camera's local +x to (-cos yaw, 0, sin yaw)
    const rightX = -cy, rightZ = sy;
    const desX = (fwdX * input.fwd + rightX * input.strafe) * speed;
    const desZ = (fwdZ * input.fwd + rightZ * input.strafe) * speed;
    const accel = 40;
    p.vx += Math.max(-accel * dt, Math.min(accel * dt, desX - p.vx));
    p.vz += Math.max(-accel * dt, Math.min(accel * dt, desZ - p.vz));
    p.speed = Math.hypot(p.vx, p.vz);
    const out = stepGame._out || (stepGame._out = { x: 0, z: 0 });
    moveCircle(p.x, p.z, p.vx * dt, p.vz * dt, p.radius, out);
    p.x = out.x; p.z = out.z;
    // weapon select
    if (input.select) {
      if (WEAPONS[input.select] && p.weapons[input.select].owned) {
        p.current = input.select;
        p.reloadUntil = 0;
      } else if (GRENADES[input.select] && p.grenades[input.select] > 0) {
        p.current = input.select;
      }
    }
    if (input.cycle) {
      const owned = ['pistol', 'smg', 'rifle'].filter((k) => p.weapons[k].owned);
      const idx = owned.indexOf(p.current);
      const next = owned[(idx + input.cycle + owned.length) % owned.length];
      if (next) { p.current = next; p.reloadUntil = 0; }
    }
    // reload
    if (input.reload) startReload(state, p);
    if (p.reloadUntil && state.time >= p.reloadUntil) { finishReload(p); p.reloadUntil = 0; }
    // firing
    const w = WEAPONS[p.current];
    if (w && input.firing && p.alive) {
      const dir = aimDir(p);
      const spread = currentSpread(w, p.speed > 0.5, false, p.bloom);
      fireWeapon(state, p, dir.x, dir.y, dir.z, spread);
    } else if (w && input.firePressed && p.alive) {
      const dir = aimDir(p);
      const spread = currentSpread(w, p.speed > 0.5, false, p.bloom);
      fireWeapon(state, p, dir.x, dir.y, dir.z, spread);
    }
    // grenade throw (click while a grenade is selected)
    if (GRENADES[p.current] && (input.firing || input.firePressed)) {
      if (throwGrenade(state, p, p.current)) {
        p.current = p.weapons.rifle.owned ? 'rifle' : p.weapons.smg.owned ? 'smg' : 'pistol';
      }
    }
    // bloom decay
    p.bloom = Math.max(0, p.bloom - dt * 6);
    // plant: hold E in a site while carrying the charge
    if (state.bomb.carrier === p && !state.bomb.planted && state.phase === 'live') {
      const site = siteAt(p.x, p.z);
      if (site && input.plant) {
        p.planting = true;
        p.plantProgress += dt / PLANT_SECONDS;
        if (p.plantProgress >= 1) {
          p.planting = false;
          p.plantProgress = 0;
          state.events.push({ type: 'planted', site, by: p });
        }
      } else {
        p.planting = false;
        p.plantProgress = 0;
      }
    }
    // buy
    if (input.buyItem) buyItem(state, input.buyItem);
  }

  // ---- bots: only during the live round — never during buy or after it ----
  if (state.phase === 'live') {
    for (const a of state.agents) {
      if (!a.bot || !a.alive) continue;
      a.wantFire = false;
      updateBot(state, a, dt);
      // bot movement from intent
      const out = stepGame._out || (stepGame._out = { x: 0, z: 0 });
      moveCircle(a.x, a.z, a.intent.moveX * dt, a.intent.moveZ * dt, a.radius, out);
      a.x = out.x; a.z = out.z;
      a.speed = Math.hypot(a.intent.moveX, a.intent.moveZ);
      // bot reload
      if (a.reloadUntil && state.time >= a.reloadUntil) { finishReload(a); a.reloadUntil = 0; }
      // bot fire
      if (a.wantFire && a.reloadUntil === 0) {
        const slot = a.weapons[a.current];
        if (slot.mag <= 0) { startReload(state, a); }
        else {
          const dir = aimDir(a);
          const spread = 0.02 + a.bot.aimError;
          fireWeapon(state, a, dir.x, dir.y, dir.z, spread);
        }
      }
      // bot plant progress is driven by bots.js; complete it here
      if (a.planting && a.plantProgress >= 1) {
        a.planting = false; a.plantProgress = 0;
      }
    }
  }

  // ---- bomb events (plant / defuse) ----
  for (const e of state.events) {
    if (e.type === 'planted' && !state.bomb.planted) {
      state.bomb.planted = true;
      state.bomb.site = e.site;
      state.bomb.x = e.by.x;
      state.bomb.z = e.by.z;
      state.bomb.fuse = BOMB_FUSE;
      state.bomb.carrier = null;
      if (e.by.isPlayer || e.by.team === 'viper') e.by.money += 300;
      state.events.push({ type: 'bombPlanted', site: e.site });
    } else if (e.type === 'defused' && state.bomb.planted) {
      state.bomb.planted = false;
      e.by.money += 300;
      endRound(state, 'jackal', 'defuse');
    }
  }

  // ---- grenade physics ----
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    g.vy -= 12 * dt;
    let nx = g.x + g.vx * dt;
    let nz = g.z + g.vz * dt;
    let ny = g.y + g.vy * dt;
    // wall bounce: revert the axis that hit, dampen
    if (circleHitsWall(nx, g.z, 0.15)) { nx = g.x; g.vx = -g.vx * 0.5; }
    if (circleHitsWall(g.x, nz, 0.15)) { nz = g.z; g.vz = -g.vz * 0.5; }
    if (ny < 0.12) {
      ny = 0.12;
      if (Math.abs(g.vy) > 1.5) { g.vy = -g.vy * 0.4; g.vx *= 0.6; g.vz *= 0.6; g.bounced = true; }
      else { g.vy = 0; g.vx *= 0.8; g.vz *= 0.8; }
    }
    g.x = nx; g.y = ny; g.z = nz;
    if (g.fuse <= 0 || (g.kind === 'smoke' && g.bounced && g.fuse < GRENADES.smoke.fuseMs / 1000 - 0.5)) {
      if (g.kind === 'frag') explodeFrag(state, g);
      else spawnSmoke(state, g);
      state.grenades.splice(i, 1);
    }
  }

  // ---- smoke expiry ----
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    if (state.time > state.smokes[i].until) state.smokes.splice(i, 1);
  }
  // ---- noise expiry ----
  for (let i = state.noises.length - 1; i >= 0; i--) {
    if (state.time - state.noises[i].time > 1) state.noises.splice(i, 1);
  }

  checkRoundEnd(state);
}
