// world.js — the Quarry map: data, collision and line-of-sight.
// One job: describe the map as axis-aligned boxes, answer "does this circle hit
// a wall?" and "is this segment blocked?", and hand the renderer the boxes to draw.
// The map is original: two bombsites (A Crusher, B Silos) joined by A-Long,
// Mid and B-Short, with crates for cover. No borrowed layout.
import { PALETTE } from './palette.js';

// A wall: axis-aligned box in the XZ plane, y from 0 to h.
// kind: 'wall' (full height, blocks sight + movement) or 'crate' (low, blocks
// movement, not sight over the top — treated as sight-blocking only below h).
export const WALLS = [
  // --- outer boundary (h 5) ---
  { x0: -33, z0: -25, x1: 33, z1: -24, h: 5, kind: 'wall' }, // north
  { x0: -33, z0: 24, x1: 33, z1: 25, h: 5, kind: 'wall' }, // south
  { x0: -33, z0: -25, x1: -32, z1: 25, h: 5, kind: 'wall' }, // west
  { x0: 32, z0: -25, x1: 33, z1: 25, h: 5, kind: 'wall' }, // east
  // --- A-Long inner wall (west lane) with two gaps: spawn side z 10..18, site side z -18..-14 ---
  { x0: -17, z0: -14, x1: -16, z1: 10, h: 4, kind: 'wall' },
  // --- B-Short inner wall (east lane), same gaps ---
  { x0: 16, z0: -14, x1: 17, z1: 10, h: 4, kind: 'wall' },
  // --- Mid door wall: a wall across Mid at z 6 with a 2 m door ---
  { x0: -3, z0: 6, x1: -1, z1: 7, h: 4, kind: 'wall' },
  { x0: 1, z0: 6, x1: 3, z1: 7, h: 4, kind: 'wall' },
  // --- Mid top wall: splits Mid-top from the sites, gaps at x -8..-4 (to A) and x 4..8 (to B) ---
  { x0: -16, z0: -9, x1: -8, z1: -8, h: 4, kind: 'wall' },
  { x0: -4, z0: -9, x1: 4, z1: -8, h: 4, kind: 'wall' },
  { x0: 8, z0: -9, x1: 16, z1: -8, h: 4, kind: 'wall' },
  // --- Site back walls (cover inside the sites) ---
  { x0: -30, z0: -22, x1: -26, z1: -21, h: 3, kind: 'wall' },
  { x0: 26, z0: -22, x1: 30, z1: -21, h: 3, kind: 'wall' },
  // --- Crates (h 1.2 low, h 2.4 tall) ---
  { x0: -27, z0: -20, x1: -25, z1: -18, h: 1.2, kind: 'crate' },
  { x0: -21, z0: -22, x1: -19, z1: -20.5, h: 2.4, kind: 'crate' },
  { x0: -24, z0: -12, x1: -22, z1: -10, h: 1.2, kind: 'crate' },
  { x0: 25, z0: -20, x1: 27, z1: -18, h: 1.2, kind: 'crate' },
  { x0: 19, z0: -22, x1: 21, z1: -20.5, h: 2.4, kind: 'crate' },
  { x0: 22, z0: -12, x1: 24, z1: -10, h: 1.2, kind: 'crate' },
  { x0: -5, z0: -2, x1: -3, z1: 0, h: 1.2, kind: 'crate' }, // mid cover
  { x0: 3, z0: 2, x1: 5, z1: 4, h: 1.2, kind: 'crate' }, // mid cover
  { x0: -24, z0: 4, x1: -22, z1: 6, h: 2.4, kind: 'crate' }, // long cover
  { x0: 22, z0: 4, x1: 24, z1: 6, h: 2.4, kind: 'crate' }, // short cover
  { x0: -10, z0: 14, x1: -8, z1: 16, h: 1.2, kind: 'crate' }, // spawn cover
  { x0: 8, z0: 14, x1: 10, z1: 16, h: 1.2, kind: 'crate' }, // spawn cover
];

export const SITES = {
  A: { x: -24, z: -19, r: 6, name: 'A · CRUSHER', color: PALETTE.siteA },
  B: { x: 24, z: -19, r: 6, name: 'B · SILOS', color: PALETTE.siteB },
};

export const SPAWNS = {
  // yaw follows the sim's forward (sin yaw, cos yaw): PI faces north (-z),
  // 0 faces south (+z). Vipers attack from the south, Jackals defend north.
  // Friendly bots spawn ahead of the player so the spawn view shows them.
  viper: [
    { x: 0, z: 20, yaw: Math.PI }, { x: -5, z: 16, yaw: Math.PI }, { x: 5, z: 16, yaw: Math.PI },
    { x: -10, z: 14, yaw: Math.PI }, { x: 10, z: 14, yaw: Math.PI },
  ],
  jackal: [
    { x: -24, z: -21, yaw: 0 }, { x: 24, z: -21, yaw: 0 },
    { x: -8, z: -21, yaw: 0 }, { x: 8, z: -21, yaw: 0 },
    { x: 0, z: -22, yaw: 0 },
  ],
};

