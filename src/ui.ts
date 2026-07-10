import {
  BUILDINGS, UNITS, UPGRADES, NON_BUILDABLE, PLAYER, Tab, TAB_NAMES,
} from './config';
import {
  players, powerOf, hasBuilding, startProduction, cancelProduction, queuedCount, prereqMet,
  gameOver, toastMsg, toast, byId, upgradeBuilding, buildingUpgradeCost, Building, requirementText,
  Unit, deployPioneer, startRepair, repairCost,
} from './game';
import { selection, startPlacement, placement, cancelPlacement, setOnBuildingPlaced } from './input';
import { sfx, duckMusic } from './audio';
import { defenceIconUrl } from './render';

const creditsEl = document.getElementById('credits')!;
const powerFill = document.getElementById('powerfill')!;
const powerText = document.getElementById('powertext')!;
const grid = document.getElementById('buildgrid')!;
const tabsBar = document.getElementById('tabsbar')!;
const selInfo = document.getElementById('selinfo')!;
const upgBtn = document.getElementById('upgbtn') as HTMLButtonElement;
const actBtn = document.getElementById('actbtn') as HTMLButtonElement;
const overlay = document.getElementById('overlay')!;
const overlayTitle = document.getElementById('overlaytitle')!;
const overlaySub = document.getElementById('overlaysub')!;
const toastEl = document.getElementById('toast')!;

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

// icon markup for a def
function iconHtml(tab: Tab, defId: string): string {
  if (tab === 'ups') return upgradeSvg(defId);
  if (tab === 'inf' || tab === 'veh') {
    const d = UNITS[defId];
    return `<img src="sprites/u_${d.model}${d.mstep}_s.png" alt="">`;
  }
  const s = BUILDINGS[defId]?.sprite;
  if (s) return `<img src="sprites/${s}_1.png" alt="">`;
  return `<img src="${defenceIconUrl(defId)}" alt="">`; // turret / wall: baked art
}

const tabBtns = new Map<Tab, HTMLButtonElement>();

export function initUI() {
  for (const t of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'htab' + (t === activeTab ? ' active' : '');
    b.textContent = TAB_NAMES[t].toUpperCase();
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
  upgBtn.addEventListener('click', () => {
    const b = selectedOwnBuilding();
    if (b) upgradeBuilding(b);
  });
  actBtn.addEventListener('click', () => {
    const u = selectedOwnPioneer();
    if (u) { deployPioneer(u); return; }
    const b = selectedOwnBuilding();
    if (b) startRepair(b);
  });
  rebuildGrid();
}

function defsFor(tab: Tab) {
  if (tab === 'ups') return Object.values(UPGRADES);
  if (tab === 'inf' || tab === 'veh') return Object.values(UNITS).filter(d => d.tab === tab);
  return Object.values(BUILDINGS).filter(d => d.tab === tab && !NON_BUILDABLE.has(d.id));
}

function rebuildGrid() {
  grid.innerHTML = '';
  btns.length = 0;
  for (const def of defsFor(activeTab)) {
    const el = document.createElement('div');
    el.className = 'bbtn';
    if ((def as any).desc) el.title = (def as any).desc;
    el.innerHTML = `${iconHtml(activeTab, def.id)}<div class="nm">${def.name}</div><div class="cost">$${def.cost}</div><div class="prog"></div><div class="count"></div>`;
    el.addEventListener('click', () => onBtnClick(def.id));
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

export function updateUI() {
  const p = players[PLAYER];
  // smooth credit ticker, RA2-style
  shownCredits += (p.credits - shownCredits) * 0.2;
  if (Math.abs(shownCredits - p.credits) < 1) shownCredits = p.credits;
  creditsEl.textContent = '$ ' + Math.round(shownCredits).toLocaleString();

  const pw = powerOf(PLAYER);
  const frac = pw.supply > 0 ? Math.min(1, pw.drain / pw.supply) : (pw.drain > 0 ? 1 : 0);
  powerFill.style.width = pw.low ? '100%' : `${Math.max(4, 100 - frac * 100)}%`;
  powerFill.className = pw.low ? 'low' : '';
  powerText.textContent = pw.low ? `${pw.drain - pw.supply} OVER — production slowed` : `${pw.supply - pw.drain} spare`;

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

  // selection info + building upgrade button
  const ob = selectedOwnBuilding();
  if (ob && ob.def.upgradable && (ob.level < 3 || ob.upgrading)) {
    upgBtn.style.display = 'block';
    if (ob.upgrading) {
      const pct = Math.round((1 - ob.upgrading.remaining / ob.upgrading.total) * 100);
      upgBtn.textContent = `UPGRADING… ${pct}%`;
      upgBtn.disabled = true;
    } else {
      upgBtn.textContent = `⬆ UPGRADE (LV ${ob.level} → ${ob.level + 1}) — $${buildingUpgradeCost(ob)}`;
      upgBtn.disabled = false;
    }
  } else {
    upgBtn.style.display = 'none';
  }

  // contextual action button: deploy a Pioneer, or repair a damaged building
  const pio = selectedOwnPioneer();
  if (pio) {
    actBtn.style.display = 'block';
    actBtn.textContent = '▼ DEPLOY COMMAND POST';
    actBtn.disabled = false;
  } else if (ob && ob.hp < ob.maxHp) {
    actBtn.style.display = 'block';
    if (ob.repairing) { actBtn.textContent = 'REPAIRING…'; actBtn.disabled = true; }
    else { actBtn.textContent = `🔧 REPAIR — $${repairCost(ob)}`; actBtn.disabled = false; }
  } else {
    actBtn.style.display = 'none';
  }

  if (selection.size > 0) {
    const first = byId.get([...selection][0]);
    if (first) {
      const name = first.def.name;
      const lvl = first.kind === 'building' && first.level > 1 ? ` <span style="color:#ffd76e">LV${first.level}</span>` : '';
      const hp = `${Math.ceil(first.hp)} / ${first.maxHp} HP`;
      selInfo.innerHTML = selection.size === 1
        ? `<b>${name}</b>${lvl} — ${hp}<br><i>${(first.def as any).desc ?? ''}</i>`
        : `<b>${selection.size} units selected</b><br>${name} +${selection.size - 1} more`;
    }
  } else {
    selInfo.innerHTML = '<b>► AWAITING ORDERS</b>';
  }

  // toast
  toastEl.textContent = toastMsg.text;
  toastEl.style.opacity = toastMsg.ttl > 0 ? '1' : '0';

  // game over
  if (gameOver) {
    if (overlay.style.display !== 'flex') duckMusic();
    overlay.style.display = 'flex';
    overlay.className = gameOver;
    overlayTitle.textContent = gameOver === 'win' ? 'VICTORY' : 'DEFEAT';
    overlaySub.textContent = gameOver === 'win'
      ? 'The launch corridor is clear. The ark-fleet jumps at dawn — humanity survives.'
      : 'Vanguard command has fallen. The fleet dies in orbit, and humanity with the sun.';
  }
}
