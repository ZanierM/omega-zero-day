import { PLAYER, TILE, BROOD, KEEPERS, HOLLOW, FACTIONS, FactionId, setSlots, resetSlots, kindOf, rolesOf, isClan } from './config';
import { generateMap, startBases, setLand, LANDS, Land } from './map';
import * as game from './game';
import { update, spawnUnit, placeBuilding, buildingCenter, centerOfTile, initGame } from './game';
import { updateAI, initAI } from './ai';
import { initInput, updateCamera, centerCameraOn } from './input';
import { render, renderMinimap, resize, initRenderer, loadSprites } from './render';
import { initUI, updateUI } from './ui';
import { initAudio, toggleMute, isMuted, audioStats } from './audio';
import { writeSave, readSave, clearSave, applySave, describeSave } from './save';
import * as campaign from './campaign/runner';
import { initBrood, seedBrood } from './brood';
import { initKeepers, seedKeepers, keeperLandingSite } from './keepers';
import { initHollow, seedHollow } from './hollow';
import { nearestTile, MAP_W, MAP_H, terrain, occupied, idx, inBounds, neutralSpots } from './map';

// ---------- boot: UI shell first, world is created on deploy ----------

initInput();
initUI();
const app = document.getElementById('app')!;
const briefing = document.getElementById('briefing')!;
resize();
window.addEventListener('resize', resize);
// folding/unfolding or rotating reflows the command deck, which resizes the
// map canvas without always firing a window resize
new ResizeObserver(resize).observe(document.getElementById('game')!);

let started = false;
let deploying = false;
let difficulty: import('./ai').Difficulty = 'normal';

interface SkirmishOpts { credits: number; crystalMul: number; nova: number; brood?: boolean; keepers?: boolean; hollow?: boolean; faction?: FactionId; land?: string }

async function startGame(numEnemies: number, opts: SkirmishOpts = { credits: 5000, crystalMul: 1, nova: 0 }) {
  campaign.endRun();
  // who sits where: you take slot 0 as your faction, the other human factions fill the rivals' slots
  const mine = opts.faction ?? 'helion';
  const rivals = rivalsOf(mine);
  setSlots([mine, rivals[0], rivals[1], rivals[2] ?? 'hearth', 'hollow', 'brood', 'keepers']);
  setLand(opts.land === 'random' || !opts.land ? LANDS[Math.floor(Math.random() * LANDS.length)] : opts.land as Land);
  generateMap(numEnemies, opts.crystalMul);
  initGame(numEnemies);
  game.setSupernova(opts.nova);
  await loadSprites();
  await initRenderer();   // paints the ground in slices so the page stays live

  for (const p of game.players) p.credits = opts.credits;
  const bases = startBases; // randomized by generateMap
  for (let owner = 0; owner < bases.length; owner++) {
    const b = bases[owner];
    // an alien player starts as its faction does: a Heart and skitters, a Beacon and an escort, or a Hearth and kin
    if (owner === PLAYER && kindOf(PLAYER) !== 'human') {
      const k = kindOf(PLAYER);
      const core = placeBuilding(k === 'brood' ? 'heart' : k === 'hollow' ? 'hearthstone' : 'beacon', PLAYER, b.x, b.y);
      const c = buildingCenter(core);
      const escort = k === 'brood' ? ['skitter', 'skitter', 'skitter', 'skitter', 'skitter', 'skitter', 'spitter', 'spitter']
        : k === 'hollow' ? ['shardkin', 'shardkin', 'shardkin', 'shardkin', 'burrower', 'choir'] : ['acolyte', 'acolyte', 'acolyte', 'lancer'];
      escort.forEach((id, k) => spawnUnit(id, PLAYER, c.x + Math.cos(k * 0.8) * TILE * 2.6, c.y + TILE * 2.4 + Math.sin(k * 0.8) * TILE));
      centerCameraOn(c.x, c.y);
      continue;
    }
    const R = rolesOf(owner);
    const hq = placeBuilding(R.hq, owner, b.x, b.y);
    // starting forces around each HQ (the Clans bring an extra rifle)
    const cx = hq.tx + 1, cy = hq.ty + 1;
    spawnUnit(R.harvester, owner, centerOfTile(cx + 4), centerOfTile(cy));
    for (const dx of isClan(owner) ? [-3, -1, 1, 3] : [-2, 0, 2]) spawnUnit(R.grunt, owner, centerOfTile(cx + dx), centerOfTile(cy + 3));
    if (owner === PLAYER) {
      const c = buildingCenter(hq);
      centerCameraOn(c.x, c.y);
    }
  }

  // the Vey brood wakes at the heart of the map
  initBrood(!!opts.brood, difficulty === 'easy' ? 0.6 : difficulty === 'hard' ? 1.15 : 0.85);
  if (opts.brood) {
    game.ensureFaction(BROOD);
    const clear = (x: number, y: number) => {
      for (let yy = y - 1; yy <= y + 3; yy++) for (let xx = x - 1; xx <= x + 3; xx++)
        if (!inBounds(xx, yy) || terrain[idx(xx, yy)] !== 0 || occupied[idx(xx, yy)] !== -1) return false;
      return !neutralSpots.some(n => Math.hypot(n.x - x, n.y - y) < 5);
    };
    const at = nearestTile(Math.floor(MAP_W / 2) - 1, Math.floor(MAP_H / 2) - 1, 14, clear);
    if (at) seedBrood(at);
  }
  // the Keepers come down at whichever edge is furthest from everyone
  const power = difficulty === 'easy' ? 0.65 : difficulty === 'hard' ? 1.2 : 0.9;
  initKeepers(!!opts.keepers, power);
  if (opts.keepers) {
    game.ensureFaction(KEEPERS);
    const at = keeperLandingSite();
    if (at) seedKeepers(at);
  }
  // the Hollow come up out of the rock, as far from everyone as they can
  initHollow(!!opts.hollow, power);
  if (opts.hollow) {
    game.ensureFaction(HOLLOW);
    const at = keeperLandingSite();
    if (at) seedHollow(at);
  }
  initAI(numEnemies, difficulty);
  clearSave();   // a new match replaces the old slot
  started = true;
  game.setPaused(false);
  last = performance.now();
}

