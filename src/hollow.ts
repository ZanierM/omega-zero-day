// The Hollow's AI, for skirmish: the Meridian's descendants defending their
// tunnels. They grow Geodes on the crystal fields, dig Tunnel Mouths and raise
// Echo Spires round their hearth, and raid whoever is nearest, half of each
// raid burrowing up right beside the target. They never fight the Vey's own
// (the brood, the Keepers): see `hostile` in config.ts.

import { HOLLOW, TILE, BUILDINGS, UNITS, hostile } from './config';
import { buildings, units, players, placeBuilding, spawnUnit, issueOrder, buildingCenter, translocate, hollowIncome, openTunnel, centerOfTile, Unit } from './game';
import { crystal, idx, nearestTile } from './map';
import { clearSpot } from './keepers';

export interface HollowState { on: boolean; clock: number; power: number; grow: number; rise: number; raid: number; next?: string; hp: Record<number, number> }
let st: HollowState = fresh(false, 1);
function fresh(on: boolean, power: number): HollowState { return { on, clock: 0, power, grow: 6, rise: 5, raid: 140, hp: {} }; }
export function initHollow(on: boolean, power = 1) { st = fresh(on, power); }
export function snapshotHollow(): HollowState { return JSON.parse(JSON.stringify(st)); }
export function restoreHollow(s?: HollowState) { st = s ? { ...fresh(s.on, s.power ?? 1), ...s } : fresh(false, 1); }

const mine = (id?: string) => buildings.filter(b => b.owner === HOLLOW && (!id || b.def.id === id));
const hearth = () => mine('hearthstone')[0] ?? mine()[0];
const army = () => units.filter(u => u.owner === HOLLOW);

function raise(id: string, at: { x: number, y: number } | null): boolean {
  const p = players[HOLLOW];
  if (!at || p.credits < BUILDINGS[id].cost) return false;
  p.credits -= BUILDINGS[id].cost;
  placeBuilding(id, HOLLOW, at.x, at.y);
  return true;
}
// a clear spot for a growth near `near` (with a lane round it so the kin can get out)
const spotFor = (id: string, near: { x: number, y: number }, r: number) => clearSpot(id, near, r);

function growStep() {
  const h = hearth(); if (!h) return;
  const hc = { x: h.tx + 1, y: h.ty + 1 }, t = st.clock;
  const geodes = mine('geode');
  if (geodes.length < Math.min(4, 1 + Math.floor(t / 120))) {
    const field = nearestTile(hc.x, hc.y, 22, (x, y) => crystal[idx(x, y)] > 0 && !geodes.some(g => Math.hypot(g.tx - x, g.ty - y) < 8));
    if (field && raise('geode', spotFor('geode', field, 5))) return;
  }
  if (mine('tunnelmouth').length < Math.min(3, 1 + Math.floor(t / 180))) { if (raise('tunnelmouth', spotFor('tunnelmouth', { x: hc.x + 4, y: hc.y + 4 }, 9))) return; }
  if (t > 220 && !mine('grotto').length) { if (raise('grotto', spotFor('grotto', { x: hc.x - 5, y: hc.y + 2 }, 8))) return; }
  const holdings = [h, ...mine('geode')];
  if (mine('echo').length < Math.min(9, 2 + Math.floor(t / 80))) {
    const at = holdings[mine('echo').length % holdings.length];
    raise('echo', spotFor('echo', { x: at.tx + (Math.random() < 0.5 ? -2 : at.def.w + 1), y: at.ty + Math.floor(Math.random() * 3) }, 4));
  }
}

