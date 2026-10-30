// The Vey brood's AI. It doesn't build or research like the human factions:
// it grows structures on its own living ground, hatches units from its pods,
// and throws swarms at whatever is nearest. See BUILDINGS/UNITS in config.ts
// (nonBuildable entries) and the bloom in game.ts.

import { BROOD, TILE, BUILDINGS, UNITS, hostile } from './config';
import {
  buildings, units, players, placeBuilding, spawnUnit, issueOrder, buildingCenter, canPlace, onBloom, neutrals,
  centerOfTile, Building, Unit,
} from './game';
import { crystal, idx, inBounds, MAP_W, MAP_H } from './map';

export interface BroodState {
  on: boolean;
  clock: number;
  growTimer: number;
  waveTimer: number;
  hatch: Record<number, number>;    // pod id → seconds to its next hatch
  next: Record<number, string>;     // pod id → what it is growing (it saves up for it)
  hp: Record<number, number>;       // structure id → hp last check (to notice attacks)
  power: number;                    // difficulty multiplier on income and growth
  saving?: boolean;                 // holding flux back for a growth it wants
}
let st: BroodState = fresh(false, 1);
function fresh(on: boolean, power: number): BroodState {
  return { on, clock: 0, growTimer: 6, waveTimer: 270, hatch: {}, next: {}, hp: {}, power };
}

export function initBrood(on: boolean, power = 1) { st = fresh(on, power); }
export function broodActive() { return st.on; }
export function snapshotBrood(): BroodState { return JSON.parse(JSON.stringify(st)); }
export function restoreBrood(s?: BroodState) { st = s ? { ...fresh(s.on, s.power ?? 1), ...s } : fresh(false, 1); }

const mine = (id?: string) => buildings.filter(b => b.owner === BROOD && (!id || b.def.id === id));
const heart = () => mine('heart')[0] ?? mine()[0];
const army = () => units.filter(u => u.owner === BROOD);

