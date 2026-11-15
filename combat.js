// combat.js — hitscan and damage, shared by the simulation and the bots.
// One job: given a ray, find what it hits; given a hit, apply damage.
// Pure math over the sim state, no three.js, no DOM.
import { WALLS } from './world.js';

// Ray vs AABB: nearest t in [0, maxDist], or Infinity. Slab method.
export function rayBoxT(ox, oy, oz, dx, dy, dz, bx0, by0, bz0, bx1, by1, bz1, maxDist) {
  let tmin = 0, tmax = maxDist;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const lo = [bx0, by0, bz0], hi = [bx1, by1, bz1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return Infinity;
    } else {
      let t1 = (lo[a] - o[a]) / d[a];
      let t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Ray vs sphere: nearest t in [0, maxDist], or Infinity.
export function raySphereT(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const t = tca - Math.sqrt(r2 - d2);
  return t <= maxDist ? t : Infinity;
}

// Nearest wall hit along the ray, or Infinity.
export function wallHitT(state, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (let i = 0; i < WALLS.length; i++) {
    const w = WALLS[i];
    const t = rayBoxT(ox, oy, oz, dx, dy, dz, w.x0, 0, w.z0, w.x1, w.h, w.z1, maxDist);
    if (t < best) best = t;
  }
  return best;
}

// Does the segment (x0,y0,z0)-(x1,y1,z1) pass through any smoke puff?
export function segmentInSmoke(state, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < state.smokes.length; i++) {
    const s = state.smokes[i];
    // segment vs sphere: sample the closest point
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = len2 > 0 ? ((s.x - x0) * dx + (s.y - y0) * dy + (s.z - z0) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x0 + dx * t, py = y0 + dy * t, pz = z0 + dz * t;
    const ddx = px - s.x, ddy = py - s.y, ddz = pz - s.z;
    if (ddx * ddx + ddy * ddy + ddz * ddz < s.r * s.r) return true;
  }
  return false;
}

// A hitscan shot. Returns the hit: { t, agent|null, head, x, y, z } or null
// when nothing is hit within maxDist. Walls stop the ray; agents are checked
// with a body box and a head sphere (headshots pay 4x).
export function shotHit(state, ox, oy, oz, dx, dy, dz, maxDist, shooter) {
  const tWall = wallHitT(state, ox, oy, oz, dx, dy, dz, maxDist);
  let bestT = tWall, bestAgent = null, bestHead = false;
  for (let i = 0; i < state.agents.length; i++) {
    const a = state.agents[i];
    if (!a.alive || a === shooter) continue;
    const headY = a.crouch ? 0.95 : 1.45;
    // head sphere first (it overlaps the body box)
    const tHead = raySphereT(ox, oy, oz, dx, dy, dz, a.x, headY, a.z, 0.26, maxDist);
    if (tHead < bestT) { bestT = tHead; bestAgent = a; bestHead = true; continue; }
    const bodyTop = a.crouch ? 1.1 : 1.55;
    const tBody = rayBoxT(ox, oy, oz, dx, dy, dz, a.x - 0.42, 0, a.z - 0.42, a.x + 0.42, bodyTop, a.z + 0.42, maxDist);
    if (tBody < bestT) { bestT = tBody; bestAgent = a; bestHead = false; }
  }
  if (bestT === Infinity) return null;
  return {
    t: bestT, agent: bestAgent, head: bestHead,
    x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT,
  };
}

// Can agent `a` see agent `b`? Eye-to-eye segment, walls and smoke block it.
export function canSeeAgent(state, a, b) {
  const ay = a.crouch ? 1.0 : 1.5;
  const by = b.crouch ? 1.0 : 1.5;
  const dx = b.x - a.x, dy = by - ay, dz = b.z - a.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > 48) return false;
  const nx = dx / dist, ny = dy / dist, nz = dz / dist;
  if (wallHitT(state, a.x, ay, a.z, nx, ny, nz, dist) < dist) return false;
  if (segmentInSmoke(state, a.x, ay, a.z, b.x, by, b.z)) return false;
  return true;
}

// Apply damage with armor (armor absorbs half until it is gone). Emits events.
export function applyDamage(state, target, amount, attacker, weaponId, headshot) {
  if (!target.alive) return;
  let dmg = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, dmg * 0.5);
    target.armor -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  state.events.push({ type: 'damage', target, amount: dmg, attacker, headshot });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths++;
    if (attacker) attacker.kills++;
    state.events.push({ type: 'kill', killer: attacker, victim: target, weapon: weaponId, headshot });
    if (target === state.player) state.events.push({ type: 'playerDied' });
    if (state.bomb.carrier === target && !state.bomb.planted) {
      state.bomb.carrier = null;
      state.bomb.x = target.x;
      state.bomb.z = target.z;
      state.bomb.dropped = true;
      state.events.push({ type: 'bombDropped', x: target.x, z: target.z });
    }
  }
}
