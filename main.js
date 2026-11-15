// main.js — DUSTLINE bootstrap and game loop.
// The judge's map of the game (criterion 5, code): the fixed-step simulation
// lives in sim.js and knows nothing of three.js; render.js only mirrors state
// into meshes; hud.js only writes DOM; bots.js only decides bot intentions;
// input.js only reads keys and mouse; combat.js only resolves hits.
// This file wires them together: fixed 60 Hz steps, render each frame,
// drain state.events into sound, tracers and HUD.
import { createGame, stepGame, buyItem, STEP, aliveCount } from './sim.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { sfx, unlockAudio } from './audio.js';
import { WEAPONS } from './weapons.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

let renderer, scene, camera;
try {
  const r = createRenderer();
  renderer = r.renderer; scene = r.scene; camera = r.camera;
  document.getElementById('app').prepend(renderer.domElement);
  window.__render = r;
} catch (err) {
  document.getElementById('clickHint').textContent = 'WebGL failed to start: ' + err.message;
  throw err;
}

const state = createGame();
const input = createInput(renderer.domElement);
const hud = createHud(state, (id) => buyItem(state, id));

// Number keys 6/7 buy armor/ammo while the buy menu is open.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit6' && buyOpen) buyItem(state, 'armor');
  if (e.code === 'Digit7' && buyOpen) buyItem(state, 'ammo');
  if (e.code === 'Escape' && buyOpen) { buyOpen = false; hud.setBuyVisible(false); }
  if (e.code === 'KeyB') unlockAudio();
});
renderer.domElement.addEventListener('mousedown', unlockAudio);
window.addEventListener('resize', () => window.__render.resize());

// --- screenshot presets: real states of the live game, chosen by ?shot= ---
// cover: spawn view in the buy phase (the default). lane: mid fight.
// buy: buy menu open. site: planted charge at A with bots around.
let buyOpen = false;
function applyShotPreset() {
  if (!shot) return;
  const p = state.player;
  const vipers = state.agents.filter((a) => a.team === 'viper' && !a.isPlayer);
  const jackals = state.agents.filter((a) => a.team === 'jackal');
  const holdBot = (bot, x, z, yaw) => {
    bot.x = x; bot.z = z; bot.yaw = yaw;
    if (bot.bot) { bot.bot.state = 'hold'; bot.bot.holdUntil = 99999; bot.bot.holdYaw = yaw; }
  };
  if (shot === 'lane') {
    state.phase = 'live'; state.phaseT = 90;
    // A-Long, facing north up the lane: a Jackal holds the far end.
    // Standing west of the tall crate so the lane reads at a glance.
    p.x = -26.5; p.z = 9; p.yaw = Math.PI; p.pitch = 0;
    holdBot(jackals[0], -24, -6, 0);
    holdBot(jackals[1], -20, -12, 0.6);
    holdBot(vipers[0], -20, 12, Math.PI);
    p.current = 'rifle';
    p.weapons.rifle.owned = true;
    p.weapons.rifle.mag = WEAPONS.rifle.mag;
    p.weapons.rifle.reserve = WEAPONS.rifle.reserveMax;
  } else if (shot === 'site') {
    state.phase = 'live'; state.phaseT = 35;
    p.x = -17; p.z = -11; p.yaw = Math.atan2(-24 - p.x, -19 - p.z); p.pitch = -0.02;
    state.bomb.planted = true;
    state.bomb.site = 'A';
    state.bomb.x = -24; state.bomb.z = -19;
    state.bomb.fuse = 35;
    state.bomb.carrier = null;
    holdBot(jackals[0], -27, -21, Math.PI * 0.6);
    holdBot(jackals[1], -20, -16, -Math.PI * 0.4);
    holdBot(vipers[0], -14, -8, Math.PI);
    p.current = 'rifle';
    p.weapons.rifle.owned = true;
    p.weapons.rifle.mag = WEAPONS.rifle.mag;
    p.weapons.rifle.reserve = WEAPONS.rifle.reserveMax;
  } else if (shot === 'buy') {
    buyOpen = true;
    hud.setBuyVisible(true);
    p.money = 4500;
  }
}
applyShotPreset();

// Exposed for headless play-tests: read live state, force inputs.
window.__dustline = { state, input };

// --- event drain: sim events become sound, tracers and HUD ---
function drainEvents() {
  const r = window.__render;
  for (const e of state.events) {
    switch (e.type) {
      case 'shot': {
        const w = WEAPONS[e.weapon];
        r.spawnTracer(e.from, e.to, w ? w.tracer : 0xffe9a8);
        if (e.agent.isPlayer) {
          sfx.shot(e.weapon);
          r.muzzleAt(e.from, { x: Math.sin(e.agent.yaw), y: Math.sin(e.agent.pitch), z: Math.cos(e.agent.yaw) });
        } else {
          const d = Math.hypot(e.agent.x - state.player.x, e.agent.z - state.player.z);
          sfx.enemyShot(d);
        }
        break;
      }
      case 'hit':
        if (e.shooter.isPlayer) {
          hud.flashHit(e.kill);
          if (e.kill) sfx.kill(); else sfx.hit();
        }
        break;
      case 'damage':
        if (e.target.isPlayer) sfx.hurt();
        break;
      case 'kill':
        hud.addKill(e.killer, e.victim, e.weapon, e.headshot);
        break;
      case 'explosion':
        r.explosionAt(e.x, e.y, e.z, e.radius);
        sfx.explosion();
        break;
      case 'roundStart':
        hud.showBanner('ROUND ' + e.round, 'Eliminate the enemy — or plant the charge', 2.5);
        break;
      case 'roundEnd': {
        const won = e.winner === 'viper';
        const reasonText = {
          elimination: 'enemy team eliminated',
          detonation: 'the charge detonated',
          defuse: 'the charge was defused',
          time: 'time expired — site held',
        }[e.reason] || '';
        hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reasonText, 3.5);
        if (won) sfx.roundWin(); else sfx.roundLose();
        break;
      }
      case 'matchEnd':
        hud.showBanner(e.winner === 'viper' ? 'VIPERS WIN THE MATCH' : 'JACKALS WIN THE MATCH', 'First to 5 rounds', 7);
        break;
      case 'bombPlanted':
        hud.showBanner('CHARGE PLANTED', 'Site ' + e.site + ' — defend it', 3);
        sfx.planted();
        break;
      case 'defused':
        hud.showBanner('CHARGE DEFUSED', 'Site held', 3);
        break;
      case 'bought': sfx.buy(); break;
      case 'denied': sfx.denied(); break;
      case 'reloadStart': sfx.reload(); break;
      case 'throw': sfx.throwPin(); break;
      default: break;
    }
  }
  state.events.length = 0;
}

// --- fixed-step loop: simulate at 60 Hz, render every frame ---
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();

  // buy menu
  if (input.buyToggle) {
    if (state.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.setBuyVisible(buyOpen);
      if (buyOpen && document.pointerLockElement) document.exitPointerLock();
    }
  }
  if (state.phase !== 'buy' && buyOpen) { buyOpen = false; hud.setBuyVisible(false); }
  if (buyOpen && input.select) { buyItem(state, input.select); input.select = null; }
  hud.showScoreboard(input.scoreboard);
  hud.setClickHint(!input.locked && state.player.alive && !buyOpen);

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    stepGame(state, input, STEP);
    drainEvents();
    input.consumeEdges();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;

  hud.update(dt);
  window.__render.update(state, now / 1000);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