async function startMission(id: string) {
  campaign.setupMission(id);   // map, bases and script; same seed every time
  await loadSprites();
  await initRenderer();
  clearSave();
  started = true;
  game.setPaused(false);
  last = performance.now();
  campaign.bootComms();
}

async function resumeGame(save: NonNullable<ReturnType<typeof readSave>>) {
  applySave(save);
  difficulty = save.ai.difficulty;
  await loadSprites();
  await initRenderer(save.terrainSeed);   // same seed, same ground
  inputMod.camera.zoom = save.camera.zoom;
  inputMod.camera.x = save.camera.x; inputMod.camera.y = save.camera.y;
  started = true;
  last = performance.now();
}

// ---------- save / resume (single-player skirmish) ----------

let autosaveTimer = 0;
function saveNow() { if (started && !game.gameOver) writeSave(difficulty); }
// a hidden tab may never come back (closed, phone call, app switch): save it
// (the pause-menu handler below pauses it)
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

// play-as picker: one card per playable faction
const factionOpts = document.getElementById('factionopts')!;
const PLAYABLE: FactionId[] = ['helion', 'kessler', 'ashen', 'brood', 'keepers', 'hollow'];
// the human factions you'd face: the two you aren't (all three if you play an alien)
function rivalsOf(mine: FactionId): FactionId[] { return (['kessler', 'ashen', 'helion'] as FactionId[]).filter(f => f !== mine); }
factionOpts.innerHTML = PLAYABLE.map((f, i) => {
  const F = FACTIONS[f];
  return `<button class="opt${i === 0 ? ' sel' : ''}${F.kind !== 'human' ? ' alien' : ''}" type="button" role="radio" aria-checked="${i === 0}" data-f="${f}">`
    + `<b><i style="background:${F.color};color:${F.color}"></i>${F.name}</b><span>${F.blurb}</span></button>`;
}).join('');
function syncAlienOptions() {
  // you can't also fight yourself
  const f = (factionOpts.querySelector('.opt.sel') as HTMLElement | null)?.dataset.f;
  // the opponent buttons name who you'll actually face; a third rival only exists for an alien player
  const foes = rivalsOf((f ?? 'helion') as FactionId);
  document.querySelectorAll<HTMLElement>('#aiopts .opt span').forEach((sp, i) => {
    if (foes[i]) sp.textContent = (i ? '+ ' : '') + FACTIONS[foes[i]].name + (i === 1 ? ' · 76×76' : i === 2 ? ' · 90×90' : '');
  });
  const third = document.querySelector('#aiopts .opt[data-n="3"]') as HTMLButtonElement;
  third.hidden = foes.length < 3;
  if (third.hidden && third.classList.contains('sel')) { third.classList.remove('sel'); document.querySelector('#aiopts .opt[data-n="2"]')!.classList.add('sel'); }
  for (const [row, id] of [['broodopts', 'brood'], ['keeperopts', 'keepers'], ['hollowopts', 'hollow']] as const) {
    const on = document.querySelector(`#${row} .opt[data-v="1"]`) as HTMLButtonElement, off = document.querySelector(`#${row} .opt[data-v="0"]`) as HTMLButtonElement;
    on.disabled = f === id;
    if (f === id && on.classList.contains('sel')) { on.classList.remove('sel'); off.classList.add('sel'); }
  }
}
factionOpts.addEventListener('click', e => {
  const btn = e.target instanceof Element ? e.target.closest<HTMLElement>('.opt') : null;
  if (!btn) return;
  factionOpts.querySelectorAll('.opt').forEach(b => { b.classList.toggle('sel', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
  syncAlienOptions();
});

// faction-count + difficulty selectors: segmented buttons (delegated)
for (const id of ['aiopts', 'diffopts', 'creditopts', 'crystalopts', 'novaopts', 'broodopts', 'keeperopts', 'hollowopts', 'campdiffopts', 'landopts']) {
  document.getElementById(id)!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.opt');
    if (!btn) return;
    document.querySelectorAll(`#${id} .opt`).forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
  });
}

// the campaign difficulty is kept with the campaign's progress
document.getElementById('campdiffopts')!.addEventListener('click', e => {
  const b = e.target instanceof Element ? e.target.closest<HTMLElement>('.opt') : null;
  if (b?.dataset.d) campaign.setCampaignDifficulty(b.dataset.d as campaign.CampaignDifficulty);
});

// sound: mute button + M hotkey
const muteBtn = document.getElementById('mutebtn')!;
const pauseMute = document.getElementById('pausemute')!;
function refreshMuteBtn() {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  pauseMute.textContent = isMuted() ? 'Sound: off' : 'Sound: on';
}
muteBtn.addEventListener('click', () => { toggleMute(); refreshMuteBtn(); });
pauseMute.addEventListener('click', () => { toggleMute(); refreshMuteBtn(); });
window.addEventListener('keydown', e => {
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === 'm' || e.key === 'M') { toggleMute(); refreshMuteBtn(); }
});
refreshMuteBtn();

