# DUSTLINE — Tactical FPS

[![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/yuujiitadori1/DustlineFPS/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/yuujiitadori1/DustlineFPS/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the browser: five Vipers against five Jackals
in a dusty industrial quarry, two bombsites, money between rounds, and
gunfire where stopping to aim pays. Plant the charge at Crusher (A) or the
Silos (B), or eliminate the other team. Bots run routes, hold angles, react
to what they see and hear, plant and defuse.

- First-person mouse look (pointer lock) + WASD, shift to run, C to crouch
- Rifle, SMG and pistol, plus frag and smoke grenades; recoil, spread and
  headshots (4x) — spraying on the move is punished
- Buy menu between rounds (B), economy from kills and round wins
- Fixed-step simulation apart from rendering; modules with one job each

## Run it

```sh
npx serve game
# or: python3 -m http.server --directory game 8080
```

Open http://localhost:8080 — the scene, HUD and bots render immediately.
Click to lock the pointer and play.

## Layout

- `main.ts` — entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `game/index.html` — page, HUD, import map for three.js
- `game/src/main.js` — bootstrap + fixed-step loop
- `game/src/sim.js` — the simulation: rounds, economy, bomb, grenades (one state object)
- `game/src/bots.js` — bot AI: routes, holds, vision, hearing, plant/defuse
- `game/src/combat.js` — hitscan, headshots, damage, line of sight
- `game/src/world.js` — the Quarry map, collision, waypoint graph
- `game/src/render.js` — three.js scene, viewmodel, tracers, smoke
- `game/src/hud.js` — HUD, buy menu, kill feed, scoreboard
- `game/src/input.js` — keyboard + mouse, pointer lock
- `game/src/weapons.js` — weapon and grenade data
- `game/src/audio.js` — procedural WebAudio effects, no audio files
- `game/vendor/three/` — three.js 0.187.0, vendored from npm

Entered on [make.fun](https://make.fun/?ref=08hb5yc1&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards
