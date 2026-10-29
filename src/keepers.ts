// The Keepers' AI: the race that planted the Vey, come back to judge whoever
// is cutting it. Few units, each costly and shielded; small elite strike groups,
// part of which translocate next to their target in a column of light. They
// hunt the faction running the most harvesters. They never fight the Vey's own
// (the brood, the Hollow): see `hostile` in config.ts.

import { KEEPERS, TILE, BUILDINGS, UNITS, hostile } from './config';
import {
  buildings, units, players, placeBuilding, spawnUnit, issueOrder, buildingCenter, canPlace, neutrals,
  centerOfTile, lightColumns, stats, Building, Unit,
} from './game';
import { crystal, idx, inBounds, nearestTile, terrain, occupied, MAP_W, MAP_H } from './map';

export interface KeeperState {
  on: boolean; clock: number; power: number;
  arrive: number;          // seconds to the next unit arrival
  grow: number;            // seconds to the next structure
  strike: number;          // seconds to the next strike group
  next?: string;           // what is coming down the light next (saved up for)
  hp: Record<number, number>;
}
let st: KeeperState = fresh(false, 1);
function fresh(on: boolean, power: number): KeeperState { return { on, clock: 0, power, arrive: 4, grow: 8, strike: 150, hp: {} }; }
export function initKeepers(on: boolean, power = 1) { st = fresh(on, power); }
export function snapshotKeepers(): KeeperState { return JSON.parse(JSON.stringify(st)); }
export function restoreKeepers(s?: KeeperState) { st = s ? { ...fresh(s.on, s.power ?? 1), ...s } : fresh(false, 1); }

const mine = (id?: string) => buildings.filter(b => b.owner === KEEPERS && (!id || b.def.id === id));
const beacon = () => mine('beacon')[0] ?? mine()[0];
const army = () => units.filter(u => u.owner === KEEPERS);

// the faction doing the most cutting: most harvesters in the field
function worstCutter(): number {
  const n = new Map<number, number>();
  for (const u of units) if (u.def.harvester && hostile(KEEPERS, u.owner)) n.set(u.owner, (n.get(u.owner) ?? 0) + 1);
  let best = -1, bc = 0;
  for (const [o, c] of n) if (c > bc) { bc = c; best = o; }
  return best;
}

export function clearSpot(defId: string, near: { x: number, y: number }, r: number) {
  const def = BUILDINGS[defId];
  return nearestTile(near.x, near.y, r, (x, y) => {
    for (let yy = y - 1; yy <= y + def.h; yy++) for (let xx = x - 1; xx <= x + def.w; xx++)
      if (!inBounds(xx, yy) || terrain[idx(xx, yy)] !== 0 || occupied[idx(xx, yy)] !== -1) return false;
    return canPlace(KEEPERS, defId, x, y, false);
  });
}
function arriveBuilding(id: string, at: { x: number, y: number } | null): boolean {
  const p = players[KEEPERS];
  if (!at || p.credits < BUILDINGS[id].cost) return false;
  p.credits -= BUILDINGS[id].cost;
  placeBuilding(id, KEEPERS, at.x, at.y);
  return true;
}

