// hud.js — the HUD: every DOM element the player sees, updated from state.
// One job: show health, ammo, timer, score, money, alive counts, objective,
// crosshair spread, hitmarker, kill feed, round banners, buy menu, scoreboard.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';
import { aliveCount } from './sim.js';

const $ = (id) => document.getElementById(id);

export function createHud(state, onBuy) {
  const el = {
    timer: $('timer'), score: $('score'), roundLabel: $('roundLabel'),
    objective: $('objective'), alive: $('alive'), money: $('money'),
    killfeed: $('killfeed'), healthNum: $('healthNum'), healthBar: $('healthBar'),
    armorLine: $('armorLine'), ammoNum: $('ammoNum'), weaponName: $('weaponName'),
    cross: $('cross'), hitmark: $('hitmark'), banner: $('banner'),
    bannerBig: document.querySelector('#banner .big'),
    bannerSub: document.querySelector('#banner .sub'),
    plantBar: $('plantBar'), plantFill: $('plantFill'),
    plantLabel: document.querySelector('#plantBar .lbl'),
    clickHint: $('clickHint'), buy: $('buy'), buyItems: $('buyItems'),
    board: $('board'), boardTable: $('boardTable'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastHealth = -1;

  const BUY_CATALOG = [
    { id: 'rifle', key: '3', name: 'AR-77 LONGSHOT', desc: '25-round rifle · high damage · accurate', price: WEAPONS.rifle.price },
    { id: 'smg', key: '2', name: 'VK-9 RIPPER', desc: '28-round SMG · fast fire · close range', price: WEAPONS.smg.price },
    { id: 'frag', key: '4', name: 'M67 FRAG', desc: 'Explodes after 2.2 s · 8 m blast', price: GRENADES.frag.price },
    { id: 'smoke', key: '5', name: 'SG-2 SMOKE', desc: '15 s smoke wall · blocks sight', price: GRENADES.smoke.price },
    { id: 'armor', key: '6', name: 'KEVLAR VEST', desc: '50 armor · absorbs half of all damage', price: ARMOR_PRICE },
    { id: 'ammo', key: '7', name: 'RESERVE AMMO', desc: 'Refill reserve ammo for the current weapon', price: 200 },
  ];

  function buildBuyMenu() {
    el.buyItems.innerHTML = '';
    for (const item of BUY_CATALOG) {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<span><span class="k">[${item.key}]</span><b>${item.name}</b><br><span class="d">${item.desc}</span></span><span class="p">$${item.price}</span>`;
      div.addEventListener('click', () => onBuy(item.id));
      el.buyItems.appendChild(div);
    }
  }
  buildBuyMenu();

  function showBanner(big, sub, seconds) {
    el.bannerBig.textContent = big;
    el.bannerSub.textContent = sub;
    el.banner.style.display = 'block';
    bannerTimer = seconds;
  }

  function addKill(killer, victim, weapon, headshot) {
    const div = document.createElement('div');
    const wn = weapon === 'frag' ? '💥' : (WEAPONS[weapon] ? WEAPONS[weapon].name : weapon);
    div.innerHTML = `<b style="color:${killer.team === 'viper' ? '#3fa7e0' : '#ff8a2a'}">${killer.name}</b> ${headshot ? '◉ ' : ''}${wn} <b style="color:${victim.team === 'viper' ? '#3fa7e0' : '#ff8a2a'}">${victim.name}</b>`;
    el.killfeed.prepend(div);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 8000);
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function update(dt) {
    const p = state.player;
    // timer / score / round
    el.timer.textContent = state.phase === 'live' ? fmtTime(state.phaseT)
      : state.phase === 'buy' ? 'BUY ' + fmtTime(state.phaseT)
      : state.phase === 'end' ? '—' : fmtTime(state.phaseT);
    el.score.innerHTML = `<span class="v">VIPERS ${state.score.viper}</span> — <span class="j">${state.score.jackal} JACKALS</span>`;
    el.roundLabel.textContent = state.matchWinner
      ? (state.matchWinner === 'viper' ? 'VIPERS WIN THE MATCH' : 'JACKALS WIN THE MATCH')
      : `ROUND ${state.round} · FIRST TO 5`;
    // objective line
    if (state.bomb.planted) {
      el.objective.textContent = `💣 CHARGE PLANTED AT SITE ${state.bomb.site} — ${Math.ceil(state.bomb.fuse)}s`;
      el.objective.style.color = '#ff8a6a';
    } else if (state.bomb.carrier === p && p.alive) {
      el.objective.textContent = 'YOU CARRY THE CHARGE — plant at Site A or Site B (hold E)';
      el.objective.style.color = '#ffd27a';
    } else if (state.bomb.dropped) {
      el.objective.textContent = 'CHARGE DROPPED — a teammate must pick it up';
      el.objective.style.color = '#ffd27a';
    } else {
      el.objective.textContent = 'Plant the charge at Site A or Site B';
      el.objective.style.color = '#ffd27a';
    }
    // alive counts
    const v = aliveCount(state, 'viper'), j = aliveCount(state, 'jackal');
    el.alive.innerHTML = `<span class="v">VIPERS ${'●'.repeat(v)}${'○'.repeat(5 - v)}</span><br><span class="j">JACKALS ${'●'.repeat(j)}${'○'.repeat(5 - j)}</span>`;
    // money
    el.money.textContent = '$' + p.money;
    // health
    if (p.hp !== lastHealth) {
      el.healthNum.textContent = Math.max(0, Math.ceil(p.hp));
      el.healthBar.style.width = Math.max(0, p.hp) + '%';
      el.healthBar.style.background = p.hp > 50 ? '#7dd069' : p.hp > 25 ? '#e8c85a' : '#e05a4e';
      lastHealth = p.hp;
    }
    el.armorLine.textContent = 'ARMOR ' + Math.ceil(p.armor);
    // ammo / weapon
    const w = WEAPONS[p.current];
    if (w) {
      const slot = p.weapons[p.current];
      el.ammoNum.innerHTML = `${slot.mag} <span class="res">/ ${slot.reserve}</span>`;
      el.weaponName.textContent = w.name + (state.time < p.reloadUntil ? ' · RELOADING…' : '');
    } else {
      const g = GRENADES[p.current];
      el.ammoNum.innerHTML = `${p.grenades[p.current]} <span class="res">/ ${p.grenades[p.current]}</span>`;
      el.weaponName.textContent = g.name + ' · CLICK TO THROW';
    }
    // crosshair spread follows movement + bloom
    const spreadPx = 5 + p.speed * 1.6 + p.bloom * 1.1 + (p.crouch ? -1.5 : 0);
    el.cross.style.setProperty('--gap', Math.max(3, spreadPx) + 'px');
    // hitmarker fade
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) el.hitmark.style.opacity = '0';
    }
    // banner fade
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) el.banner.style.display = 'none';
    }
    // plant / defuse progress
    if (p.planting) {
      el.plantBar.style.display = 'block';
      el.plantLabel.textContent = 'PLANTING THE CHARGE…';
      el.plantFill.style.width = (p.plantProgress * 100) + '%';
    } else if (p.defusing) {
      el.plantBar.style.display = 'block';
      el.plantLabel.textContent = 'DEFUSING…';
      el.plantFill.style.width = (p.defuseProgress * 100) + '%';
    } else {
      el.plantBar.style.display = 'none';
    }
    // buy menu visibility is driven by main.js; refresh owned state
    const items = el.buyItems.children;
    for (let i = 0; i < items.length; i++) {
      const item = BUY_CATALOG[i];
      const owned = (WEAPONS[item.id] && p.weapons[item.id].owned)
        || (GRENADES[item.id] && p.grenades[item.id] >= 2)
        || (item.id === 'armor' && p.armor > 0);
      items[i].classList.toggle('owned', !!owned);
    }
  }

  function showScoreboard(show) {
    if (!show) { el.board.style.display = 'none'; return; }
    const rows = [['', 'K', 'D']];
    for (const a of state.agents) {
      rows.push([a.name + (a.isPlayer ? ' (YOU)' : ''), a.kills, a.deaths]);
    }
    let html = '<tr><th>Player</th><th>K</th><th>D</th></tr>';
    for (let i = 1; i < rows.length; i++) {
      const a = state.agents[i - 1];
      html += `<tr class="${a.team === 'viper' ? 'v' : 'j'}"><td>${rows[i][0]}</td><td>${rows[i][1]}</td><td>${rows[i][2]}</td></tr>`;
    }
    el.boardTable.innerHTML = html;
    el.board.style.display = 'block';
  }

  return {
    update,
    showBanner,
    addKill,
    flashHit(kill) {
      el.hitmark.className = kill ? 'kill' : '';
      el.hitmark.style.opacity = '1';
      hitTimer = 0.25;
    },
    setBuyVisible(v) { el.buy.style.display = v ? 'block' : 'none'; },
    setClickHint(v) { el.clickHint.style.display = v ? 'block' : 'none'; },
    showScoreboard,
  };
}
