import {
  BUILDINGS, UNITS, UPGRADES, NON_BUILDABLE, PLAYER, Tab, TAB_NAMES, UNIT_ARMOR, UNIT_DMGTYPE, VET_NAME,
  FACTION_NAMES,
} from './config';
import * as campaign from './campaign/runner';
import {
  players, powerOf, hasBuilding, startProduction, cancelProduction, queuedCount, prereqMet,
  gameOver, endReason, corridor, techAllowed, toastMsg, toast, byId, issueOrder, upgradeBuilding, buildingUpgradeCost, Building, requirementText,
  Unit, deployPioneer, startRepair, repairCost, superReady, novaTotal, novaLeft,
  enemyStrikeETA, starvedHarvesters, stats, activateAbility, abilityOn,
} from './game';
import { selection, startPlacement, placement, cancelPlacement, setOnBuildingPlaced, startStrikeTargeting, controlGroupIds, saveControlGroup, recallControlGroup } from './input';
import { sfx, duckMusic } from './audio';
import { defenceIconUrl, bakeAirSprite, artIconUrl, unitIconUrl } from './render';

const creditsEl = document.getElementById('credits')!;
const powerFill = document.getElementById('powerfill')!;
const powerText = document.getElementById('powertext')!;
const grid = document.getElementById('buildgrid')!;
const tabsBar = document.getElementById('tabsbar')!;
const selInfo = document.getElementById('selinfo')!;
const selCopy = document.getElementById('selcopy')!;
const selPortrait = document.getElementById('selportrait')!;
const selHealth = document.getElementById('selhealth')!;
const selHealthFill = document.getElementById('selhealthfill')!;
const detailsBtn = document.getElementById('detailsbtn') as HTMLButtonElement;
const selectionDetails = document.getElementById('selectiondetails')!;
const detailsCopy = document.getElementById('detailscopy')!;
const detailsClose = document.getElementById('detailsclose') as HTMLButtonElement;
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
const groupBar = document.getElementById('groupbar')!;
let shownSelection = '';
let shownPortrait = '';
let shownHealth = -1;
let shownSingle = false;
let shownHalt = false;
let shownGroupBar = false;
let shownDetailsBtn = false;
const groupBtns: { el: HTMLButtonElement, count: HTMLElement, key: string, state: string }[] = [];

let activeTab: Tab = 'build';
let shownCredits = 0;

interface Btn { el: HTMLElement, defId: string, tab: Tab, prog: HTMLElement, count: HTMLElement }
const btns: Btn[] = [];

const CATEGORIES: Tab[] = ['build', 'def', 'inf', 'veh', 'ups'];
const compactDeck = matchMedia('(orientation: landscape) and (max-width: 920px) and (max-height: 480px)');

function selectedUnits(): Unit[] {
  const out: Unit[] = [];
  for (const id of selection) {
    const e = byId.get(id);
    if (e?.kind === 'unit' && e.owner === PLAYER) out.push(e);
  }
  return out;
}

function orderText(u: Unit): string {
  if (u.def.harvester) {
    if (u.harvestState === 'harvesting') return 'Harvesting flux';
    if (u.harvestState === 'toBase') return 'Returning cargo';
    if (u.harvestState === 'toField') return 'Moving to crystal';
  }
  if (u.order.type === 'move') return 'Moving';
  if (u.order.type === 'attackMove') return 'Advancing';
  if (u.order.type === 'attack' || u.autoTargetId >= 0) return 'Engaging';
  return 'Idle';
}

function groupOrderText(units: Unit[]): string {
  if (!units.length || units.length !== selection.size) return 'Mixed selection';
  const first = orderText(units[0]);
  return units.every(u => orderText(u) === first) ? first : 'Mixed orders';
}

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
// (owner and level let a selection portrait match the unit or building
// selected — enemy colours, upgraded art)
const iconCache = new Map<string, string>();
function iconHtml(tab: Tab, defId: string, owner = PLAYER, level = 1): string {
  const key = `${tab}:${defId}:${owner}:${level}`;
  let html = iconCache.get(key);
  if (html === undefined) { html = bakeIconHtml(tab, defId, owner, level); iconCache.set(key, html); }
  return html;
}