// Waypoint graph the bots walk. Nodes are (x, z); edges are listed per node.
export const WAYPOINTS = [
  { x: 0, z: 18 }, // 0 spawn mid
  { x: 0, z: 10 }, // 1 mid
  { x: 0, z: 2 }, // 2 mid door
  { x: 0, z: -6 }, // 3 mid top
  { x: -20, z: 16 }, // 4 long entry
  { x: -24, z: 0 }, // 5 long mid
  { x: -24, z: -12 }, // 6 long to A
  { x: -24, z: -19 }, // 7 A site
  { x: 20, z: 16 }, // 8 short entry
  { x: 24, z: 0 }, // 9 short mid
  { x: 24, z: -12 }, // 10 short to B
  { x: 24, z: -19 }, // 11 B site
  { x: 12, z: -6 }, // 12 mid -> B
  { x: -12, z: -6 }, // 13 mid -> A
  { x: 0, z: -16 }, // 14 defender mid hold
  { x: -28, z: -10 }, // 15 A corner
  { x: 28, z: -10 }, // 16 B corner
];
export const EDGES = [
  [1, 4, 8], // 0
  [0, 2, 4, 8], // 1
  [1, 3], // 2
  [2, 12, 13, 14], // 3
  [0, 1, 5], // 4
  [4, 6, 15], // 5
  [5, 7, 13], // 6
  [6, 15], // 7
  [0, 1, 9], // 8
  [8, 10, 16], // 9
  [9, 11, 12], // 10
  [10, 16], // 11
  [3, 10], // 12
  [3, 6], // 13
  [3, 7, 11], // 14
  [5, 7], // 15
  [9, 11], // 16
];

// Breadth-first route between two waypoints. Writes node ids into `out`
// (preallocated by the caller) and returns the count. No allocation.
export function findRoute(from, to, out) {
  if (from === to) { out[0] = from; return 1; }
  const prev = findRoute._prev || (findRoute._prev = new Int16Array(WAYPOINTS.length));
  const queue = findRoute._queue || (findRoute._queue = new Int16Array(WAYPOINTS.length));
  prev.fill(-1);
  let head = 0, tail = 0;
  queue[tail++] = from;
  prev[from] = from;
  while (head < tail) {
    const cur = queue[head++];
    const edges = EDGES[cur];
    for (let i = 0; i < edges.length; i++) {
      const nxt = edges[i];
      if (prev[nxt] !== -1) continue;
      prev[nxt] = cur;
      if (nxt === to) {
        // walk back, reverse into out
        let n = 0;
        let node = to;
        while (node !== from) { out[n++] = node; node = prev[node]; }
        out[n++] = from;
        // reverse in place
        for (let a = 0, b = n - 1; a < b; a++, b--) {
          const tmp = out[a]; out[a] = out[b]; out[b] = tmp;
        }
        return n;
      }
      queue[tail++] = nxt;
    }
  }
  out[0] = from;
  return 1;
}

// Nearest waypoint to a position (x, z). No allocation.
export function nearestWaypoint(x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x, dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Circle (x, z, r) vs wall AABBs. Returns true when the circle overlaps a wall.
export function circleHitsWall(x, z, r) {
  for (let i = 0; i < WALLS.length; i++) {
    const w = WALLS[i];
    const cx = x < w.x0 ? w.x0 : x > w.x1 ? w.x1 : x;
    const cz = z < w.z0 ? w.z0 : z > w.z1 ? w.z1 : z;
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Move a circle against walls, axis by axis, so it slides along them.
// (x, z) is the position, (dx, dz) the wanted step, r the radius.
// Returns the new position in out {x, z}. No allocation.
export function moveCircle(x, z, dx, dz, r, out) {
  let nx = x + dx;
  if (!circleHitsWall(nx, z, r)) x = nx;
  let nz = z + dz;
  if (!circleHitsWall(x, nz, r)) z = nz;
  out.x = x;
  out.z = z;
}

// Segment (x0,y0,z0)-(x1,y1,z1) vs wall boxes: true when blocked.
// `eyeY`/`targetY` are heights; a crate only blocks below its height.
export function segmentBlocked(x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < WALLS.length; i++) {
    const w = WALLS[i];
    if (segmentHitsBox(x0, y0, z0, x1, y1, z1, w.x0, 0, w.z0, w.x1, w.h, w.z1)) return true;
  }
  return false;
}

// Slab test: does the segment hit the AABB [x0,y0,z0]-[x1,y1,z1]?
export function segmentHitsBox(x0, y0, z0, x1, y1, z1, bx0, by0, bz0, bx1, by1, bz1) {
  let tmin = 0, tmax = 1;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const axes = [
    [x0, dx, bx0, bx1], [y0, dy, by0, by1], [z0, dz, bz0, bz1],
  ];
  for (let a = 0; a < 3; a++) {
    const o = axes[a][0], d = axes[a][1], lo = axes[a][2], hi = axes[a][3];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Distance from (x, z) to a bombsite centre, and which site (if inside).
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < s.r * s.r) return key;
  }
  return null;
}