function growStep() {
  const b = beacon(); if (!b) return;
  const bc = { x: b.tx + 1, y: b.ty + 1 }, t = st.clock;
  // shrines on the nearest vents and crystal, so they are fed by what they guard
  const shrines = mine('shrine');
  if (shrines.length < Math.min(4, 1 + Math.floor(t / 150))) {
    const food = [...neutrals.filter(n => n.kind === 'vent').map(n => ({ x: n.tx, y: n.ty })), ...crystalNear(bc, 18)]
      .filter(f => !shrines.some(s => Math.hypot(s.tx - f.x, s.ty - f.y) < 7))
      .sort((p, q) => Math.hypot(p.x - bc.x, p.y - bc.y) - Math.hypot(q.x - bc.x, q.y - bc.y));
    if (food[0] && arriveBuilding('shrine', clearSpot('shrine', food[0], 5))) return;
  }
  if (mine('sanctum').length < Math.min(3, 1 + Math.floor(t / 200))) { if (arriveBuilding('sanctum', clearSpot('sanctum', { x: bc.x + 4, y: bc.y + 3 }, 8))) return; }
  // ward obelisks around the beacon and each shrine
  const holdings = [b, ...mine('shrine')];
  if (mine('obelisk').length < Math.min(8, 2 + Math.floor(t / 90))) {
    const h = holdings[mine('obelisk').length % holdings.length];
    arriveBuilding('obelisk', clearSpot('obelisk', { x: h.tx + (Math.random() < 0.5 ? -2 : h.def.w + 1), y: h.ty + Math.floor(Math.random() * 3) }, 4));
  }
}
function crystalNear(c: { x: number, y: number }, r: number) {
  const out: { x: number, y: number }[] = [];
  for (let y = c.y - r; y <= c.y + r; y += 4) for (let x = c.x - r; x <= c.x + r; x += 4) if (inBounds(x, y) && crystal[idx(x, y)] > 0) out.push({ x, y });
  return out;
}

function pick(): string {
  const t = st.clock, mono = army().filter(u => u.def.id === 'monolith').length;
  const w: [string, number][] = [['acolyte', 4], ['lancer', t > 60 ? 2.5 : 0], ['luminar', t > 120 ? 1.4 : 0], ['monolith', t > 300 && mono < 3 ? 0.8 : 0]];
  let r = Math.random() * w.reduce((s, [, v]) => s + v, 0);
  for (const [id, v] of w) if ((r -= v) <= 0) return id;
  return 'acolyte';
}

function arriveStep() {
  const b = beacon(); if (!b) return;
  const p = players[KEEPERS];
  if (army().length >= Math.min(28, 6 + Math.floor(st.clock / 45))) return;
  const id = st.next ??= pick(), def = UNITS[id];
  if (p.credits < def.cost) return;
  p.credits -= def.cost; st.next = undefined;
  // down the light of the beacon or a sanctum
  const gates = [b, ...mine('sanctum')], g = gates[Math.floor(Math.random() * gates.length)];
  const c = buildingCenter(g);
  spawnUnit(id, KEEPERS, c.x + (Math.random() - 0.5) * 40, c.y + TILE * 1.6);
}

function strikeStep() {
  const ready = army().filter(u => u.order.type === 'idle' || u.order.type === 'move');
  if (ready.length < 5) { st.strike = 20; return; }
  st.strike = (65 + Math.random() * 25) / st.power;
  const victim = worstCutter();
  const prey = units.filter(u => u.def.harvester && u.owner === victim);
  const ext = buildings.filter(b => b.owner === victim && b.def.id === 'extractor');
  const b = beacon(); const home = b ? buildingCenter(b) : { x: 0, y: 0 };
  const near = (x: number, y: number) => Math.hypot(x - home.x, y - home.y);
  const tgt = prey.sort((p, q) => near(p.x, p.y) - near(q.x, q.y))[0] ?? ext.map(e => ({ ...buildingCenter(e), id: e.id })).sort((p, q) => near(p.x, p.y) - near(q.x, q.y))[0]
    ?? (() => { const e = buildings.filter(x => hostile(KEEPERS, x.owner) && !x.def.isWall).sort((p, q) => near(buildingCenter(p).x, buildingCenter(p).y) - near(buildingCenter(q).x, buildingCenter(q).y))[0]; return e ? buildingCenter(e) : null; })();
  if (!tgt) return;
  const group = ready.slice(0, 4 + Math.floor(st.clock / 120));
  // part of the group steps through the light and arrives beside the target
  const dx = home.x - tgt.x, dy = home.y - tgt.y, d = Math.hypot(dx, dy) || 1;
  const drop = { x: tgt.x + dx / d * TILE * 7, y: tgt.y + dy / d * TILE * 7 };
  const dropTile = nearestTile(Math.floor(drop.x / TILE), Math.floor(drop.y / TILE), 6, (x, y) => inBounds(x, y) && terrain[idx(x, y)] === 0 && occupied[idx(x, y)] === -1);
  group.forEach((u, i) => {
    if (dropTile && i % 2 === 0 && !u.def.air) {
      lightColumns.push({ x: u.x, y: u.y, born: stats.time });
      u.x = centerOfTile(dropTile.x) + (Math.random() - 0.5) * 50; u.y = centerOfTile(dropTile.y) + (Math.random() - 0.5) * 50;
      u.path = null;
      lightColumns.push({ x: u.x, y: u.y, born: stats.time });
    }
    issueOrder(u, { type: 'attackMove', x: tgt.x + (Math.random() - 0.5) * 60, y: tgt.y + (Math.random() - 0.5) * 60 });
  });
}

