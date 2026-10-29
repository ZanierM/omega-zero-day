// Campaign mission runner. A mission is data plus a few small script functions
// (see missions.ts); this file wires it into the game's mission hooks, keeps
// the objective list and comms queue, and tracks campaign progress.
// Everything it remembers lives in `run`, which is plain data so it saves.

import { PLAYER, TILE, FACTION_NAMES, BUILDINGS } from '../config';
import * as game from '../game';
import {
  units, buildings, players, spawnUnit, placeBuilding, issueOrder, centerOfTile, buildingCenter,
  initGame, ensureFaction, mission, resetMission, gameEvents, GameEvent, stats, explored, toast, pings, Unit,
} from '../game';
import { generateMap, seedMap, startBases, neutralSpots, terrain, occupied, idx, inBounds, MAP_W, MAP_H, nearestTile } from '../map';
import { initAI } from '../ai';
import { centerCameraOn } from '../input';
import { MISSIONS, MissionDef } from './missions';

// ---------- run state (saved with the match) ----------
export interface RunState {
  id: string;
  t: number;                               // mission time (s)
  fired: string[];                         // triggers that have run
  done: string[];                          // objectives completed
  shown: string[];                         // hidden objectives that have been revealed
  vars: Record<string, number>;            // per-mission counters and timers
  groups: Record<string, number[]>;        // named sets of unit ids (waves, ambushes)
  flux0: number;                           // stats.flux when the mission started
}
let run: RunState | null = null;
let def: MissionDef | null = null;

// ---------- comms ----------
export interface CommLine { who: Speaker; text: string }
export type Speaker = 'varga' | 'okoye' | 'lind' | 'kessler' | 'seren' | 'reyes';
export const SPEAKERS: Record<Speaker, { name: string; role: string; color: string }> = {
  varga:   { name: 'Adm. Ines Varga',   role: 'Ark-fleet command',    color: '#e8c66a' },
  okoye:   { name: 'Sgt. Mara Okoye',   role: 'Helion ground lead',   color: '#4db8ff' },
  lind:    { name: 'Dr. Teodor Lind',   role: 'Flux engineering',     color: '#43f3ec' },
  kessler: { name: 'Marshal Kessler',   role: 'Kessler Collective',   color: '#e58a3a' },
  reyes:   { name: 'Speaker Ama Reyes', role: 'Verdant Pact',         color: '#57c46a' },
  seren:   { name: 'Unknown signal',    role: 'source: under the crust', color: '#bfeef2' },
};
const queue: CommLine[] = [];
let current: (CommLine & { ttl: number }) | null = null;
export function say(who: Speaker, text: string) { queue.push({ who, text }); }
export function currentComm(): (CommLine & { ttl: number }) | null { return current; }
export function skipComm() { if (current) current.ttl = 0; }
function tickComms(dt: number) {
  if (current && (current.ttl -= dt) > 0) return;
  const next = queue.shift();
  current = next ? { ...next, ttl: 3.2 + next.text.length * 0.045 } : null;
}

// ---------- the context missions script against ----------
export interface Ctx {
  run: RunState;
  t: number;
  done(id: string): boolean;
  say: typeof say;
  /** Place a building on the nearest clear spot to a tile. */
  place(defId: string, owner: number, tx: number, ty: number): game.Building | null;
  /** Spawn units around a tile, optionally into a named group. */
  spawn(defIds: string[], owner: number, tx: number, ty: number, group?: string): Unit[];
  alive(group: string): Unit[];
  attackMove(us: Unit[], x: number, y: number): void;
  base(owner: number): { tx: number; ty: number };
  vents(): { tx: number; ty: number }[];
  towers(): { tx: number; ty: number }[];
  buildingsOf(owner: number, defId?: string): game.Building[];
  unitsOf(owner: number): Unit[];
  flux(): number;                          // flux the player has delivered this mission
  reveal(tx: number, ty: number, r: number): void;
  ping(tx: number, ty: number, color?: string): void;
}

function tileClear(defW: number, defH: number, tx: number, ty: number) {
  for (let y = ty; y < ty + defH; y++) for (let x = tx; x < tx + defW; x++) {
    if (!inBounds(x, y) || terrain[idx(x, y)] !== 0 || occupied[idx(x, y)] !== -1) return false;
  }
  return true;
}

function makeCtx(): Ctx {
  const r = run!;
  return {
    run: r, t: r.t,
    done: id => r.done.includes(id),
    say,
    place(defId, owner, tx, ty) {
      const b = BUILDINGS[defId];
      const spot = nearestTile(tx, ty, 12, (x, y) => tileClear(b.w + 1, b.h + 1, x - 1, y - 1));
      return spot ? placeBuilding(defId, owner, spot.x, spot.y) : null;
    },
    spawn(defIds, owner, tx, ty, group) {
      const out: Unit[] = [];
      for (const id of defIds) {
        const spot = nearestTile(tx, ty, 8, (x, y) => tileClear(1, 1, x, y) && !units.some(u => Math.hypot(u.x - centerOfTile(x), u.y - centerOfTile(y)) < TILE * 0.8));
        if (!spot) continue;
        out.push(spawnUnit(id, owner, centerOfTile(spot.x), centerOfTile(spot.y)));
      }
      if (group) (r.groups[group] ??= []).push(...out.map(u => u.id));
      return out;
    },
    alive: group => (r.groups[group] ?? []).map(id => game.byId.get(id)).filter((u): u is Unit => !!u && u.kind === 'unit'),
    attackMove(us, x, y) { for (const u of us) issueOrder(u, { type: 'attackMove', x: x + (Math.random() * 120 - 60), y: y + (Math.random() * 120 - 60) }); },
    base: owner => ({ tx: startBases[owner]?.x ?? MAP_W / 2, ty: startBases[owner]?.y ?? MAP_H / 2 }),
    vents: () => neutralSpots.filter(n => n.kind === 'vent').map(n => ({ tx: n.x, ty: n.y })),
    towers: () => neutralSpots.filter(n => n.kind === 'tower').map(n => ({ tx: n.x, ty: n.y })),
    buildingsOf: (owner, defId) => buildings.filter(b => b.owner === owner && !b.def.isWall && (!defId || b.def.id === defId)),
    unitsOf: owner => units.filter(u => u.owner === owner),
    flux: () => stats.flux - r.flux0,
    reveal(tx, ty, rad) {
      for (let y = ty - rad; y <= ty + rad; y++) for (let x = tx - rad; x <= tx + rad; x++)
        if (inBounds(x, y) && Math.hypot(x - tx, y - ty) <= rad) explored[idx(x, y)] = 1;
    },
    ping(tx, ty, color = '#ffb02e') { pings.push({ x: centerOfTile(tx), y: centerOfTile(ty), t: 0, color }); },
  };
}