function bakeIconHtml(tab: Tab, defId: string, owner: number, level: number): string {
  if (tab === 'ups') return upgradeSvg(defId);
  if (tab === 'inf' || tab === 'veh') {
    const art = unitIconUrl(defId, owner);
    if (art) return `<img src="${art}" alt="">`;
    const d = UNITS[defId];
    if (d.air) return `<img src="${bakeAirSprite(defId, PLAYER).toDataURL()}" alt="">`;
    return `<img src="sprites/u_${d.model}${d.mstep}_s.png" alt="">`;
  }
  const art = artIconUrl(defId, owner, level);
  if (art) return `<img src="${art}" alt="">`;
  const s = BUILDINGS[defId]?.sprite;
  if (s) return `<img src="sprites/${s}_1.png" alt="">`;
  return `<img src="${defenceIconUrl(defId)}" alt="">`; // turret / wall: baked art
}

const tabBtns = new Map<Tab, HTMLButtonElement>();

function activateTab(t: Tab) {
  if (t === activeTab) return;
  activeTab = t;
  tabBtns.forEach((btn, tab) => {
    const selected = tab === t;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-selected', String(selected));
    btn.tabIndex = selected ? 0 : -1;
  });
  grid.setAttribute('aria-label', `${TAB_NAMES[t]} options`);
  rebuildGrid();
  sfx('click');
}

export function initUI() {
  // icons are baked in the current render style; re-bake them when it flips
  for (const key of ['1', '2', '3']) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'groupbtn';
    el.innerHTML = `<span>${key}</span><small>Save</small>`;
    const count = el.querySelector('small')!;
    let held = false, timer = 0;
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && selection.size && controlGroupIds(key).length)
        timer = window.setTimeout(() => { held = saveControlGroup(key); }, 550);
    });
    el.addEventListener('pointerup', () => clearTimeout(timer));
    el.addEventListener('pointercancel', () => clearTimeout(timer));
    el.addEventListener('pointerleave', () => clearTimeout(timer));
    el.addEventListener('click', () => {
      if (held) { held = false; return; }
      if (controlGroupIds(key).length) recallControlGroup(key);
      else saveControlGroup(key);
    });
    groupBar.appendChild(el);
    groupBtns.push({ el, count, key, state: '' });
  }
  for (const t of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'htab' + (t === activeTab ? ' active' : '');
    b.textContent = TAB_NAMES[t];
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t === activeTab));
    b.tabIndex = t === activeTab ? 0 : -1;
    b.addEventListener('click', () => activateTab(t));
    tabsBar.appendChild(b);
    tabBtns.set(t, b);
  }
  tabsBar.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const i = CATEGORIES.indexOf(activeTab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? CATEGORIES.length - 1
      : (i + (e.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length;
    activateTab(CATEGORIES[next]);
    tabBtns.get(CATEGORIES[next])?.focus();
  });
  grid.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const focused = btns.findIndex(b => b.el === document.activeElement);
    if (focused < 0) return;
    e.preventDefault(); e.stopPropagation();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1
      : (focused + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
    btns[next]?.el.focus();
  });
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
    if (!b) {
      for (const u of selectedUnits()) if (!u.def.harvester && u.order.type !== 'idle') issueOrder(u, { type: 'idle' });
      return;
    }
    if (b.def.superweapon && superReady(b)) { startStrikeTargeting(b.id); sfx('click'); return; }
    startRepair(b);
  });
  abilBtn.addEventListener('pointerdown', () => { for (const u of abilityUnits()) activateAbility(u); });
  const closeDetails = (returnFocus = false) => {
    selectionDetails.hidden = true;
    detailsBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) detailsBtn.focus();
  };
  detailsBtn.addEventListener('click', () => {
    if (!selectionDetails.hidden) { closeDetails(true); return; }
    detailsCopy.innerHTML = selCopy.innerHTML;
    selectionDetails.hidden = false;
    detailsBtn.setAttribute('aria-expanded', 'true');
    detailsClose.focus();
  });
  detailsClose.addEventListener('click', () => closeDetails(true));
  selectionDetails.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeDetails(true); } });
  document.getElementById('game')!.addEventListener('pointerdown', () => closeDetails());
  compactDeck.addEventListener('change', () => { if (!compactDeck.matches) closeDetails(); });
  rebuildGrid();
}