// nearest structure of any other faction (the brood hates everyone equally)
function nearestEnemyBuilding(x: number, y: number): Building | null {
  let best: Building | null = null, bd = Infinity;
  for (const b of buildings) {
    if (!hostile(BROOD, b.owner) || b.def.isWall) continue;
    const c = buildingCenter(b), d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// tiles of living ground that touch bare ground: where the brood can push next
function bloomEdge(): { x: number, y: number }[] {
  const out: { x: number, y: number }[] = [];
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (!onBloom(x, y)) continue;
    if (!onBloom(x + 1, y) || !onBloom(x - 1, y) || !onBloom(x, y + 1) || !onBloom(x, y - 1)) out.push({ x, y });
  }
  return out;
}

// somewhere on its own ground for a new growth, as close to `goal` as it can get
function growSpot(defId: string, goal: { x: number, y: number }, maxFromGoal = Infinity): { x: number, y: number } | null {
  const def = BUILDINGS[defId];
  let best: { x: number, y: number } | null = null, bd = Infinity;
  for (let y = 0; y < MAP_H - def.h; y++) for (let x = 0; x < MAP_W - def.w; x++) {
    if (!onBloom(x, y) || !onBloom(x + def.w - 1, y + def.h - 1)) continue;
    const d = Math.hypot(x - goal.x, y - goal.y);
    if (d >= bd || d > maxFromGoal) continue;
    if (!canPlace(BROOD, defId, x, y, false)) continue;
    // keep a lane between the big growths so its own swarms can get out (bulbs can sit anywhere)
    if (def.w > 1 && buildings.some(b => b.owner === BROOD && b.def.w > 1 && x < b.tx + b.def.w + 1 && x + def.w + 1 > b.tx && y < b.ty + b.def.h + 1 && y + def.h + 1 > b.ty)) continue;
    bd = d; best = { x, y };
  }
  return best;
}

function grow(id: string, at: { x: number, y: number } | null): boolean {
  const p = players[BROOD];
  if (!at || p.credits < BUILDINGS[id].cost) return false;
  p.credits -= BUILDINGS[id].cost;
  placeBuilding(id, BROOD, at.x, at.y);
  return true;
}

function growStep() {
  const h = heart();
  if (!h) return;
  const hc = { x: h.tx + 1, y: h.ty + 1 };
  const enemy = nearestEnemyBuilding(centerOfTile(hc.x), centerOfTile(hc.y));
  const enemyT = enemy ? { x: enemy.tx, y: enemy.ty } : { x: MAP_W / 2, y: MAP_H / 2 };
  const pods = mine('broodpod').length, wells = mine('veinwell').length, spires = mine('spinespire').length;
  const t = st.clock;
  const food = [
    ...neutrals.filter(n => n.kind === 'vent').map(n => ({ x: n.tx, y: n.ty })),
    ...crystalSpots(),
  ].filter(f => !mine('veinwell').some(w => Math.hypot(w.tx - f.x, w.ty - f.y) < 6))
   .sort((a, b) => Math.hypot(a.x - hc.x, a.y - hc.y) - Math.hypot(b.x - hc.x, b.y - hc.y));
  const wantWells = Math.min(6, 1 + Math.floor(t / 100));
  st.saving = false;
  // 1. feed itself: a well on the nearest crystal or vent the bloom reaches
  if (wells < wantWells && food[0]) {
    const at = growSpot('veinwell', food[0], 6);
    if (at) { if (!grow('veinwell', at)) st.saving = true; return; }
  }
  // 2. pods, as many as its wells can feed
  if (pods < Math.min(5, 1 + Math.floor(t / 150), 1 + wells * 2)) {
    const at = growSpot('broodpod', hc);
    if (at) { if (!grow('broodpod', at)) st.saving = true; return; }
  }
  // 3. reach for food it can't touch yet, then toward the enemy
  const reaching = wells < wantWells && !!food[0];
  if (reaching || mine('bloomnode').length < Math.min(28, 4 + Math.floor(t / 35))) {
    const goal = reaching ? food[0] : enemyT;
    // much of the edge runs over crystal, where nothing takes root: try the closest few spots in turn
    const edges = bloomEdge().sort((a, b) => Math.hypot(a.x - goal.x, a.y - goal.y) - Math.hypot(b.x - goal.x, b.y - goal.y));
    for (const e of edges.slice(0, 16)) {
      const at = growSpot('bloomnode', e, 2);
      if (at) { if (grow('bloomnode', at) || reaching) return; break; }
    }
  }
  // 4. spires on the edge facing the enemy
  if (spires < Math.min(10, 2 + Math.floor(t / 100))) grow('spinespire', growSpot('spinespire', enemyT));
}

// a sample of crystal tiles (one per 6×6 patch) as places worth spreading to
function crystalSpots(): { x: number, y: number }[] {
  const out: { x: number, y: number }[] = [];
  for (let y = 3; y < MAP_H; y += 6) for (let x = 3; x < MAP_W; x += 6) if (inBounds(x, y) && crystal[idx(x, y)] > 0) out.push({ x, y });
  return out;
}

// what a pod hatches: swarmers first, heavier things as the brood matures
function hatchPick(): string {
  const t = st.clock, n = army();
  const behemoths = n.filter(u => u.def.id === 'behemoth').length;
  const w: [string, number][] = [
    ['skitter', 5], ['spitter', t > 60 ? 3 : 0], ['lurker', t > 120 ? 2 : 0], ['stalker', t > 150 ? 2 : 0], ['nurse', t > 200 && !n.some(u => u.def.id === 'nurse') ? 1.5 : 0],
    ['carapace', t > 180 ? 2 : 0], ['moth', t > 240 ? 1.5 : 0],
    ['behemoth', t > 480 && behemoths < 2 ? 0.6 : 0],
  ];
  let r = Math.random() * w.reduce((s, [, v]) => s + v, 0);
  for (const [id, v] of w) if ((r -= v) <= 0) return id;
  return 'skitter';
}

function hatchStep(dt: number) {
  const p = players[BROOD];
  const cap = Math.min(70, 24 + Math.floor(st.clock / 25));
  let count = army().length;
  for (const pod of mine('broodpod')) {
    st.hatch[pod.id] = (st.hatch[pod.id] ?? 3) - dt;
    if (st.hatch[pod.id] > 0 || count >= cap) continue;
    const id = st.next[pod.id] ??= hatchPick(), def = UNITS[id];
    if (p.credits < def.cost + (st.saving ? 180 : 0)) continue;   // keep growing the same thing until it can be fed
    p.credits -= def.cost;
    delete st.next[pod.id];
    st.hatch[pod.id] = (4 + def.cost / 220) * (st.clock < 240 ? 1.7 : 1);   // big things take longer; a young brood is slow
    const c = buildingCenter(pod);
    const u = spawnUnit(id, BROOD, c.x + (Math.random() - 0.5) * 30, c.y + TILE * 1.4);
    count++;
    // gather at the edge of the bloom facing the enemy
    const e = nearestEnemyBuilding(c.x, c.y);
    if (e) {
      const ec = buildingCenter(e), d = Math.hypot(ec.x - c.x, ec.y - c.y) || 1;
      issueOrder(u, { type: 'move', x: c.x + (ec.x - c.x) / d * TILE * 6, y: c.y + (ec.y - c.y) / d * TILE * 6 });
    }
  }
}

function waveStep() {
  const h = heart();
  if (!h) return;
  const n = army().filter(u => u.order.type === 'idle' || u.order.type === 'move');
  if (n.length < 10 + Math.floor(st.clock / 90)) return;
  st.waveTimer = 38 + Math.random() * 18;
  // a few stay home; the rest pour out
  const hc = buildingCenter(h);
  n.sort((a, b) => Math.hypot(a.x - hc.x, a.y - hc.y) - Math.hypot(b.x - hc.x, b.y - hc.y));
  const go = n.slice(4);
  // a third of the swarms go for harvesters; the rest for the nearest structure
  const harv = Math.random() < 0.33 ? units.filter(u => hostile(BROOD, u.owner) && u.def.harvester).sort((a, b) => Math.hypot(a.x - hc.x, a.y - hc.y) - Math.hypot(b.x - hc.x, b.y - hc.y))[0] : undefined;
  const tgt = harv ? { x: harv.x, y: harv.y } : (() => { const e = nearestEnemyBuilding(hc.x, hc.y); return e ? buildingCenter(e) : null; })();
  if (!tgt) return;
  for (const u of go) issueOrder(u, { type: 'attackMove', x: tgt.x + (Math.random() - 0.5) * 140, y: tgt.y + (Math.random() - 0.5) * 140 });
}

// something hit a growth: everything idle nearby goes to it
function defendStep() {
  for (const b of mine()) {
    const was = st.hp[b.id] ?? b.hp;
    st.hp[b.id] = b.hp;
    if (b.hp >= was - 1) continue;
    const c = buildingCenter(b);
    const near = army().filter(u => (u.order.type === 'idle' || u.order.type === 'move') && Math.hypot(u.x - c.x, u.y - c.y) < TILE * 14).slice(0, 10);
    for (const u of near) issueOrder(u, { type: 'attackMove', x: c.x, y: c.y });
  }
  for (const id in st.hp) if (!buildings.some(b => b.id === +id)) delete st.hp[id];
}

let defendTimer = 0;
export function updateBrood(dt: number) {
  if (!st.on || !heart()) return;
  st.clock += dt;
  // it feeds through its wells and the heart itself
  players[BROOD].credits += (14 + 7 * mine('veinwell').length) * st.power * dt;
  st.growTimer -= dt;
  if (st.growTimer <= 0) { st.growTimer = 4 / st.power; growStep(); }
  hatchStep(dt * st.power);
  st.waveTimer -= dt;
  if (st.waveTimer <= 0) { st.waveTimer = 6; waveStep(); }
  defendTimer -= dt;
  if (defendTimer <= 0) { defendTimer = 1.5; defendStep(); }
}

/** Put a starting brood on the map: a Heart near `at` and a first handful of skitters. */
export function seedBrood(at: { x: number, y: number }): Unit[] {
  players[BROOD].credits = 2000;   // it needs no base: a small store of flux to wake on
  placeBuilding('heart', BROOD, at.x, at.y);
  const c = { x: centerOfTile(at.x + 1), y: centerOfTile(at.y + 1) };
  return Array.from({ length: 6 }, (_, k) => spawnUnit('skitter', BROOD, c.x + Math.cos(k) * TILE * 2.4, c.y + Math.sin(k) * TILE * 2.4));
}
