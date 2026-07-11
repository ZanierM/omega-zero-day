import { PLAYER, TILE } from './config';
import { generateMap, startBases } from './map';
import * as game from './game';
import { update, spawnUnit, placeBuilding, buildingCenter, centerOfTile, initGame } from './game';
import { updateAI, initAI } from './ai';
import { initInput, updateCamera, centerCameraOn } from './input';
import { render, renderMinimap, resize, initRenderer, loadSprites } from './render';
import { initUI, updateUI } from './ui';
import { initAudio, toggleMute, isMuted } from './audio';

// ---------- boot: UI shell first, world is created on deploy ----------

initInput();
initUI();
resize();
window.addEventListener('resize', resize);

let started = false;
let difficulty: import('./ai').Difficulty = 'normal';

interface SkirmishOpts { credits: number; crystalMul: number; nova: number }

async function startGame(numEnemies: number, opts: SkirmishOpts = { credits: 5000, crystalMul: 1, nova: 0 }) {
  generateMap(numEnemies, opts.crystalMul);
  initGame(numEnemies);
  game.setSupernova(opts.nova);
  await loadSprites();
  initRenderer();

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
  started = true;
  game.setPaused(false);
  last = performance.now();
}

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
  const label = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  muteBtn.textContent = label;
  pauseMute.textContent = label;
}
muteBtn.addEventListener('click', () => { toggleMute(); refreshMuteBtn(); });
pauseMute.addEventListener('click', () => { toggleMute(); refreshMuteBtn(); });
window.addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') { toggleMute(); refreshMuteBtn(); }
});
refreshMuteBtn();

// pause menu: ☰ opens it (pausing the sim), resume / restart
const pauseMenu = document.getElementById('pausemenu')!;
function openPause() { if (started && !game.gameOver) { game.setPaused(true); pauseMenu.style.display = 'flex'; } }
function closePause() { pauseMenu.style.display = 'none'; game.setPaused(false); last = performance.now(); }
document.getElementById('menubtn')!.addEventListener('click', () => {
  pauseMenu.style.display === 'flex' ? closePause() : openPause();
});
document.getElementById('resumebtn')!.addEventListener('click', closePause);
document.getElementById('restartbtn')!.addEventListener('click', () => location.reload());

document.getElementById('deploy')!.addEventListener('click', async () => {
  initAudio(); // must start from a user gesture (browser autoplay rules)
  const sel = document.querySelector('#aiopts .opt.sel') as HTMLElement | null;
  const n = Number(sel?.dataset.n ?? 1);
  const dsel = document.querySelector('#diffopts .opt.sel') as HTMLElement | null;
  difficulty = (dsel?.dataset.d ?? 'normal') as import('./ai').Difficulty;
  const pick = (id: string, def: number) =>
    Number((document.querySelector(`#${id} .opt.sel`) as HTMLElement | null)?.dataset.v ?? def);
  const opts = { credits: pick('creditopts', 5000), crystalMul: pick('crystalopts', 1), nova: pick('novaopts', 0) };
  document.getElementById('briefing')!.style.display = 'none';
  try {
    await startGame(n, opts);
  } catch (err) {
    // never fail silently into a black screen
    console.error(err);
    alert('Failed to start: ' + err);
    location.reload();
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
(window as any).novaDebug = game;
(window as any).novaInput = inputMod;

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