function defendStep() {
  for (const b of mine()) {
    const was = st.hp[b.id] ?? b.hp; st.hp[b.id] = b.hp;
    if (b.hp >= was - 1) continue;
    const c = buildingCenter(b);
    for (const u of army().filter(u => u.order.type === 'idle' || u.order.type === 'move').slice(0, 6)) issueOrder(u, { type: 'attackMove', x: c.x, y: c.y });
  }
  for (const id in st.hp) if (!buildings.some(b => b.id === +id)) delete st.hp[id];
}

let defendTimer = 0;
export function updateKeepers(dt: number) {
  if (!st.on || !beacon()) return;
  st.clock += dt;
  players[KEEPERS].credits += (16 + 10 * mine('shrine').length) * st.power * dt;
  if ((st.grow -= dt) <= 0) { st.grow = 7 / st.power; growStep(); }
  if ((st.arrive -= dt) <= 0) { st.arrive = Math.max(4, 10 - 2 * mine('sanctum').length) / st.power; arriveStep(); }
  if ((st.strike -= dt) <= 0) strikeStep();
  if ((defendTimer -= dt) <= 0) { defendTimer = 1.5; defendStep(); }
}

/** Bring the Keepers down: a beacon in a column of light, and a first escort. */
export function seedKeepers(at: { x: number, y: number }, credits = 2500): Unit[] {
  players[KEEPERS].credits = credits;
  placeBuilding('beacon', KEEPERS, at.x, at.y);
  const c = { x: centerOfTile(at.x + 1), y: centerOfTile(at.y + 1) };
  lightColumns.push({ x: c.x, y: c.y, born: stats.time });
  return ['acolyte', 'acolyte', 'acolyte', 'lancer'].map((id, k) => spawnUnit(id, KEEPERS, c.x + Math.cos(k * 1.6) * TILE * 2.6, c.y + TILE * 2.4 + Math.sin(k * 1.6) * TILE));
}

/** A clear 3×3 spot for a beacon, as far as it can get from everyone already on the map. */
export function keeperLandingSite(): { x: number, y: number } | null {
  const spots = [[6, 6], [MAP_W - 10, 6], [6, MAP_H - 10], [MAP_W - 10, MAP_H - 10], [MAP_W / 2 - 1, 6], [MAP_W / 2 - 1, MAP_H - 10], [6, MAP_H / 2 - 1], [MAP_W - 10, MAP_H / 2 - 1]]
    .map(([x, y]) => ({ x: Math.floor(x), y: Math.floor(y) }));
  const others = buildings.map(b => ({ x: b.tx, y: b.ty }));
  spots.sort((p, q) => Math.min(...others.map(o => Math.hypot(o.x - q.x, o.y - q.y))) - Math.min(...others.map(o => Math.hypot(o.x - p.x, o.y - p.y))));
  for (const s of spots) {
    const at = clearSpot('beacon', s, 8);
    if (at) return at;
  }
  return null;
}
