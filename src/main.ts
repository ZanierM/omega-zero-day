import { PLAYER, TILE } from './config';
import { generateMap, startBases } from './map';
import * as game from './game';
import { update, spawnUnit, placeBuilding, buildingCenter, centerOfTile, initGame } from './game';
import { updateAI, initAI } from './ai';
import { initInput, updateCamera, centerCameraOn } from './input';
import { render, renderMinimap, resize, initRenderer, loadSprites } from './render';
import { initUI, updateUI } from './ui';
import { initAudio, toggleMute, isMuted, audioStats } from './audio';
import { writeSave, readSave, clearSave, applySave, describeSave } from './save';
import * as campaign from './campaign/runner';

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

interface SkirmishOpts { credits: number; crystalMul: number; nova: number }

async function startGame(numEnemies: number, opts: SkirmishOpts = { credits: 5000, crystalMul: 1, nova: 0 }) {
  campaign.endRun();
  generateMap(numEnemies, opts.crystalMul);
  initGame(numEnemies);
  game.setSupernova(opts.nova);
  await loadSprites();
  await initRenderer();   // paints the ground in slices so the page stays live

  for (const p of game.players) p.credits = opts.credits;
  const bases = startBases; // randomized by generateMap
  for (let owner = 0; owner < bases.length; owner++) {
    const b = bases[owner];
    const hq = placeBuilding('nexus', owner, b.x, b.y);
    // starting forces around each HQ
    const cx = hq.tx + 1, cy = hq.ty + 1;
    spawnUnit('harvester', owner, centerOfTile(cx + 4), centerOfTile(cy));
    spawnUnit('trooper', owner, centerOfTile(cx - 2), centerOfTile(cy + 3));
    spawnUnit('trooper', owner, centerOfTile(cx), centerOfTile(cy + 3));
    spawnUnit('trooper', owner, centerOfTile(cx + 2), centerOfTile(cy + 3));
    if (owner === PLAYER) {
      const c = buildingCenter(hq);
      centerCameraOn(c.x, c.y);
    }
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

// faction-count + difficulty selectors: segmented buttons (delegated)
for (const id of ['aiopts', 'diffopts', 'creditopts', 'crystalopts', 'novaopts']) {
  document.getElementById(id)!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('.opt');
    if (!btn) return;
    document.querySelectorAll(`#${id} .opt`).forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
  });
}

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
  const opts = { credits: pick('creditopts', 5000), crystalMul: pick('crystalopts', 1), nova: pick('novaopts', 0) };
  try {
    initAudio(); // must start from a user gesture (browser autoplay rules)
    if (mode === 'campaign') await startMission(selectedMission);
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
  const firstOpen = campaign.MISSIONS.find(m => campaign.unlocked(m.id) && !done.includes(m.id)) ?? campaign.MISSIONS[0];
  if (!selectedMission || !campaign.unlocked(selectedMission)) selectedMission = firstOpen.id;
  const ACTS: Record<number, string> = { 1: 'Act I — Landfall', 2: 'Act II — The Corridor' };
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