// ---------- objectives (for the tracker) ----------
export interface ObjectiveView { text: string; done: boolean; optional: boolean }
export function objectives(): ObjectiveView[] {
  if (!def || !run) return [];
  const c = makeCtx();
  return def.objectives
    .filter(o => !o.hidden || run!.shown.includes(o.id))
    .map(o => ({ text: typeof o.text === 'function' ? o.text(c) : o.text, done: run!.done.includes(o.id), optional: !!o.optional }));
}
export function missionTitle() { return def ? `${def.code} · ${def.title}` : ''; }
export function activeMission() { return def; }

// ---------- lifecycle ----------
let checkTimer = 0;
function tick(dt: number) {
  if (!run || !def) return;
  run.t += dt;
  tickComms(dt);
  checkTimer -= dt;
  if (checkTimer > 0) return;
  checkTimer = 0.25;
  const c = makeCtx();
  def.update?.(c, 0.25);
  for (const o of def.objectives) {
    if (run.done.includes(o.id)) continue;
    if (o.hidden && !run.shown.includes(o.id)) continue;
    if (o.check(c)) { run.done.push(o.id); if (!o.optional) toast(`Objective complete: ${typeof o.text === 'function' ? o.text(c) : o.text}`); }
  }
  for (const tr of def.triggers) {
    if (run.fired.includes(tr.id) || !tr.when(c)) continue;
    run.fired.push(tr.id);
    tr.run(c);
  }
}
export function reveal(id: string) { if (run && !run.shown.includes(id)) run.shown.push(id); }

function checkEnd(): 'win' | 'lose' | null {
  if (!run || !def) return null;
  const c = makeCtx();
  if (def.lose?.(c)) return 'lose';
  if (def.win(c)) { markComplete(def.id); return 'win'; }
  return null;
}

function onEvent(ev: GameEvent) { if (def?.onEvent && run) def.onEvent(makeCtx(), ev); }

function install(d: MissionDef, r: RunState) {
  def = d; run = r;
  queue.length = 0; current = null; checkTimer = 0;
  resetMission();
  mission.active = true;
  mission.corridor = false;
  mission.allowed = new Set(d.allowed);
  mission.tick = tick;
  mission.checkEnd = checkEnd;
  gameEvents.length = 0;
  gameEvents.push(onEvent);
}

/** Build the mission's world. The caller loads sprites, paints the ground and starts the loop. */
export function setupMission(id: string) {
  const d = MISSIONS.find(m => m.id === id);
  if (!d) throw new Error(`Unknown mission ${id}`);
  seedMap(d.seed);
  generateMap(d.enemies, d.crystalMul ?? 1);
  initGame(d.enemies);
  ensureFaction(4);   // the Hollow's slot exists in every mission, used or not
  game.setSupernova(0);
  install(d, { id, t: 0, fired: [], done: [], shown: [], vars: {}, groups: {}, flux0: 0 });
  for (const p of players) p.credits = 0;
  players[PLAYER].credits = d.credits;
  const c = makeCtx();
  d.setup(c);
  initAI(d.enemies, 'normal', d.aiOwners ?? []);
  const hq = buildings.find(b => b.owner === PLAYER);
  if (hq) { const p = buildingCenter(hq); centerCameraOn(p.x, p.y); }
  run!.flux0 = stats.flux;
}
export function bootComms() { if (def && run) def.intro(makeCtx()); }

// ---------- save / resume ----------
export function snapshotRun(): RunState | null { return run && JSON.parse(JSON.stringify(run)); }
export function resumeRun(r: RunState) {
  const d = MISSIONS.find(m => m.id === r.id);
  if (!d) return;
  install(d, JSON.parse(JSON.stringify(r)));
  ensureFaction(4);
}
export function endRun() { def = null; run = null; queue.length = 0; current = null; resetMission(); gameEvents.length = 0; }

// ---------- progress ----------
const KEY = 'ozd-campaign';
export function progress(): { done: string[] } {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '') ?? { done: [] }; } catch { return { done: [] }; }
}
function markComplete(id: string) {
  const p = progress();
  if (!p.done.includes(id)) p.done.push(id);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage may be unavailable */ }
}
export function unlocked(id: string) {
  const i = MISSIONS.findIndex(m => m.id === id);
  return i === 0 || progress().done.includes(MISSIONS[i - 1]?.id);
}
export { MISSIONS, FACTION_NAMES };
