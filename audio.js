// audio.js — procedural sound, no audio files: every effect is a small
// WebAudio graph built on the fly. Silent (but never crashing) when the
// browser has no AudioContext, e.g. headless screenshots.
let ctx = null;
let master = null;

function ac() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// A short burst of filtered noise (gunshots, explosions).
function noiseBurst(dur, filterFreq, gain, type = 'lowpass') {
  const c = ac();
  if (!c) return;
  try {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  } catch (e) { /* never break the game for sound */ }
}

// A short oscillator blip (beeps, ticks, clicks).
function blip(freq, dur, gain, type = 'square', slideTo = 0) {
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(c.currentTime + dur);
  } catch (e) { /* never break the game for sound */ }
}

export const sfx = {
  shot(weaponId) {
    if (weaponId === 'rifle') { noiseBurst(0.14, 900, 0.9); blip(160, 0.08, 0.25, 'sawtooth', 60); }
    else if (weaponId === 'smg') { noiseBurst(0.09, 1400, 0.6); blip(220, 0.05, 0.15, 'sawtooth', 90); }
    else { noiseBurst(0.1, 1100, 0.7); blip(180, 0.06, 0.2, 'sawtooth', 70); }
  },
  enemyShot(dist) {
    const g = Math.max(0.08, 0.5 - dist * 0.012);
    noiseBurst(0.1, 800, g);
  },
  hit() { blip(1400, 0.05, 0.25, 'square'); },
  kill() { blip(900, 0.09, 0.3, 'square'); blip(1350, 0.12, 0.25, 'square'); },
  hurt() { noiseBurst(0.12, 300, 0.5); },
  reload() { blip(500, 0.05, 0.2, 'square'); setTimeout(() => blip(700, 0.05, 0.2, 'square'), 220); },
  dryFire() { blip(300, 0.04, 0.15, 'square'); },
  throwPin() { blip(600, 0.04, 0.15, 'square'); },
  explosion() { noiseBurst(0.7, 220, 1.0); blip(90, 0.6, 0.5, 'sine', 30); },
  plantBeep() { blip(1100, 0.07, 0.25, 'square'); },
  planted() { blip(700, 0.2, 0.3, 'square', 350); },
  defuseBeep() { blip(1500, 0.06, 0.2, 'square'); },
  roundWin() { blip(523, 0.15, 0.25, 'square'); setTimeout(() => blip(784, 0.25, 0.25, 'square'), 150); },
  roundLose() { blip(392, 0.2, 0.25, 'square'); setTimeout(() => blip(262, 0.35, 0.25, 'square'), 200); },
  buy() { blip(880, 0.06, 0.2, 'square'); setTimeout(() => blip(1174, 0.08, 0.2, 'square'), 70); },
  denied() { blip(200, 0.15, 0.25, 'square'); },
};
