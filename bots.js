// bots.js — bot AI: routes, holds, vision, hearing, planting and defusing.
// One job: decide what each bot does this tick. The simulation owns movement,
// shooting and damage; this file only writes intentions into bot.state.
// A bot thinks in states: route -> hold -> engage -> investigate -> plant/defuse.
import { WAYPOINTS, findRoute, nearestWaypoint, siteAt } from './world.js';
import { canSeeAgent } from './combat.js';
import { WEAPONS } from './weapons.js';

// Small seeded RNG so bot choices are stable per round (screenshots replay).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROUTE_BUF = new Int16Array(32);

export function createBotState(team, rng) {
  return {
    state: 'route', // route | hold | engage | investigate | plant | defuse | pickup
    route: new Int16Array(16),
    routeLen: 0,
    routeIdx: 0,
    holdUntil: 0,
    holdYaw: 0,
    target: null,
    lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
    aimError: 0.05,
    burstLeft: 0,
    nextShot: 0,
    reactionUntil: 0,
    investigateX: 0, investigateZ: 0,
    plantSite: null,
    visionTimer: rng() * 0.1,
    strafeDir: 1,
    strafeUntil: 0,
  };
}

// Assign a bot its opening route for the round.
export function assignOpening(bot, state, rng) {
  const b = bot.bot;
  const start = nearestWaypoint(bot.x, bot.z);
  if (bot.team === 'viper') {
    // Attackers: pick a site (60% A, 40% B) and walk a lane to it.
    const site = rng() < 0.6 ? 'A' : 'B';
    b.plantSite = site;
    const dest = site === 'A' ? 7 : 11;
    b.routeLen = findRoute(start, dest, ROUTE_BUF);
    b.route.set(ROUTE_BUF.subarray(0, b.routeLen));
    b.routeIdx = 1;
    b.state = 'route';
  } else {
    // Defenders: 2 to A, 2 to B, 1 mid. Picked by bot id order.
    const idx = bot.id % 5;
    const dest = idx === 0 ? 7 : idx === 1 ? 11 : idx === 2 ? 6 : idx === 3 ? 10 : 14;
    b.routeLen = findRoute(start, dest, ROUTE_BUF);
    b.route.set(ROUTE_BUF.subarray(0, b.routeLen));
    b.routeIdx = 1;
    b.state = 'route';
    b.holdYaw = dest === 7 ? -0.6 : dest === 11 ? 0.6 : 0;
  }
}

// Route a bot to a waypoint, replacing its current route.
export function routeTo(bot, destWp) {
  const b = bot.bot;
  const start = nearestWaypoint(bot.x, bot.z);
  b.routeLen = findRoute(start, destWp, ROUTE_BUF);
  b.route.set(ROUTE_BUF.subarray(0, b.routeLen));
  b.routeIdx = 1;
  b.state = 'route';
}

