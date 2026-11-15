// weapons.js — every weapon and grenade in DUSTLINE: its numbers, its price,
// and what it does to spread and recoil. One job: data + pure helpers.
// Damage is per hit on the body; headshots multiply by 4.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SIDEARM', key: '1', price: 0,
    auto: false, rpm: 320, mag: 12, reserveMax: 36, reloadMs: 1400,
    damage: 26, headMult: 4, range: 40,
    spreadBase: 0.011, spreadMove: 0.030, spreadAir: 0.02, bloom: 0.006,
    recoilPitch: 0.011, recoilYaw: 0.004, kick: 0.012,
    tracer: 0xffe9a8,
  },
  smg: {
    id: 'smg', name: 'VK-9 RIPPER', key: '2', price: 1500,
    auto: true, rpm: 800, mag: 28, reserveMax: 84, reloadMs: 1900,
    damage: 22, headMult: 4, range: 32,
    spreadBase: 0.016, spreadMove: 0.034, spreadAir: 0.022, bloom: 0.007,
    recoilPitch: 0.008, recoilYaw: 0.006, kick: 0.010,
    tracer: 0xffd27a,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 LONGSHOT', key: '3', price: 2700,
    auto: true, rpm: 600, mag: 25, reserveMax: 75, reloadMs: 2400,
    damage: 34, headMult: 4, range: 55,
    spreadBase: 0.008, spreadMove: 0.038, spreadAir: 0.024, bloom: 0.008,
    recoilPitch: 0.014, recoilYaw: 0.005, kick: 0.016,
    tracer: 0xfff2c0,
  },
};

export const GRENADES = {
  frag: {
    id: 'frag', name: 'M67 FRAG', key: '4', price: 300,
    fuseMs: 2200, radius: 8, maxDamage: 110, throwSpeed: 17,
  },
  smoke: {
    id: 'smoke', name: 'SG-2 SMOKE', key: '5', price: 300,
    fuseMs: 1400, radius: 4.5, lifeMs: 15000, throwSpeed: 15,
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 50;

// Spread (radians) for a shot: base + moving + airborne + bloom from
// consecutive shots. Standing still and firing slowly is accurate;
// running and spraying is not — stopping to aim pays.
export function currentSpread(weapon, moving, airborne, bloomShots) {
  let s = weapon.spreadBase;
  if (moving) s += weapon.spreadMove;
  if (airborne) s += weapon.spreadAir;
  s += weapon.bloom * Math.min(bloomShots, 10);
  return s;
}