function pick(): string {
  const t = st.clock, cairns = army().filter(u => u.def.id === 'cairn').length;
  const w: [string, number][] = [['shardkin', 4], ['burrower', t > 60 ? 2 : 0], ['delver', t > 60 ? 2 : 0], ['choir', t > 90 && !army().some(u => u.def.id === 'choir') ? 2 : 0.6],
    ['cairn', t > 300 && cairns < 3 ? 0.8 : 0]];
  let r = Math.random() * w.reduce((s, [, v]) => s + v, 0);
  for (const [id, v] of w) if ((r -= v) <= 0) return id;
  return 'shardkin';
}
function riseStep() {
  if (army().length >= Math.min(30, 8 + Math.floor(st.clock / 40))) return;
  const p = players[HOLLOW], id = st.next ??= pick();
  if (p.credits < UNITS[id].cost) return;
  p.credits -= UNITS[id].cost; st.next = undefined;
  const gates = [hearth(), ...mine('tunnelmouth')].filter(Boolean), g = gates[Math.floor(Math.random() * gates.length)]!;
  const c = buildingCenter(g);
  spawnUnit(id, HOLLOW, c.x + (Math.random() - 0.5) * 40, c.y + TILE * 1.8);
}

function raidStep() {
  const ready = army().filter(u => u.order.type === 'idle' || u.order.type === 'move');
  if (ready.length < 6) { st.raid = 20; return; }
  st.raid = (70 + Math.random() * 30) / st.power;
  const h = hearth(); const home = h ? buildingCenter(h) : { x: 0, y: 0 };
  let tgt: { x: number, y: number } | null = null, bd = Infinity;
  for (const b of buildings) {
    if (!hostile(HOLLOW, b.owner) || b.def.isWall || b.def.trap) continue;
    const c = buildingCenter(b), d = Math.hypot(c.x - home.x, c.y - home.y);
    if (d < bd) { bd = d; tgt = c; }
  }
  if (!tgt) return;
  const group = ready.slice(0, 5 + Math.floor(st.clock / 100));
  // the diggers come up out of the ground beside the target; the rest walk
  const dx = home.x - tgt.x, dy = home.y - tgt.y, d = Math.hypot(dx, dy) || 1;
  translocate(group.filter(u => u.def.ability?.id === 'burrow').slice(0, Math.ceil(group.length / 2)), tgt.x + dx / d * TILE * 5, tgt.y + dy / d * TILE * 5);
  for (const u of group) issueOrder(u, { type: 'attackMove', x: tgt.x + (Math.random() - 0.5) * 60, y: tgt.y + (Math.random() - 0.5) * 60 });
}

function defendStep() {
  for (const b of mine()) {
    const was = st.hp[b.id] ?? b.hp; st.hp[b.id] = b.hp;
    if (b.hp >= was - 1) continue;
    const c = buildingCenter(b);
    for (const u of army().filter(u => u.order.type === 'idle' || u.order.type === 'move').slice(0, 8)) issueOrder(u, { type: 'attackMove', x: c.x, y: c.y });
  }
  for (const id in st.hp) if (!buildings.some(b => b.id === +id)) delete st.hp[id];
}

let defendTimer = 0;
export function updateHollow(dt: number) {
  if (!st.on || !hearth()) return;
  st.clock += dt;
  players[HOLLOW].credits += hollowIncome(HOLLOW) * 1.3 * st.power * dt;
  if ((st.grow -= dt) <= 0) { st.grow = 8 / st.power; growStep(); }
  if ((st.rise -= dt) <= 0) { st.rise = Math.max(3, 8 - 1.5 * mine('tunnelmouth').length) / st.power; riseStep(); }
  if ((st.raid -= dt) <= 0) raidStep();
  if ((defendTimer -= dt) <= 0) { defendTimer = 1.5; defendStep(); }
}

/** The Hollow come up: a hearth in the rock and a first band of kin. */
export function seedHollow(at: { x: number, y: number }, credits = 1500): Unit[] {
  players[HOLLOW].credits = credits;
  placeBuilding('hearthstone', HOLLOW, at.x, at.y);
  const c = { x: centerOfTile(at.x + 1), y: centerOfTile(at.y + 1) };
  openTunnel(at.x + 1, at.y + 4);
  return ['shardkin', 'shardkin', 'shardkin', 'shardkin', 'burrower', 'choir'].map((id, k) => spawnUnit(id, HOLLOW, c.x + Math.cos(k * 1.1) * TILE * 2.6, c.y + TILE * 2.4 + Math.sin(k * 1.1) * TILE));
}
