// input.js — keyboard + mouse, pointer lock. One job: turn browser events
// into a plain input snapshot the simulation reads each tick.
// The game never needs a click to render: pointer lock engages on click,
// but the scene, HUD and bots are visible from load.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    fwd: 0, strafe: 0, run: false, crouch: false,
    lookDX: 0, lookDY: 0,
    firing: false, firePressed: false,
    reload: false, select: null, cycle: 0,
    plant: false, buyToggle: false, buyItem: null,
    scoreboard: false,
    locked: false,
  };
  let mouseDown = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyR') input.reload = true;
    if (e.code === 'KeyB') input.buyToggle = true;
    if (e.code === 'Digit1') input.select = 'pistol';
    if (e.code === 'Digit2') input.select = 'smg';
    if (e.code === 'Digit3') input.select = 'rifle';
    if (e.code === 'Digit4') input.select = 'frag';
    if (e.code === 'Digit5') input.select = 'smoke';
    if (e.code === 'Tab') { input.scoreboard = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Tab') input.scoreboard = false;
  });
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; input.firing = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    input.firing = true;
    input.firePressed = true;
    if (!input.locked) {
      try { canvas.requestPointerLock(); } catch (err) { /* headless: ignore */ }
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    mouseDown = false;
    input.firing = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX * 0.0022;
    input.lookDY += e.movementY * 0.0022;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) { mouseDown = false; input.firing = false; }
  });
  canvas.addEventListener('wheel', (e) => {
    input.cycle = e.deltaY > 0 ? 1 : -1;
  }, { passive: true });

  // Recompute held-key state into the snapshot. Called once per sim tick.
  input.poll = () => {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
      - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
      - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    input.fwd = f;
    input.strafe = s;
    input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    input.crouch = keys.has('KeyC') || keys.has('ControlLeft');
    input.plant = keys.has('KeyE');
  };

  // Edges are consumed after each sim tick so they fire once.
  input.consumeEdges = () => {
    input.lookDX = 0;
    input.lookDY = 0;
    input.firePressed = false;
    input.reload = false;
    input.select = null;
    input.cycle = 0;
    input.buyToggle = false;
    input.buyItem = null;
  };

  return input;
}