function defsFor(tab: Tab) {
  // a campaign mission only shows the tech it has cleared
  const ok = (id: string) => techAllowed(PLAYER, id);
  if (tab === 'ups') return Object.values(UPGRADES).filter(d => ok(d.id));
  if (tab === 'inf' || tab === 'veh') return Object.values(UNITS).filter(d => d.tab === tab && !d.nonBuildable && ok(d.id));
  return Object.values(BUILDINGS).filter(d => d.tab === tab && !NON_BUILDABLE.has(d.id) && !d.nonBuildable && ok(d.id));
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
  updateCampaignUI();
  const showDetailsBtn = selection.size > 0;
  if (showDetailsBtn !== shownDetailsBtn) {
    detailsBtn.classList.toggle('show', showDetailsBtn);
    if (!showDetailsBtn) { selectionDetails.hidden = true; detailsBtn.setAttribute('aria-expanded', 'false'); }
    shownDetailsBtn = showDetailsBtn;
  }
  const showGroups = selection.size > 0 || groupBtns.some(b => controlGroupIds(b.key).length > 0);
  if (showGroups !== shownGroupBar) { groupBar.classList.toggle('show', showGroups); shownGroupBar = showGroups; }
  for (const b of groupBtns) {
    const ids = controlGroupIds(b.key);
    const current = ids.length > 0 && ids.length === selection.size && ids.every(id => selection.has(id));
    const state = `${ids.length}:${current}:${selection.size > 0}`;
    if (state === b.state) continue;
    b.el.classList.toggle('saved', ids.length > 0);
    b.el.classList.toggle('current', current);
    b.el.setAttribute('aria-pressed', String(current));
    b.el.setAttribute('aria-label', ids.length ? `Recall group ${b.key}, ${ids.length} selected. Hold to replace.` : `Save selection as group ${b.key}`);
    b.count.textContent = ids.length ? String(ids.length) : 'Save';
    b.state = state;
  }
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
      upgBtn.textContent = compactDeck.matches
        ? `⬆ Upgrade Lv ${ob.level + 1} · ◈${buildingUpgradeCost(ob)}`
        : `⬆ Upgrade to Lv ${ob.level + 1} — ◈${buildingUpgradeCost(ob)}`;
      upgBtn.disabled = false;
    }
  } else {
    upgBtn.style.visibility = 'hidden';
  }

  // contextual action button: deploy Pioneer · orbital strike · repair
  const pio = selectedOwnPioneer();
  const showHalt = !pio && !ob && selectedUnits().some(u => !u.def.harvester && u.order.type !== 'idle');
  if (showHalt !== shownHalt) { actBtn.classList.toggle('halt', showHalt); shownHalt = showHalt; }
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
  } else if (showHalt) {
    actBtn.style.visibility = 'visible';
    if (actBtn.textContent !== '■ Halt [S]') actBtn.textContent = '■ Halt [S]';
    actBtn.disabled = false;
  } else {
    actBtn.style.visibility = 'hidden';
  }

  if (selection.size > 0) {
    const first = byId.get([...selection][0]);
    if (first) {
      const single = selection.size === 1;
      if (single !== shownSingle) { selInfo.classList.toggle('has-selection', single); shownSingle = single; }
      const lvl0 = first.kind === 'building' ? first.level : 1;
      const portraitKey = single ? `${first.kind}:${first.def.id}:${first.owner}:${lvl0}` : '';
      if (portraitKey !== shownPortrait) {
        selPortrait.innerHTML = single ? iconHtml(first.def.tab, first.def.id, first.owner, lvl0) : '';
        shownPortrait = portraitKey;
      }
      if (single) {
        const health = Math.max(0, Math.min(100, Math.round(first.hp / first.maxHp * 100)));
        if (health !== shownHealth) {
          selHealthFill.style.width = `${health}%`;
          selHealthFill.classList.toggle('warn', health > 25 && health <= 50);
          selHealthFill.classList.toggle('low', health <= 25);
          selHealth.setAttribute('aria-valuenow', String(health));
          shownHealth = health;
        }
      }
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
      const order = first.kind === 'unit' ? `<span class="selorder">${orderText(first)}</span>` : '';
      const html = single
        ? `<b>${name}</b>${lvl} — ${hp}${order}${combat}<br><i>${(first.def as any).desc ?? ''}</i>`
        : `<b>${selection.size} units selected</b><span class="selorder">${groupOrderText(selectedUnits())}</span>${name} +${selection.size - 1} more`;
      if (html !== shownSelection) {
        selCopy.innerHTML = html;
        if (!selectionDetails.hidden) detailsCopy.innerHTML = html;
        shownSelection = html;
      }
    }
  } else {
    if (shownSingle) { selInfo.classList.remove('has-selection'); shownSingle = false; }
    if (shownPortrait) { selPortrait.innerHTML = ''; shownPortrait = ''; }
    const html = '<b>Awaiting orders</b><br>Select a unit or building.';
    if (html !== shownSelection) { selCopy.innerHTML = html; shownSelection = html; }
  }

  // toast
  toastEl.textContent = toastMsg.text;
  toastEl.style.opacity = toastMsg.ttl > 0 ? '1' : '0';

  // game over
  if (gameOver) {
    if (overlay.style.display !== 'flex') {
      duckMusic();
      document.getElementById('app')!.inert = true;
      overlay.style.display = 'flex';
      (overlay.querySelector('button') as HTMLButtonElement).focus();
    }
    overlay.className = gameOver;
    const novaExpired = novaTotal > 0 && novaLeft <= 0;
    overlayTitle.textContent = gameOver === 'win' ? 'Victory' : novaExpired ? 'Supernova' : 'Defeat';
    const viaCorridor = endReason === 'corridor';
    overlaySub.textContent = gameOver === 'win' && viaCorridor
      ? 'The vents held long enough to light the beacon. The ark-fleet rides the corridor out — humanity survives.'
      : gameOver === 'win'
      ? 'The launch corridor is clear. The ark-fleet jumps at dawn — humanity survives.'
      : viaCorridor
      ? `${FACTION_NAMES[corridor.owner] ?? 'A rival faction'} held the vents and launched first. The corridor closes behind them.`
      : novaExpired
      ? 'Helios detonated with the enemy still standing. The fleet burns. There is no dawn.'
      : 'Your forces can no longer hold the surface. The fleet dies in orbit, and humanity with the sun.';
    const m = campaign.activeMission();
    if (m) {
      const end = gameOver === 'win' ? m.endWin : (endReason === 'eliminated' && m.endEliminated) || m.endLose;
      overlayTitle.textContent = end.title;
      overlaySub.textContent = end.text;
      const last = gameOver === 'win' && campaign.isLastMission();
      againBtn.textContent = last ? 'Back to the campaign' : gameOver === 'win' ? 'Next mission ▸' : 'Retry mission';
      againBtn.onclick = () => { campaign.queueMission(gameOver === 'win'); location.reload(); };
    }
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

// ---------- campaign: comms box and objective tracker ----------
const againBtn = document.getElementById('againbtn')!;
const comms = document.getElementById('comms')!;
const commsBadge = document.getElementById('commsbadge')!;
const commsWho = document.getElementById('commswho')!;
const commsText = document.getElementById('commstext')!;
const objTracker = document.getElementById('objtracker')!;
const objTitle = document.getElementById('objtitle')!;
const objList = document.getElementById('objlist')!;
comms.addEventListener('click', () => campaign.skipComm());
let shownComm: object | null = null, shownObjs = '', shownMission: object | null = null;
function updateCampaignUI() {
  const m = campaign.activeMission();
  if (m !== shownMission) { shownMission = m; rebuildGrid(); }   // the build bar follows the mission's tech list
  const line = campaign.currentComm();
  if (line !== shownComm) {   // only touch the DOM when the line changes
    shownComm = line;
    comms.hidden = !line;
    if (line) {
      const sp = campaign.SPEAKERS[line.who];
      // sit just above the command deck, however tall it is in this layout
      const deck = document.getElementById('bottombar')?.getBoundingClientRect();
      if (deck) comms.style.setProperty('--deck-h', `${Math.round(innerHeight - deck.top)}px`);
      comms.className = line.who;
      commsBadge.style.background = sp.color;
      commsBadge.style.borderColor = sp.color;
      if (sp.portrait) commsBadge.innerHTML = `<img src="portraits/${sp.portrait}" alt="">`;
      else commsBadge.textContent = line.who === 'seren' ? '?' : sp.name.split(' ').pop()![0];
      commsWho.style.color = sp.color;
      commsWho.innerHTML = `${sp.name}<small>${sp.role}</small>`;
      commsText.textContent = line.text;
      if (line.choice) {
        const row = document.createElement('div'); row.className = 'commschoice';
        for (const o of line.choice.options) {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = o.label;
          b.addEventListener('click', ev => { ev.stopPropagation(); campaign.choose(o.id); });
          row.appendChild(b);
        }
        commsText.appendChild(row);
      }
    }
  }
  const objs = campaign.objectives();
  const key = objs.map(o => (o.done ? '1' : '0') + o.text).join('|');
  if (key !== shownObjs) {
    shownObjs = key;
    objTracker.hidden = !objs.length;
    objTitle.textContent = campaign.missionTitle();
    objList.innerHTML = objs.map(o => `<li class="${o.done ? 'done' : ''}">${o.text}${o.optional ? ' (optional)' : ''}</li>`).join('');
  }
}
