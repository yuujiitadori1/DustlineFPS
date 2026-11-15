// palette.js — DUSTLINE's one chosen look: dusty quarry sand, rusted steel,
// teal hazard paint, warm low sun. Every material in the game draws from here.
export const PALETTE = {
  sky: 0xcfd8e6,
  fog: 0xd8c9a3,
  ground: 0xb59a68,
  groundDark: 0x8a744e,
  wall: 0x9c8a6d,
  wallDark: 0x6e6250,
  concrete: 0x7d7468,
  rust: 0x9a5a32,
  teal: 0x2e7f86,
  hazard: 0xd8a020,
  crate: 0x8a6f45,
  crateDark: 0x6b5636,
  siteA: 0x2f7fd0,
  siteB: 0xe07b2a,
  viper: 0x3fa7e0,
  jackal: 0xff8a2a,
  sun: 0xffe0b0,
  hemiSky: 0xbfd4e6,
  hemiGround: 0x8a744e,
};

export function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