// pause menu: ☰ opens it (pausing the sim), resume / restart
const pauseMenu = document.getElementById('pausemenu')!;
const menuBtn = document.getElementById('menubtn')!;
function openPause() { if (started && !game.gameOver) { game.setPaused(true); app.inert = true; pauseMenu.style.display = 'flex'; document.getElementById('resumebtn')!.focus(); } }
function closePause() { pauseMenu.style.display = 'none'; app.inert = false; game.setPaused(false); last = performance.now(); menuBtn.focus(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden && pauseMenu.style.display !== 'flex') openPause();
});
menuBtn.addEventListener('click', () => {
  pauseMenu.style.display === 'flex' ? closePause() : openPause();
});
document.getElementById('resumebtn')!.addEventListener('click', closePause);
document.getElementById('restartbtn')!.addEventListener('click', () => { clearSave(); location.reload(); });
pauseMenu.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closePause(); } });
function trapDialogTabs(dialog: HTMLElement, heading?: HTMLElement) {
  dialog.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
trapDialogTabs(briefing, document.getElementById('brieftitle')!);
trapDialogTabs(pauseMenu);
trapDialogTabs(document.getElementById('overlay')!);
document.getElementById('brieftitle')!.focus();

const deployBtn = document.getElementById('deploy') as HTMLButtonElement;
deployBtn.addEventListener('click', async () => {
  if (deploying || started) return;
  deploying = true;
  deployBtn.disabled = true;
  deployBtn.textContent = 'Deploying…';
  deployBtn.setAttribute('aria-busy', 'true');
  const sel = document.querySelector('#aiopts .opt.sel') as HTMLElement | null;
  const n = Number(sel?.dataset.n ?? 1);
  const dsel = document.querySelector('#diffopts .opt.sel') as HTMLElement | null;
  difficulty = (dsel?.dataset.d ?? 'normal') as import('./ai').Difficulty;
  const pick = (id: string, def: number) =>
    Number((document.querySelector(`#${id} .opt.sel`) as HTMLElement | null)?.dataset.v ?? def);
  const faction = ((document.querySelector('#factionopts .opt.sel') as HTMLElement | null)?.dataset.f ?? 'helion') as FactionId;
  const opts = { credits: pick('creditopts', 5000), crystalMul: pick('crystalopts', 1), nova: pick('novaopts', 0),
    brood: pick('broodopts', 0) === 1 && faction !== 'brood', keepers: pick('keeperopts', 0) === 1 && faction !== 'keepers',
    hollow: pick('hollowopts', 0) === 1 && faction !== 'hollow', faction,
    land: (document.querySelector('#landopts .opt.sel') as HTMLElement | null)?.dataset.l ?? 'scrub' };
  try {
    initAudio(); // must start from a user gesture (browser autoplay rules)
    if (mode === 'campaign') {
      const cd = ((document.querySelector('#campdiffopts .opt.sel') as HTMLElement | null)?.dataset.d ?? 'normal') as campaign.CampaignDifficulty;
      campaign.setCampaignDifficulty(cd);
      difficulty = cd;   // the save remembers it for the AI on resume
      await startMission(selectedMission);
    }
    else await startGame(n, opts);
    briefing.style.display = 'none';
    app.inert = false;
    document.getElementById('game')!.focus();
  } catch (err) {
    // never fail silently into a black screen
    console.error(err);
    alert('Failed to start: ' + err);
    location.reload();
  } finally {
    deploying = false;
    deployBtn.removeAttribute('aria-busy');
  }
});

// ---------- campaign / skirmish mode on the briefing ----------
const modeKey = 'ozd-mode';
let mode: 'skirmish' | 'campaign' = 'skirmish';
let selectedMission = '';   // picked on first render: the next unfinished mission
const briefBox = document.getElementById('briefbox')!;
const missionList = document.getElementById('missionlist')!;
const missionBrief = document.getElementById('missionbrief')!;
function renderMissions() {
  const done = campaign.progress().done;
  const cd = campaign.campaignDifficulty();
  document.querySelectorAll<HTMLElement>('#campdiffopts .opt').forEach(b => b.classList.toggle('sel', b.dataset.d === cd));
  const firstOpen = campaign.MISSIONS.find(m => campaign.unlocked(m.id) && !done.includes(m.id)) ?? campaign.MISSIONS[0];
  if (!selectedMission || !campaign.unlocked(selectedMission)) selectedMission = firstOpen.id;
  const ACTS: Record<number, string> = { 1: 'Act I — Landfall', 2: 'Act II — The Corridor', 3: 'Act III — Last Light' };
  const button = (m: typeof campaign.MISSIONS[number]) => {
    const open = campaign.unlocked(m.id), fin = done.includes(m.id);
    return `<button class="opt mission${m.id === selectedMission ? ' sel' : ''}" type="button" data-id="${m.id}"${open ? '' : ' disabled'}>`
      + `<i>${fin ? '✓' : open ? m.code : '🔒'}</i>${m.title}<span>${open ? m.tagline : 'Complete the previous mission'}</span></button>`;
  };
  missionList.innerHTML = [...new Set(campaign.MISSIONS.map(m => m.act))].map(act =>
    `<div class="optlabel">${ACTS[act]}</div><div class="actrow">${campaign.MISSIONS.filter(m => m.act === act).map(button).join('')}</div>`).join('');
  const m = campaign.MISSIONS.find(x => x.id === selectedMission)!;
  missionBrief.innerHTML = `<div class="optlabel">Transmission · ${m.code} ${m.title}</div>`
    + `<div class="transmission"><img src="portraits/varga.webp" alt="Admiral Varga"><div>${m.briefing.map(p => `<p>${p}</p>`).join('')}</div></div>`
    + `<ul class="objectives">${m.goals.map(g => `<li>${g}</li>`).join('')}</ul>`;
}
function setMode(m: typeof mode) {
  mode = m;
  briefBox.classList.toggle('campaign', m === 'campaign');
  document.querySelectorAll('#modeopts .opt').forEach(b => b.classList.toggle('sel', (b as HTMLElement).dataset.m === m));
  deployBtn.textContent = m === 'campaign' ? 'Begin mission ▸' : 'Commence operation ▸';
  if (m === 'campaign') renderMissions();
  try { localStorage.setItem(modeKey, m); } catch { /* storage may be unavailable */ }
}
document.getElementById('modeopts')!.addEventListener('click', e => {
  const b = e.target instanceof Element ? e.target.closest<HTMLElement>('.opt') : null;
  if (b?.dataset.m) setMode(b.dataset.m as typeof mode);
});
missionList.addEventListener('click', e => {
  const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.mission') : null;
  if (!b || b.disabled) return;
  selectedMission = b.dataset.id!;
  renderMissions();
});
try { if (localStorage.getItem(modeKey) === 'campaign') setMode('campaign'); } catch { /* storage may be unavailable */ }
// arriving from "Next mission" / "Retry mission": go straight in
const queuedMission = campaign.takeQueuedMission();
if (queuedMission) {
  setMode('campaign');
  selectedMission = queuedMission;
  renderMissions();
  // audio needs a user gesture; the first tap or key in the mission wakes it
  const wake = () => { initAudio(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
  addEventListener('pointerdown', wake); addEventListener('keydown', wake);
  queueMicrotask(() => deployBtn.click());
}

const resumeSaveBtn = document.getElementById('resumesave') as HTMLButtonElement;
const pendingSave = readSave();
if (pendingSave) {
  resumeSaveBtn.hidden = false;
  document.getElementById('resumesavemeta')!.textContent = describeSave(pendingSave);
}
resumeSaveBtn.addEventListener('click', async () => {
  const save = readSave();
  if (deploying || started || !save) return;
  deploying = true;
  resumeSaveBtn.disabled = deployBtn.disabled = true;
  resumeSaveBtn.setAttribute('aria-busy', 'true');
  try {
    initAudio();
    await resumeGame(save);
    briefing.style.display = 'none';
    app.inert = false;
    document.getElementById('game')!.focus();
    openPause();   // let the player get their bearings before the clock runs
  } catch (err) {
    console.error(err);
    clearSave();   // a save that can't load would block the briefing forever
    alert('Could not resume the saved mission: ' + err);
    location.reload();
  } finally {
    deploying = false;
    resumeSaveBtn.removeAttribute('aria-busy');
  }
});

// ---------- game loop ----------

let last = performance.now();
let mmTimer = 0;

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); // clamp big frame gaps
  last = now;
  if (!started) return;

  updateCamera(dt);
  update(dt);
  if (!game.paused) updateAI(dt);
  render();
  updateUI();

  mmTimer -= dt;
  if (mmTimer <= 0) { mmTimer = 0.25; renderMinimap(); }

  if (game.gameOver) { if (autosaveTimer >= 0) { clearSave(); autosaveTimer = -1; } }
  else if (!game.paused && (autosaveTimer += dt) >= 20) { autosaveTimer = 0; saveNow(); }
}

function rafLoop(now: number) {
  frame(now);
  requestAnimationFrame(rafLoop);
}
requestAnimationFrame(rafLoop);

// Keep the simulation running when the tab is backgrounded and
// requestAnimationFrame is throttled or suspended by the browser.
setInterval(() => {
  const now = performance.now();
  if (now - last > 100) frame(now);
}, 50);

// Dev helpers, handy in the browser console while balancing
import * as inputMod from './input';
import * as mapMod from './map';
import * as configMod from './config';
(window as any).novaDebug = game;
(window as any).novaInput = inputMod;
(window as any).novaMap = mapMod;
(window as any).novaCfg = configMod;
(window as any).novaAudio = audioStats;
(window as any).novaCampaign = campaign;

// Fast-forward the simulation by N seconds (e.g. novaStep(30) in the console)
(window as any).novaStep = (seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) {
    update(0.05);
    updateAI(0.05);
  }
  updateUI();
  render();
  renderMinimap();
};