// One bot, one tick. Writes bot.moveX/moveZ/yaw targets into bot.intent.
export function updateBot(state, bot, dt) {
  const b = bot.bot;
  if (!bot.alive) return;
  b.visionTimer -= dt;

  // --- vision (staggered, every ~0.12 s): nearest visible enemy ---
  if (b.visionTimer <= 0) {
    b.visionTimer = 0.12;
    const seen = nearestVisibleEnemy(state, bot);
    if (seen) {
      if (b.target !== seen) {
        // first sight: reaction time before the first shot
        b.reactionUntil = state.time + 0.28 + Math.random() * 0.35;
        b.aimError = 0.05;
      }
      b.target = seen;
      b.lastSeenX = seen.x; b.lastSeenZ = seen.z; b.lastSeenT = state.time;
      if (b.state !== 'engage') b.state = 'engage';
    } else if (b.target && state.time - b.lastSeenT > 2.0) {
      // lost them: go look where they were last seen
      b.investigateX = b.lastSeenX; b.investigateZ = b.lastSeenZ;
      b.target = null;
      if (b.state === 'engage') b.state = 'investigate';
    }
  }

  // --- hearing: a gunshot nearby pulls bots to investigate ---
  if (b.state !== 'engage' && b.state !== 'plant' && b.state !== 'defuse') {
    for (let i = 0; i < state.noises.length; i++) {
      const n = state.noises[i];
      if (n.time < state.time - 0.5) continue;
      const dx = n.x - bot.x, dz = n.z - bot.z;
      if (dx * dx + dz * dz < 30 * 30 && n.team !== bot.team) {
        if (b.state !== 'investigate' || Math.random() < 0.3) {
          b.investigateX = n.x; b.investigateZ = n.z;
          b.state = 'investigate';
        }
        break;
      }
    }
  }

  // --- bomb carrier duties ---
  if (state.bomb.carrier === bot && !state.bomb.planted && b.state !== 'engage') {
    const site = siteAt(bot.x, bot.z);
    if (site && b.state !== 'plant') {
      b.state = 'plant';
      b.plantUntil = state.time + 3.0;
    }
  }
  if (state.bomb.dropped && bot.team === 'viper' && b.state !== 'engage' && b.state !== 'plant') {
    const dx = state.bomb.x - bot.x, dz = state.bomb.z - bot.z;
    if (dx * dx + dz * dz < 25 * 25) {
      b.state = 'pickup';
      b.pickupX = state.bomb.x; b.pickupZ = state.bomb.z;
    }
  }
  if (state.bomb.planted && bot.team === 'jackal' && b.state !== 'engage' && b.state !== 'defuse') {
    b.state = 'defuse';
    b.defuseX = state.bomb.x; b.defuseZ = state.bomb.z;
  }

  // --- act on the state ---
  bot.intent.moveX = 0; bot.intent.moveZ = 0;
  switch (b.state) {
    case 'route': followRoute(state, bot, dt); break;
    case 'hold': holdPosition(state, bot, dt); break;
    case 'engage': engage(state, bot, dt); break;
    case 'investigate': investigate(state, bot, dt); break;
    case 'plant': plantTick(state, bot, dt); break;
    case 'defuse': defuseTick(state, bot, dt); break;
    case 'pickup': pickupTick(state, bot, dt); break;
  }
}

function nearestVisibleEnemy(state, bot) {
  let best = null, bestD = Infinity;
  const eyeY = bot.crouch ? 1.0 : 1.5;
  for (let i = 0; i < state.agents.length; i++) {
    const e = state.agents[i];
    if (!e.alive || e.team === bot.team) continue;
    const dx = e.x - bot.x, dz = e.z - bot.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 48 * 48 || d2 >= bestD) continue;
    // field of view: 100 degrees around the bot's facing
    const ang = Math.atan2(dx, dz);
    let diff = ang - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.1 && d2 > 4) continue;
    if (!canSeeAgent(state, bot, e)) continue;
    best = e; bestD = d2;
  }
  return best;
}

function followRoute(state, bot, dt) {
  const b = bot.bot;
  if (b.routeIdx >= b.routeLen) {
    // arrived: hold this spot and watch an approach lane
    b.state = 'hold';
    b.holdUntil = state.time + 6 + Math.random() * 6;
    b.holdYaw = bot.yaw + (Math.random() - 0.5) * 1.2;
    return;
  }
  const wp = WAYPOINTS[b.route[b.routeIdx]];
  const dx = wp.x - bot.x, dz = wp.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { b.routeIdx++; return; }
  const speed = 4.2;
  bot.intent.moveX = (dx / d) * speed;
  bot.intent.moveZ = (dz / d) * speed;
  bot.yaw = Math.atan2(dx, dz);
}

function holdPosition(state, bot, dt) {
  const b = bot.bot;
  // scan slowly while holding
  bot.yaw = b.holdYaw + Math.sin(state.time * 0.4 + bot.id) * 0.5;
  if (state.time > b.holdUntil) {
    // rotate to a neighbouring hold or re-route to the site
    if (bot.team === 'jackal') {
      b.holdUntil = state.time + 6 + Math.random() * 6;
      b.holdYaw += (Math.random() - 0.5) * 2;
    } else {
      routeTo(bot, b.plantSite === 'A' ? 7 : 11);
    }
  }
}

