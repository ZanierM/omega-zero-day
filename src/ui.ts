import {
  BUILDINGS, UNITS, UPGRADES, NON_BUILDABLE, PLAYER, Tab, TAB_NAMES, UNIT_ARMOR, UNIT_DMGTYPE, VET_NAME,
} from './config';
import {
  players, powerOf, hasBuilding, startProduction, cancelProduction, queuedCount, prereqMet,
  gameOver, toastMsg, toast, byId, upgradeBuilding, buildingUpgradeCost, Building, requirementText,
  Unit, deployPioneer, startRepair, repairCost, superReady, novaTotal, novaLeft,
  enemyStrikeETA, starvedHarvesters, stats, activateAbility, abilityOn,
} from './game';
import { selection, startPlacement, placement, cancelPlacement, setOnBuildingPlaced, startStrikeTargeting } from './input';
import { sfx, duckMusic } from './audio';
import { defenceIconUrl, bakeAirSprite, artIconUrl } from './render';

const creditsEl = document.getElementById('credits')!;
const powerFill = document.getElementById('powerfill')!;
const powerText = document.getElementById('powertext')!;
const grid = document.getElementById('buildgrid')!;
const tabsBar = document.getElementById('tabsbar')!;
const selInfo = document.getElementById('selinfo')!;
const countdown = document.getElementById('countdown')!;
const cdTime = document.getElementById('cdtime')!;
const enemySw = document.getElementById('enemysw')!;
const idleBtn = document.getElementById('idlebtn')!;
const idleCount = document.getElementById('idlecount')!;
const overlayStats = document.getElementById('overlaystats')!;
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const upgBtn = document.getElementById('upgbtn') as HTMLButtonElement;
const actBtn = document.getElementById('actbtn') as HTMLButtonElement;
const abilBtn = document.getElementById('abilbtn') as HTMLButtonElement;
const overlay = document.getElementById('overlay')!;
const overlayTitle = document.getElementById('overlaytitle')!;
const overlaySub = document.getElementById('overlaysub')!;
const toastEl = document.getElementById('toast')!;
const buildTip = document.getElementById('buildtip')!;
let shownSelection = '';

let activeTab: Tab = 'build';
let shownCredits = 0;

interface Btn { el: HTMLElement, defId: string, tab: Tab, prog: HTMLElement, count: HTMLElement }
const btns: Btn[] = [];

const CATEGORIES: Tab[] = ['build', 'def', 'inf', 'veh', 'ups'];

// inline SVG icons for the research tab: crosshair / shield / defence grid
function upgradeSvg(defId: string): string {
  const stroke = defId.startsWith('wpn') ? '#ff9d5c' : defId.startsWith('arm') ? '#7fd4ff' : '#c88bff';
  const tier = 'ⅠⅡⅢ'[Number(defId.slice(-1)) - 1] ?? '';
  let art = '';
  if (defId.startsWith('wpn')) {
    art = `<circle cx="24" cy="22" r="12" fill="none" stroke="${stroke}" stroke-width="2.5"/>
           <circle cx="24" cy="22" r="3.5" fill="${stroke}"/>
           <path d="M24 4v9M24 31v9M6 22h9M33 22h9" stroke="${stroke}" stroke-width="2.5"/>`;
  } else if (defId.startsWith('arm')) {
    art = `<path d="M24 5l14 5v11c0 9-6 15-14 19-8-4-14-10-14-19V10z" fill="none" stroke="${stroke}" stroke-width="2.5"/>
           <path d="M24 12v18M17 20h14" stroke="${stroke}" stroke-width="2"/>`;
  } else {
    art = `<path d="M10 38h28M16 38V22h16v16M24 22V12" stroke="${stroke}" stroke-width="2.5" fill="none"/>
           <circle cx="24" cy="9" r="4" fill="none" stroke="${stroke}" stroke-width="2.5"/>
           <path d="M13 14a15 15 0 0 1 22 0" stroke="${stroke}" stroke-width="2" fill="none" opacity="0.6"/>`;
  }
  return `<svg viewBox="0 0 48 48" width="52" height="52">${art}
    <text x="42" y="46" font-size="13" font-weight="bold" fill="${stroke}" text-anchor="end">${tier}</text></svg>`;
}

// icon markup for a def, baked once: a freshly baked data-URL image stalls the
// next frame for up to a second while it decodes, so tab switches reuse them
const iconCache = new Map<string, string>();
function iconHtml(tab: Tab, defId: string): string {
  const key = tab + ':' + defId;
  let html = iconCache.get(key);
  if (html === undefined) { html = bakeIconHtml(tab, defId); iconCache.set(key, html); }
  return html;
}

function bakeIconHtml(tab: Tab, defId: string): string {
  if (tab === 'ups') return upgradeSvg(defId);
  if (tab === 'inf' || tab === 'veh') {
    const d = UNITS[defId];
    if (d.air) return `<img src="${bakeAirSprite(defId, PLAYER).toDataURL()}" alt="">`;
    return `<img src="sprites/u_${d.model}${d.mstep}_s.png" alt="">`;
  }
  const art = artIconUrl(defId);
  if (art) return `<img src="${art}" alt="">`;
  const s = BUILDINGS[defId]?.sprite;
  if (s) return `<img src="sprites/${s}_1.png" alt="">`;
  return `<img src="${defenceIconUrl(defId)}" alt="">`; // turret / wall: baked art
}

const tabBtns = new Map<Tab, HTMLButtonElement>();

export function initUI() {
  for (const t of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'htab' + (t === activeTab ? ' active' : '');
    b.textContent = TAB_NAMES[t];
    b.addEventListener('click', () => {
      activeTab = t;
      tabBtns.forEach((btn, tab) => btn.classList.toggle('active', tab === t));
      rebuildGrid();
      sfx('click');
    });
    tabsBar.appendChild(b);
    tabBtns.set(t, b);
  }
  setOnBuildingPlaced(() => {
    // clear the placed (ready) item from whichever construction queue holds it
    for (const tab of ['build', 'def'] as const) {
      const q = players[PLAYER].queues[tab];
      if (q[0]?.ready) { q.shift(); return; }
    }
  });
  upgBtn.addEventListener('pointerdown', () => {
    const b = selectedOwnBuilding();
    if (b) upgradeBuilding(b);
  });
  actBtn.addEventListener('pointerdown', () => {
    const u = selectedOwnPioneer();
    if (u) { deployPioneer(u); return; }
    const b = selectedOwnBuilding();
    if (!b) return;
    if (b.def.superweapon && superReady(b)) { startStrikeTargeting(b.id); sfx('click'); return; }
    startRepair(b);
  });
  abilBtn.addEventListener('pointerdown', () => { for (const u of abilityUnits()) activateAbility(u); });
  rebuildGrid();
}

function defsFor(tab: Tab) {
  if (tab === 'ups') return Object.values(UPGRADES);
  if (tab === 'inf' || tab === 'veh') return Object.values(UNITS).filter(d => d.tab === tab);
  return Object.values(BUILDINGS).filter(d => d.tab === tab && !NON_BUILDABLE.has(d.id));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function tipDescription(desc: string) {
  return escapeHtml(desc).replace(/\b(flux crystal|hover tank|power|damage|armor|range|repair|harvest|deploy|orbital|turret|infantry|vehicles|shield|cannon)\b/gi, '<mark>$&</mark>');
}
function showTip(el: HTMLElement, name: string, desc: string, cost: number) {
  if (!desc) return;
  buildTip.innerHTML = `<strong>${escapeHtml(name)}</strong><div>${tipDescription(desc)}</div><div class="tipcost">◈ ${cost.toLocaleString()} flux</div>`;
  const r = el.getBoundingClientRect();
  const above = r.top > 150;
  buildTip.style.left = `${Math.max(10, Math.min(innerWidth - 270, r.left))}px`;
  buildTip.style.top = above ? 'auto' : `${r.bottom + 10}px`;
  buildTip.style.bottom = above ? `${innerHeight - r.top + 10}px` : 'auto';
  buildTip.style.display = 'block';
}
function hideTip() { buildTip.style.display = 'none'; }

function rebuildGrid() {
  hideTip();
  grid.innerHTML = '';
  btns.length = 0;
  for (const def of defsFor(activeTab)) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bbtn';
    const desc = (def as any).desc ?? '';
    el.setAttribute('aria-label', `${def.name}, ${def.cost} flux. ${desc}`);
    el.innerHTML = `${iconHtml(activeTab, def.id)}<span class="nm">${def.name}</span><span class="cost"><span class="resource-gem" aria-hidden="true">◈</span>${def.cost}</span><span class="prog"></span><span class="count"></span>`;
    let held = false;
    let timer = 0;
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(el, def.name, desc, def.cost); });
    el.addEventListener('pointerleave', () => { clearTimeout(timer); hideTip(); });
    el.addEventListener('focus', () => showTip(el, def.name, desc, def.cost));
    el.addEventListener('blur', hideTip);
    el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') timer = window.setTimeout(() => { held = true; showTip(el, def.name, desc, def.cost); }, 450); });
    el.addEventListener('pointerup', () => clearTimeout(timer));
    el.addEventListener('pointercancel', () => { clearTimeout(timer); hideTip(); });
    el.addEventListener('click', () => { if (held) { held = false; return; } hideTip(); onBtnClick(def.id); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); cancelOne(def.id); });
    grid.appendChild(el);
    btns.push({
      el, defId: def.id, tab: activeTab,
      prog: el.querySelector('.prog') as HTMLElement,
      count: el.querySelector('.count') as HTMLElement,
    });
  }
}

function onBtnClick(defId: string) {
  const p = players[PLAYER];
  const q = p.queues[activeTab];
  // a finished building waiting for placement: clicking its button starts placing
  if (q[0]?.defId === defId && q[0].ready) {
    startPlacement(defId);
    sfx('click');
    return;
  }
  // buildings: clicking a queued (not yet started) item removes it again — toggle.
  // units: every click queues one more; right-click removes.
  if ((activeTab === 'build' || activeTab === 'def') && !BUILDINGS[defId]?.isWall) {
    const queuedBehindHead = q.slice(1).some(item => item.defId === defId);
    if (queuedBehindHead) {
      cancelOne(defId, true);
      return;
    }
  }
  if (startProduction(PLAYER, defId, activeTab)) {
    sfx('click');
  } else {
    // never fail silently: explain what's missing
    const reason = requirementText(PLAYER, activeTab, defId);
    if (reason) { toast(reason); sfx('error'); }
  }
}

function cancelOne(defId: string, tailOnly = false) {
  const p = players[PLAYER];
  const q = p.queues[activeTab];
  if (!q.some(item => item.defId === defId)) return;
  if (tailOnly && !(q.slice(1).some(i => i.defId === defId))) return;
  if (placement?.defId === defId && q[0]?.defId === defId && q[0].ready) cancelPlacement();
  cancelProduction(PLAYER, activeTab, defId);
}

function selectedOwnBuilding(): Building | null {
  if (selection.size !== 1) return null;
  const e = byId.get([...selection][0]);
  if (e?.kind === 'building' && e.owner === PLAYER) return e;
  return null;
}

function selectedOwnPioneer(): Unit | null {
  if (selection.size !== 1) return null;
  const e = byId.get([...selection][0]);
  if (e?.kind === 'unit' && e.owner === PLAYER && e.def.deploysTo) return e;
  return null;
}

// selected player units that share an ability (the button acts on all of them)
function abilityUnits(): Unit[] {
  const out: Unit[] = [];
  for (const id of selection) {
    const e = byId.get(id);
    if (e?.kind === 'unit' && e.owner === PLAYER && e.def.ability) out.push(e);
  }
  return out;
}