function engage(state, bot, dt) {
  const b = bot.bot;
  const t = b.target;
  if (!t || !t.alive) { b.target = null; b.state = 'route'; return; }
  const dx = t.x - bot.x, dz = t.z - bot.z;
  const dist = Math.hypot(dx, dz);
  // face the target, tracking with error that shrinks the longer we see them
  b.aimError = Math.max(0.012, b.aimError - dt * 0.02);
  const err = (Math.random() - 0.5) * b.aimError * 2;
  bot.yaw = Math.atan2(dx, dz) + err;
  bot.pitch = -Math.atan2((t.crouch ? 1.0 : 1.35) - 1.5, dist) + (Math.random() - 0.5) * b.aimError;
  // strafe while fighting, changing direction every 1-2 s
  if (state.time > b.strafeUntil) {
    b.strafeDir = Math.random() < 0.5 ? -1 : 1;
    b.strafeUntil = state.time + 0.8 + Math.random() * 1.2;
  }
  const strafeSpeed = dist > 6 ? 1.6 : 0;
  bot.intent.moveX = Math.cos(bot.yaw) * b.strafeDir * strafeSpeed;
  bot.intent.moveZ = -Math.sin(bot.yaw) * b.strafeDir * strafeSpeed;
  // fire in bursts once the reaction time has passed
  if (state.time < b.reactionUntil) return;
  if (b.burstLeft <= 0) {
    if (state.time > b.nextShot) {
      b.burstLeft = 3 + Math.floor(Math.random() * 3);
      b.nextShot = state.time + 0.45 + Math.random() * 0.5;
    }
    return;
  }
  if (state.time >= b.nextShot) {
    bot.wantFire = true;
    b.burstLeft--;
    const w = WEAPONS[bot.current];
    b.nextShot = state.time + 60 / w.rpm;
  }
}

function investigate(state, bot, dt) {
  const b = bot.bot;
  const dx = b.investigateX - bot.x, dz = b.investigateZ - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2) {
    b.state = 'hold';
    b.holdUntil = state.time + 3;
    b.holdYaw = bot.yaw;
    return;
  }
  const speed = 4.6;
  bot.intent.moveX = (dx / d) * speed;
  bot.intent.moveZ = (dz / d) * speed;
  bot.yaw = Math.atan2(dx, dz);
}

function plantTick(state, bot, dt) {
  const b = bot.bot;
  bot.intent.moveX = 0; bot.intent.moveZ = 0;
  const site = siteAt(bot.x, bot.z);
  if (!site) { b.state = 'route'; return; }
  bot.planting = true;
  bot.plantProgress = 1 - (b.plantUntil - state.time) / 3.0;
  if (state.time >= b.plantUntil) {
    bot.planting = false;
    state.events.push({ type: 'planted', site, by: bot });
  }
}

function defuseTick(state, bot, dt) {
  const b = bot.bot;
  const dx = b.defuseX - bot.x, dz = b.defuseZ - bot.z;
  const d = Math.hypot(dx, dz);
  if (d > 1.6) {
    const speed = 4.8;
    bot.intent.moveX = (dx / d) * speed;
    bot.intent.moveZ = (dz / d) * speed;
    bot.yaw = Math.atan2(dx, dz);
    return;
  }
  bot.intent.moveX = 0; bot.intent.moveZ = 0;
  bot.defusing = true;
  bot.defuseProgress = (bot.defuseProgress || 0) + dt / 5.0;
  if (bot.defuseProgress >= 1) {
    bot.defusing = false;
    state.events.push({ type: 'defused', by: bot });
  }
}

function pickupTick(state, bot, dt) {
  const b = bot.bot;
  const dx = b.pickupX - bot.x, dz = b.pickupZ - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.0) {
    state.bomb.carrier = bot;
    state.bomb.dropped = false;
    state.events.push({ type: 'bombPicked', by: bot });
    b.plantSite = state.bomb.site || 'A';
    routeTo(bot, b.plantSite === 'A' ? 7 : 11);
    return;
  }
  const speed = 4.8;
  bot.intent.moveX = (dx / d) * speed;
  bot.intent.moveZ = (dz / d) * speed;
  bot.yaw = Math.atan2(dx, dz);
}