export function updateUI() {
  const p = players[PLAYER];
  // smooth credit ticker, RA2-style
  shownCredits += (p.credits - shownCredits) * 0.2;
  if (Math.abs(shownCredits - p.credits) < 1) shownCredits = p.credits;
  creditsEl.textContent = '◈ ' + Math.round(shownCredits).toLocaleString();

  const pw = powerOf(PLAYER);
  const frac = pw.supply > 0 ? Math.min(1, pw.drain / pw.supply) : (pw.drain > 0 ? 1 : 0);
  powerFill.style.width = pw.low ? '100%' : `${Math.max(4, 100 - frac * 100)}%`;
  powerFill.className = pw.low ? 'low' : '';
  powerText.textContent = pw.low ? `${pw.drain - pw.supply} over — slowed` : `${pw.supply - pw.drain} spare`;

  // supernova countdown
  if (novaTotal > 0) {
    countdown.style.display = 'flex';
    const s = Math.max(0, Math.ceil(novaLeft));
    cdTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    countdown.classList.toggle('warn', novaLeft < novaTotal / 3);
  } else {
    countdown.style.display = 'none';
  }

  // enemy orbital-strike dread banner (RA2-style visible countdown)
  const eta = enemyStrikeETA();
  if (eta !== Infinity && !gameOver) {
    enemySw.classList.add('show');
    enemySw.classList.toggle('imminent', eta <= 0);
    enemySw.textContent = eta <= 0 ? '⚠ Hostile orbital strike ready' : `⚠ Hostile orbital strike — ${fmtTime(eta)}`;
  } else {
    enemySw.classList.remove('show', 'imminent');
  }

  // idle-harvester warning button
  const idle = starvedHarvesters().length;
  idleBtn.classList.toggle('show', idle > 0 && !gameOver);
  if (idle > 0) idleCount.textContent = String(idle);

  // research tab dims until a Laboratory exists
  const upsTab = tabBtns.get('ups');
  if (upsTab) upsTab.classList.toggle('locked', !hasBuilding(PLAYER, 'lab'));

  for (const b of btns) {
    const q = p.queues[b.tab];
    const researched = b.tab === 'ups' && p.upgrades.has(b.defId);
    const locked = !researched && !prereqMet(PLAYER, b.tab, b.defId) && !q.some(i => i.defId === b.defId);
    b.el.classList.toggle('locked', locked);
    b.el.classList.toggle('done', researched);

    const n = queuedCount(PLAYER, b.tab, b.defId);
    b.count.style.display = n > 1 || (n === 1 && q[0]?.defId !== b.defId) ? 'block' : 'none';
    b.count.textContent = 'x' + n;

    const head = q[0];
    const mine = head?.defId === b.defId;
    b.el.classList.toggle('ready', !!(mine && head!.ready));
    b.prog.style.width = mine && !head!.ready ? `${(1 - head!.remaining / head!.total) * 100}%` : '0%';
  }

  // unit ability button (Q) — reflects toggle / cooldown / ready
  const au = abilityUnits();
  if (au.length) {
    const u = au[0], ab = u.def.ability!;
    abilBtn.style.visibility = 'visible';
    if (ab.kind === 'toggle') {
      const on = abilityOn(u);
      abilBtn.classList.toggle('on', on);
      abilBtn.textContent = `${on ? '◆' : '◇'} ${ab.name} [Q]`;
      abilBtn.disabled = false;
    } else {
      abilBtn.classList.remove('on');
      if (u.abilityTimer > 0) { abilBtn.textContent = `${ab.name} active`; abilBtn.disabled = true; }
      else if (u.abilityCd > 0) { abilBtn.textContent = `${ab.name} ${Math.ceil(u.abilityCd)}s`; abilBtn.disabled = true; }
      else { abilBtn.textContent = `⚡ ${ab.name} [Q]`; abilBtn.disabled = false; }
    }
  } else {
    abilBtn.style.visibility = 'hidden';
    abilBtn.classList.remove('on');
  }

  // selection info + building upgrade button
  const ob = selectedOwnBuilding();
  if (ob && ob.def.upgradable && (ob.level < 3 || ob.upgrading)) {
    upgBtn.style.visibility = 'visible';
    if (ob.upgrading) {
      const pct = Math.round((1 - ob.upgrading.remaining / ob.upgrading.total) * 100);
      upgBtn.textContent = `Upgrading… ${pct}%`;
      upgBtn.disabled = true;
    } else {
      upgBtn.textContent = `⬆ Upgrade to Lv ${ob.level + 1} — ◈${buildingUpgradeCost(ob)}`;
      upgBtn.disabled = false;
    }
  } else {
    upgBtn.style.visibility = 'hidden';
  }

  // contextual action button: deploy Pioneer · orbital strike · repair
  const pio = selectedOwnPioneer();
  if (pio) {
    actBtn.style.visibility = 'visible';
    actBtn.textContent = '▼ Deploy command post';
    actBtn.disabled = false;
  } else if (ob && ob.def.superweapon) {
    actBtn.style.visibility = 'visible';
    if (superReady(ob)) { actBtn.textContent = '⊕ Launch orbital strike'; actBtn.disabled = false; }
    else { actBtn.textContent = `Charging… ${Math.round((1 - ob.charge / ob.def.superweapon.charge) * 100)}%`; actBtn.disabled = true; }
  } else if (ob && ob.hp < ob.maxHp) {
    actBtn.style.visibility = 'visible';
    if (ob.repairing) { actBtn.textContent = 'Repairing…'; actBtn.disabled = true; }
    else { actBtn.textContent = `🔧 Repair — ◈${repairCost(ob)}`; actBtn.disabled = false; }
  } else {
    actBtn.style.visibility = 'hidden';
  }

  if (selection.size > 0) {
    const first = byId.get([...selection][0]);
    if (first) {
      const name = first.def.name;
      let lvl = first.kind === 'building' && first.level > 1 ? ` <span style="color:#e8c66a">Lv ${first.level}</span>` : '';
      if (first.kind === 'unit' && first.rank > 0) lvl += ` <span style="color:#e8c66a">${'★'.repeat(first.rank)} ${VET_NAME[first.rank]}</span>`;
      const hp = `${Math.ceil(first.hp)} / ${first.maxHp} HP`;
      // combat profile: weapon type + armor class (rock-paper-scissors hint)
      let combat = '';
      if (first.kind === 'unit') {
        const w = UNIT_DMGTYPE[first.def.id], a = UNIT_ARMOR[first.def.id] ?? 'infantry';
        const parts = [];
        if (w) parts.push(`⚔ ${w}`);
        parts.push(`🛡 ${a}`);
        combat = `<br><span style="color:#c9b48a;font-size:0.9em">${parts.join(' · ')}</span>`;
      }
      const html = selection.size === 1
        ? `<b>${name}</b>${lvl} — ${hp}${combat}<br><i>${(first.def as any).desc ?? ''}</i>`
        : `<b>${selection.size} units selected</b><br>${name} +${selection.size - 1} more`;
      if (html !== shownSelection) { selInfo.innerHTML = html; shownSelection = html; }
    }
  } else {
    const html = '<b>Awaiting orders</b><br>Select a unit or building.';
    if (html !== shownSelection) { selInfo.innerHTML = html; shownSelection = html; }
  }

  // toast
  toastEl.textContent = toastMsg.text;
  toastEl.style.opacity = toastMsg.ttl > 0 ? '1' : '0';

  // game over
  if (gameOver) {
    if (overlay.style.display !== 'flex') duckMusic();
    overlay.style.display = 'flex';
    overlay.className = gameOver;
    const novaExpired = novaTotal > 0 && novaLeft <= 0;
    overlayTitle.textContent = gameOver === 'win' ? 'Victory' : novaExpired ? 'Supernova' : 'Defeat';
    overlaySub.textContent = gameOver === 'win'
      ? 'The launch corridor is clear. The ark-fleet jumps at dawn — humanity survives.'
      : novaExpired
      ? 'Helios detonated with the enemy still standing. The fleet burns. There is no dawn.'
      : 'Vanguard command has fallen. The fleet dies in orbit, and humanity with the sun.';
    if (!overlayStats.childElementCount) {
      const rows: [string, string][] = [
        ['Time', fmtTime(stats.time)],
        ['Flux mined', `◈ ${Math.round(stats.flux).toLocaleString()}`],
        ['Units built', String(stats.built)],
        ['Units lost', String(stats.lost)],
        ['Enemies killed', String(stats.killed)],
        ['Structures razed', String(stats.razed)],
        ['Orbital strikes', String(stats.strikes)],
      ];
      overlayStats.innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
    }
  }
}
