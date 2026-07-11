import {
  TILE, UNITS, BUILDINGS, UPGRADES, UnitDef, BuildingDef, Tab,
  START_CREDITS, HARVEST_RATE, HARVESTER_CAPACITY, LOW_POWER_SPEED, BUILD_RADIUS, PLAYER,
  WPN_BONUS, ARM_BONUS, DEF_BONUS, BLD_UPGRADE_COST, BLD_UPGRADE_HP, BLD_UPGRADE_DMG,
  REPAIR_COST, REPAIR_RATE,
} from './config';
import { MAP_W, MAP_H, terrain, crystal, occupied, idx, inBounds, nearestTile } from './map';
import { findPath } from './path';
import { sfx } from './audio';

// ---------- Entity types ----------

export interface Order {
  type: 'idle' | 'move' | 'attack' | 'attackMove' | 'harvest';
  x?: number; y?: number;        // pixel destination
  targetId?: number;             // entity id for attack orders
}

export interface Unit {
  id: number;
  kind: 'unit';
  def: UnitDef;
  owner: number;
  x: number; y: number;          // pixel position (center)
  hp: number;
  maxHp: number;                 // includes armor upgrades at build time
  path: { x: number, y: number }[] | null;
  order: Order;
  cooldown: number;
  cargo: number;                 // harvester load
  harvestState: 'toField' | 'harvesting' | 'toBase' | 'none';
  autoTargetId: number;          // acquired target when idle (-1 none)
  repathTimer: number;
  facing: number;                // radians, for drawing
}

export interface Building {
  id: number;
  kind: 'building';
  def: BuildingDef;
  owner: number;
  tx: number; ty: number;        // top-left tile
  hp: number;
  maxHp: number;
  level: number;                 // 1..3, raised by upgrades
  upgrading: { remaining: number, total: number } | null;
  repairing: boolean;
  charge: number;                // superweapon: seconds until the strike is ready (0 = ready)
  cooldown: number;              // turret reload
  rallyX: number; rallyY: number;
  facing: number;                // turret barrel angle
}

export type Entity = Unit | Building;

export interface QueueItem {
  defId: string;
  kind: 'building' | 'unit' | 'upgrade';
  total: number;      // build time seconds
  remaining: number;
  ready: boolean;     // buildings only: finished, awaiting placement
}

export interface PlayerState {
  credits: number;
  // RA2-style: each tab works one item at a time, the rest wait in line
  queues: Record<Tab, QueueItem[]>;
  upgrades: Set<string>;   // researched upgrade ids
}

function freshPlayer(): PlayerState {
  return {
    credits: START_CREDITS,
    queues: { build: [], def: [], inf: [], veh: [], ups: [] },
    upgrades: new Set(),
  };
}

// ---------- Global state ----------

let nextId = 1;
export const units: Unit[] = [];
export const buildings: Building[] = [];
export const byId = new Map<number, Entity>();
export let players: PlayerState[] = [];
export let numPlayers = 2;

export let explored: Uint8Array;
export let visible: Uint8Array;

// supernova countdown: total > 0 arms it. When the clock hits zero the sun
// detonates and you lose unless every enemy is already destroyed.
export let novaTotal = 0, novaLeft = 0;
let flareTimer = 0;
export function setSupernova(seconds: number) { novaTotal = seconds; novaLeft = seconds; }

export function initGame(numEnemies: number) {
  numPlayers = numEnemies + 1;
  players = Array.from({ length: numPlayers }, freshPlayer);
  explored = new Uint8Array(MAP_W * MAP_H);
  visible = new Uint8Array(MAP_W * MAP_H);
  flareTimer = 0;
}

export interface Beam { x1: number, y1: number, x2: number, y2: number, ttl: number, color: string }
export interface Boom { x: number, y: number, r: number, ttl: number, max: number }
export interface Shell {
  x: number, y: number, sx: number, sy: number, tx: number, ty: number,
  t: number, dur: number, dmg: number, splash: number, owner: number, kind: 'shell' | 'rocket',
}
// an orbital strike telegraphs a reticle, then a beam slams down and detonates
export interface Strike { x: number, y: number, t: number, delay: number, owner: number, damage: number, radius: number }
export const beams: Beam[] = [];
export const booms: Boom[] = [];
export const shells: Shell[] = [];
export const strikes: Strike[] = [];

export let gameOver: 'win' | 'lose' | null = null;
export let paused = true; // starts paused behind the mission briefing
export function setPaused(v: boolean) { paused = v; }
export let toastMsg = { text: '', ttl: 0 };
export function toast(text: string) { toastMsg = { text, ttl: 3 }; }

// ---------- Helpers ----------

export const tileOf = (px: number) => Math.floor(px / TILE);
export const centerOfTile = (t: number) => t * TILE + TILE / 2;

export function buildingCenter(b: Building) {
  return { x: (b.tx + b.def.w / 2) * TILE, y: (b.ty + b.def.h / 2) * TILE };
}

export function entityPos(e: Entity) {
  return e.kind === 'unit' ? { x: e.x, y: e.y } : buildingCenter(e);
}

export function entityRadius(e: Entity) {
  return e.kind === 'unit' ? e.def.radius : Math.max(e.def.w, e.def.h) * TILE * 0.5;
}

export function entityMaxHp(e: Entity) {
  return e.maxHp;
}

export function distBetween(a: Entity, b: Entity) {
  const pa = entityPos(a), pb = entityPos(b);
  return Math.max(0, Math.hypot(pa.x - pb.x, pa.y - pb.y) - entityRadius(b));
}

export function powerOf(owner: number) {
  let supply = 0, drain = 0;
  for (const b of buildings) {
    if (b.owner !== owner) continue;
    if (b.def.power > 0) supply += b.def.power; else drain -= b.def.power;
  }
  return { supply, drain, low: drain > supply };
}

export function hasBuilding(owner: number, defId: string) {
  return buildings.some(b => b.owner === owner && b.def.id === defId);
}

// upgrade level helpers: counts researched tiers of a line, e.g. 'wpn' → 0..3
function upLevel(owner: number, line: string): number {
  let n = 0;
  for (const id of players[owner].upgrades) if (id.startsWith(line)) n++;
  return n;
}
export function weaponMult(owner: number) { return 1 + upLevel(owner, 'wpn') * WPN_BONUS; }
export function armorMult(owner: number) { return 1 + upLevel(owner, 'arm') * ARM_BONUS; }
export function turretMult(owner: number) { return 1 + upLevel(owner, 'def') * DEF_BONUS; }

// ---------- Spawning ----------

export function spawnUnit(defId: string, owner: number, px: number, py: number): Unit {
  const def = UNITS[defId];
  const hp = Math.round(def.hp * armorMult(owner));
  const u: Unit = {
    id: nextId++, kind: 'unit', def, owner, x: px, y: py, hp, maxHp: hp,
    path: null, order: { type: 'idle' }, cooldown: 0, cargo: 0,
    harvestState: def.harvester ? 'toField' : 'none',
    autoTargetId: -1, repathTimer: 0, facing: 0,
  };
  units.push(u);
  byId.set(u.id, u);
  return u;
}

export function canPlace(owner: number, defId: string, tx: number, ty: number, requireProximity = true): boolean {
  const def = BUILDINGS[defId];
  for (let y = ty; y < ty + def.h; y++)
    for (let x = tx; x < tx + def.w; x++) {
      if (!inBounds(x, y)) return false;
      const i = idx(x, y);
      if (terrain[i] !== 0 || occupied[i] !== -1 || crystal[i] > 0) return false;
      for (const u of units) {
        if (tileOf(u.x) === x && tileOf(u.y) === y) return false;
      }
    }
  if (requireProximity) {
    let near = false;
    for (const b of buildings) {
      if (b.owner !== owner) continue;
      const dx = Math.max(b.tx - (tx + def.w - 1), tx - (b.tx + b.def.w - 1), 0);
      const dy = Math.max(b.ty - (ty + def.h - 1), ty - (b.ty + b.def.h - 1), 0);
      if (Math.hypot(dx, dy) <= BUILD_RADIUS) { near = true; break; }
    }
    if (!near) return false;
  }
  return true;
}

export function placeBuilding(defId: string, owner: number, tx: number, ty: number): Building {
  const def = BUILDINGS[defId];
  const b: Building = {
    id: nextId++, kind: 'building', def, owner, tx, ty, hp: def.hp, maxHp: def.hp, level: 1, upgrading: null, repairing: false,
    charge: def.superweapon ? def.superweapon.charge : 0, cooldown: 0,
    rallyX: (tx + def.w / 2) * TILE, rallyY: (ty + def.h + 1) * TILE, facing: Math.PI / 2,
  };
  buildings.push(b);
  byId.set(b.id, b);
  for (let y = ty; y < ty + def.h; y++)
    for (let x = tx; x < tx + def.w; x++) occupied[idx(x, y)] = b.id;
  if (def.grantsHarvester) {
    const spot = nearestTile(tx + def.w, ty + def.h, 8, (x, y) => inBounds(x, y) && terrain[idx(x, y)] === 0 && occupied[idx(x, y)] === -1);
    if (spot) spawnUnit('harvester', owner, centerOfTile(spot.x), centerOfTile(spot.y));
  }
  return b;
}

// in-place building upgrade: paid up front, then a construction timer runs.
// Each level is a much bigger job: LV2 takes 2x the build time, LV3 takes 4x.
export function upgradeTime(b: Building): number {
  return b.def.buildTime * (b.level === 1 ? 2 : 4);
}

export function upgradeBuilding(b: Building): boolean {
  if (!b.def.upgradable || b.level >= 3 || b.upgrading) return false;
  const cost = Math.round(b.def.cost * BLD_UPGRADE_COST);
  const p = players[b.owner];
  if (p.credits < cost) {
    if (b.owner === PLAYER) { toast('Insufficient flux'); sfx('error'); }
    return false;
  }
  p.credits -= cost;
  const t = upgradeTime(b);
  b.upgrading = { remaining: t, total: t };
  if (b.owner === PLAYER) sfx('click');
  return true;
}
export function buildingUpgradeCost(b: Building) {
  return Math.round(b.def.cost * BLD_UPGRADE_COST);
}

function destroy(e: Entity) {
  byId.delete(e.id);
  const p = entityPos(e);
  booms.push({ x: p.x, y: p.y, r: 4, ttl: 0.5, max: entityRadius(e) * 1.6 });
  if (e.owner === PLAYER || audible(p.x, p.y)) sfx('explosion');
  if (e.kind === 'unit') {
    units.splice(units.indexOf(e), 1);
  } else {
    buildings.splice(buildings.indexOf(e), 1);
    for (let y = e.ty; y < e.ty + e.def.h; y++)
      for (let x = e.tx; x < e.tx + e.def.w; x++)
        if (occupied[idx(x, y)] === e.id) occupied[idx(x, y)] = -1;
  }
}

export function damage(target: Entity, amount: number) {
  target.hp -= amount;
  if (target.hp <= 0) destroy(target);
}

// ---------- Production ----------

function defFor(item: { defId: string, kind: string }) {
  return item.kind === 'building' ? BUILDINGS[item.defId]
       : item.kind === 'unit' ? UNITS[item.defId]
       : UPGRADES[item.defId];
}

export function prereqMet(owner: number, tab: Tab, defId: string): boolean {
  if (tab === 'ups') {
    const up = UPGRADES[defId];
    if (!hasBuilding(owner, 'lab')) return false;
    if (players[owner].upgrades.has(defId)) return false;
    if (up.prereqUp && !players[owner].upgrades.has(up.prereqUp)) return false;
    // also not already in queue
    return !players[owner].queues.ups.some(q => q.defId === defId);
  }
  const def = tab === 'inf' || tab === 'veh' ? UNITS[defId] : BUILDINGS[defId];
  if (!def) return false;
  if (def.prereq && !hasBuilding(owner, def.prereq)) return false;
  if (def.prereqUp && !players[owner].upgrades.has(def.prereqUp)) return false;
  if (tab === 'inf' && !hasBuilding(owner, 'barracks')) return false;
  if (tab === 'veh' && !hasBuilding(owner, 'fab')) return false;
  return true;
}

// human-readable reason a def can't be produced right now (null = no blocker)
export function requirementText(owner: number, tab: Tab, defId: string): string | null {
  if (tab === 'ups') {
    const up = UPGRADES[defId];
    if (!up) return null;
    if (players[owner].upgrades.has(defId)) return 'Already researched';
    if (!hasBuilding(owner, 'lab')) return 'Requires a Laboratory';
    if (up.prereqUp && !players[owner].upgrades.has(up.prereqUp)) return `Requires ${UPGRADES[up.prereqUp].name}`;
    if (players[owner].queues.ups.some(q => q.defId === defId)) return 'Already being researched';
    return null;
  }
  const def = tab === 'inf' || tab === 'veh' ? UNITS[defId] : BUILDINGS[defId];
  if (!def) return null;
  if (tab === 'inf' && !hasBuilding(owner, 'barracks')) return 'Requires a Barracks';
  if (tab === 'veh' && !hasBuilding(owner, 'fab')) return 'Requires a Fabricator';
  if (def.prereq && !hasBuilding(owner, def.prereq)) return `Requires ${BUILDINGS[def.prereq].name}`;
  if (def.prereqUp && !players[owner].upgrades.has(def.prereqUp)) return `Requires ${UPGRADES[def.prereqUp].name} research`;
  return null;
}

export function startProduction(owner: number, defId: string, tab: Tab): boolean {
  const p = players[owner];
  if (!prereqMet(owner, tab, defId)) return false;
  const kind = tab === 'ups' ? 'upgrade' : (tab === 'inf' || tab === 'veh') ? 'unit' : 'building';
  const def = kind === 'building' ? BUILDINGS[defId] : kind === 'unit' ? UNITS[defId] : UPGRADES[defId];
  if (p.credits < def.cost) {
    if (owner === PLAYER) { toast('Insufficient flux'); sfx('error'); }
    return false;
  }
  if (p.queues[tab].length >= 9) return false; // sane queue cap
  p.credits -= def.cost;
  p.queues[tab].push({ defId, kind, total: def.buildTime, remaining: def.buildTime, ready: false });
  return true;
}

// remove the LAST queued instance of defId from a tab (full refund)
export function cancelProduction(owner: number, tab: Tab, defId: string): boolean {
  const p = players[owner];
  const q = p.queues[tab];
  for (let i = q.length - 1; i >= 0; i--) {
    if (q[i].defId === defId) {
      p.credits += defFor(q[i]).cost;
      q.splice(i, 1);
      return true;
    }
  }
  return false;
}

export function queuedCount(owner: number, tab: Tab, defId: string): number {
  return players[owner].queues[tab].filter(q => q.defId === defId).length;
}

function finishUnit(owner: number, defId: string) {
  const def = UNITS[defId];
  const src = buildings.find(b => b.owner === owner && b.def.produces === def.tab);
  if (!src) return; // factory died — unit is lost (credits were spent, like RA2)
  const spot = nearestTile(src.tx + Math.floor(src.def.w / 2), src.ty + src.def.h, 10,
    (x, y) => inBounds(x, y) && terrain[idx(x, y)] === 0 && occupied[idx(x, y)] === -1);
  if (!spot) return;
  const u = spawnUnit(defId, owner, centerOfTile(spot.x), centerOfTile(spot.y));
  issueOrder(u, { type: 'move', x: src.rallyX, y: src.rallyY });
}

// ---------- Orders & movement ----------

export function issueOrder(u: Unit, order: Order) {
  u.order = order;
  u.autoTargetId = -1;
  u.path = null;
  if (u.def.harvester) {
    u.harvestState = order.type === 'harvest' ? 'toField' : 'none';
    if (order.type === 'idle') u.harvestState = 'toField';
  }
}

function moveToward(u: Unit, px: number, py: number, dt: number): boolean {
  // returns true when arrived (within half a tile)
  const arrivedDist = TILE * 0.45;
  if (Math.hypot(px - u.x, py - u.y) <= arrivedDist && !u.path?.length) return true;

  if (!u.path || u.path.length === 0) {
    u.repathTimer -= dt;
    if (u.repathTimer > 0) return false;
    u.repathTimer = 0.5 + Math.random() * 0.5;
    const p = findPath(tileOf(u.x), tileOf(u.y), tileOf(px), tileOf(py));
    if (!p || p.length === 0) return Math.hypot(px - u.x, py - u.y) <= TILE * 1.5;
    u.path = p;
  }

  const wp = u.path[0];
  const wx = centerOfTile(wp.x), wy = centerOfTile(wp.y);
  const dx = wx - u.x, dy = wy - u.y;
  const d = Math.hypot(dx, dy);
  const step = u.def.speed * TILE * dt;
  u.facing = Math.atan2(dy, dx);
  if (d <= step) {
    u.x = wx; u.y = wy;
    u.path.shift();
    if (u.path.length === 0) u.path = null;
  } else {
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
  }
  return false;
}

// is this world position visible to the player (for playing sound)?
function audible(x: number, y: number): boolean {
  const tx = tileOf(x), ty = tileOf(y);
  return inBounds(tx, ty) && visible[idx(tx, ty)] === 1;
}

function fireAt(u: Unit | Building, target: Entity, damageAmt: number, color: string) {
  const from = entityPos(u), to = entityPos(target);
  // projectile weapons lob a shell at the target's CURRENT position — fast
  // targets can sidestep, and the blast damages everything near the impact
  if (u.kind === 'unit' && u.def.weapon) {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const speed = u.def.weapon === 'rocket' ? 240 : 150;
    shells.push({
      x: from.x, y: from.y, sx: from.x, sy: from.y, tx: to.x, ty: to.y,
      t: 0, dur: Math.max(0.2, d / speed), dmg: damageAmt,
      splash: (u.def.splash ?? 0.8) * TILE, owner: u.owner, kind: u.def.weapon,
    });
    if (audible(from.x, from.y)) sfx(u.def.weapon === 'rocket' ? 'shot' : 'shotHeavy');
    return;
  }
  beams.push({ x1: from.x, y1: from.y, x2: to.x + (Math.random() * 8 - 4), y2: to.y + (Math.random() * 8 - 4), ttl: 0.12, color });
  if (audible(from.x, from.y) || audible(to.x, to.y)) sfx(damageAmt >= 60 ? 'shotHeavy' : 'shot');
  damage(target, damageAmt);
}

// ---------- pioneer deployment & building repair ----------

export function deployPioneer(u: Unit): boolean {
  if (!u.def.deploysTo) return false;
  const bid = u.def.deploysTo;
  const spot = nearestTile(tileOf(u.x), tileOf(u.y), 3, (x, y) => canPlace(u.owner, bid, x, y, false));
  if (!spot) {
    if (u.owner === PLAYER) { toast('No room to deploy here'); sfx('error'); }
    return false;
  }
  units.splice(units.indexOf(u), 1);
  byId.delete(u.id);
  placeBuilding(bid, u.owner, spot.x, spot.y);
  if (u.owner === PLAYER) { toast('Command Post deployed — build radius extended'); sfx('place'); }
  return true;
}

export function repairCost(b: Building): number {
  return Math.max(1, Math.round((1 - b.hp / b.maxHp) * b.def.cost * REPAIR_COST));
}

export function startRepair(b: Building): boolean {
  if (b.repairing || b.hp >= b.maxHp) return false;
  const cost = repairCost(b);
  const p = players[b.owner];
  if (p.credits < cost) {
    if (b.owner === PLAYER) { toast('Insufficient flux'); sfx('error'); }
    return false;
  }
  p.credits -= cost;
  b.repairing = true;
  if (b.owner === PLAYER) sfx('click');
  return true;
}

// ---------- orbital strike superweapon ----------

export function superReady(b: Building): boolean {
  return !!b.def.superweapon && b.charge <= 0;
}

// launch a strike at a world point; telegraphs for 1.6s before impact
export function fireStrike(b: Building, wx: number, wy: number): boolean {
  const sw = b.def.superweapon;
  if (!sw || b.charge > 0) return false;
  b.charge = sw.charge; // begin recharging
  strikes.push({ x: wx, y: wy, t: 0, delay: 1.6, owner: b.owner, damage: sw.damage, radius: sw.radius * TILE });
  if (b.owner === PLAYER) { toast('Orbital strike inbound'); sfx('research'); }
  return true;
}

function findEnemyInRange(e: Entity, rangeTiles: number): Entity | null {
  const rangePx = rangeTiles * TILE;
  let best: Entity | null = null, bestD = Infinity;
  const check = (t: Entity) => {
    if (t.owner === e.owner) return;
    // don't auto-acquire walls; they're only attacked on explicit orders or when blocking
    if (t.kind === 'building' && t.def.isWall && e.kind === 'unit' && e.order.type !== 'attack') return;
    const d = distBetween(e, t);
    if (d <= rangePx && d < bestD) { best = t; bestD = d; }
  };
  for (const t of units) check(t);
  for (const t of buildings) check(t);
  return best;
}

// ---------- Harvester brain ----------

function updateHarvester(u: Unit, dt: number) {
  const p = players[u.owner];
  if (u.harvestState === 'none') return; // manual move order in progress

  if (u.harvestState === 'toField') {
    // target: explicit harvest order location (if it still has crystal), else nearest crystal
    let goal: { x: number, y: number } | null = null;
    if (u.order.type === 'harvest' && u.order.x !== undefined) {
      const otx = tileOf(u.order.x), oty = tileOf(u.order.y!);
      if (crystal[idx(otx, oty)] > 0) goal = { x: otx, y: oty };
      else u.order = { type: 'idle' };
    }
    if (!goal) goal = nearestTile(tileOf(u.x), tileOf(u.y), 60, (x, y) => crystal[idx(x, y)] > 0);
    if (!goal) return; // no crystal left anywhere

    if (moveToward(u, centerOfTile(goal.x), centerOfTile(goal.y), dt)) {
      const here = idx(tileOf(u.x), tileOf(u.y));
      const near = nearestTile(tileOf(u.x), tileOf(u.y), 1, (x, y) => crystal[idx(x, y)] > 0);
      if (near || crystal[here] > 0) u.harvestState = 'harvesting';
    }
  } else if (u.harvestState === 'harvesting') {
    const near = nearestTile(tileOf(u.x), tileOf(u.y), 1, (x, y) => crystal[idx(x, y)] > 0);
    if (!near) { u.harvestState = 'toField'; return; }
    const i = idx(near.x, near.y);
    const take = Math.min(HARVEST_RATE * dt, crystal[i], HARVESTER_CAPACITY - u.cargo);
    crystal[i] -= take;
    u.cargo += take;
    if (u.cargo >= HARVESTER_CAPACITY - 0.5) u.harvestState = 'toBase';
  } else if (u.harvestState === 'toBase') {
    let best: Building | null = null, bestD = Infinity;
    for (const b of buildings) {
      if (b.owner !== u.owner || b.def.id !== 'extractor') continue;
      const c = buildingCenter(b);
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bestD) { best = b; bestD = d; }
    }
    if (!best) return; // no extractor; wait
    const c = buildingCenter(best);
    const dock = { x: c.x, y: (best.ty + best.def.h) * TILE + TILE / 2 };
    if (moveToward(u, dock.x, dock.y, dt) || Math.hypot(c.x - u.x, c.y - u.y) < TILE * 2.2) {
      p.credits += Math.round(u.cargo);
      u.cargo = 0;
      u.path = null;
      u.harvestState = 'toField';
      if (u.owner === PLAYER) sfx('cash');
    }
  }
}

// ---------- Main update ----------

let fogTimer = 0;
let healTimer = 0;

export function update(dt: number) {
  if (gameOver || paused) return;
  if (toastMsg.ttl > 0) toastMsg.ttl -= dt;

  // building upgrades tick like construction (and slow down on low power)
  for (const b of buildings) {
    if (!b.upgrading) continue;
    const speedMul = powerOf(b.owner).low ? LOW_POWER_SPEED : 1;
    b.upgrading.remaining -= dt * speedMul;
    if (b.upgrading.remaining <= 0) {
      b.upgrading = null;
      b.level++;
      b.maxHp = Math.round(b.def.hp * (1 + BLD_UPGRADE_HP * (b.level - 1)));
      b.hp = b.maxHp; // finishing an upgrade also repairs
      if (b.owner === PLAYER) {
        toast(`${b.def.name} upgraded to LV${b.level}`);
        sfx('upgrade');
      }
    }
  }

  // production progress (first item of each tab queue)
  for (let owner = 0; owner < numPlayers; owner++) {
    const p = players[owner];
    const speedMul = powerOf(owner).low ? LOW_POWER_SPEED : 1;
    for (const tab of ['build', 'def', 'inf', 'veh', 'ups'] as Tab[]) {
      const q = p.queues[tab][0];
      if (!q || q.ready) continue;
      q.remaining -= dt * speedMul;
      if (q.remaining <= 0) {
        if (q.kind === 'building') {
          q.ready = true;
          if (owner === PLAYER) {
            toast(`${BUILDINGS[q.defId].name} ready — click its button, then place it`);
            sfx('ready');
          }
        } else if (q.kind === 'unit') {
          finishUnit(owner, q.defId);
          p.queues[tab].shift();
          if (owner === PLAYER) sfx('ready');
        } else {
          p.upgrades.add(q.defId);
          p.queues[tab].shift();
          if (owner === PLAYER) {
            toast(`Research complete: ${UPGRADES[q.defId].name}`);
            sfx('research');
          }
        }
      }
    }
  }

  // units
  for (const u of [...units]) {
    if (u.hp <= 0) continue;
    u.cooldown = Math.max(0, u.cooldown - dt);

    if (u.def.harvester) {
      if (u.order.type === 'move' && u.order.x !== undefined) {
        if (moveToward(u, u.order.x, u.order.y!, dt)) { u.order = { type: 'idle' }; u.harvestState = 'toField'; }
      } else {
        updateHarvester(u, dt);
      }
      continue;
    }

    // combat unit logic
    let target: Entity | null = null;
    if (u.order.type === 'attack' && u.order.targetId !== undefined) {
      target = byId.get(u.order.targetId) ?? null;
      if (!target) u.order = { type: 'idle' };
    }
    if (!target && (u.order.type === 'idle' || u.order.type === 'attackMove')) {
      if (u.autoTargetId !== -1) {
        target = byId.get(u.autoTargetId) ?? null;
        if (!target) u.autoTargetId = -1;
      }
      if (!target) {
        target = findEnemyInRange(u, u.def.vision);
        if (target) u.autoTargetId = target.id;
      }
    }

    if (target) {
      const d = distBetween(u, target);
      if (d <= u.def.range * TILE) {
        u.path = null;
        const tp = entityPos(target);
        u.facing = Math.atan2(tp.y - u.y, tp.x - u.x);
        if (u.cooldown === 0) {
          u.cooldown = u.def.reload;
          fireAt(u, target, u.def.damage * weaponMult(u.owner), u.owner === 0 ? '#7fd4ff' : '#ff8080');
        }
      } else {
        const tp = entityPos(target);
        moveToward(u, tp.x, tp.y, dt);
      }
    } else if ((u.order.type === 'move' || u.order.type === 'attackMove') && u.order.x !== undefined) {
      if (moveToward(u, u.order.x, u.order.y!, dt)) u.order = { type: 'idle' };
    }
  }

  // gentle unit separation so stacks spread out
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.def.radius + b.def.radius) * 0.9;
      if (d > 0 && d < min) {
        const push = (min - d) * 0.5 * dt * 8;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  // turrets
  for (const b of buildings) {
    if (!b.def.turret) continue;
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (powerOf(b.owner).low) continue; // turrets offline on low power
    const t = findEnemyInRange(b, b.def.turret.range);
    if (t) {
      const tp = entityPos(t), c = buildingCenter(b);
      b.facing = Math.atan2(tp.y - c.y, tp.x - c.x);
      if (b.cooldown === 0) {
        b.cooldown = b.def.turret.reload;
        const dmg = b.def.turret.damage * turretMult(b.owner) * (1 + BLD_UPGRADE_DMG * (b.level - 1));
        fireAt(b, t, dmg, b.owner === 0 ? '#7fd4ff' : '#ff8080');
      }
    }
  }

  // superweapon buildings recharge over time
  for (const b of buildings) {
    if (b.def.superweapon && b.charge > 0) b.charge = Math.max(0, b.charge - dt);
  }

  // orbital strikes: telegraph, then a massive detonation
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    s.t += dt;
    if (s.t >= s.delay) {
      strikes.splice(i, 1);
      booms.push({ x: s.x, y: s.y, r: 6, ttl: 0.5, max: s.radius * 1.1 });
      sfx('explosion');
      for (const t of [...units]) {
        if (t.owner !== s.owner && Math.hypot(t.x - s.x, t.y - s.y) <= s.radius + t.def.radius * 0.5) damage(t, s.damage);
      }
      for (const t of [...buildings]) {
        if (t.owner === s.owner) continue;
        const c = buildingCenter(t);
        if (Math.hypot(c.x - s.x, c.y - s.y) <= s.radius + entityRadius(t) * 0.6) damage(t, s.damage);
      }
    }
  }

  // projectiles in flight → impact, blast, splash damage
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.t += dt;
    const p = Math.min(1, s.t / s.dur);
    s.x = s.sx + (s.tx - s.sx) * p;
    s.y = s.sy + (s.ty - s.sy) * p;
    if (p >= 1) {
      shells.splice(i, 1);
      booms.push({ x: s.tx, y: s.ty, r: 4, ttl: 0.5, max: s.splash * 0.95 });
      if (audible(s.tx, s.ty)) sfx('explosion');
      for (const t of [...units]) {
        if (t.owner !== s.owner && Math.hypot(t.x - s.tx, t.y - s.ty) <= s.splash + t.def.radius * 0.5) damage(t, s.dmg);
      }
      for (const t of [...buildings]) {
        if (t.owner === s.owner) continue;
        const c = buildingCenter(t);
        if (Math.hypot(c.x - s.tx, c.y - s.ty) <= s.splash + entityRadius(t) * 0.6) damage(t, s.dmg);
      }
    }
  }

  // building repairs heal over time (paid when started)
  for (const b of buildings) {
    if (!b.repairing) continue;
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * REPAIR_RATE * dt);
    if (b.hp >= b.maxHp) b.repairing = false;
  }

  // effects
  for (let i = beams.length - 1; i >= 0; i--) { beams[i].ttl -= dt; if (beams[i].ttl <= 0) beams.splice(i, 1); }
  for (let i = booms.length - 1; i >= 0; i--) {
    const bm = booms[i];
    bm.ttl -= dt; bm.r = Math.max(0.1, bm.max * (1 - bm.ttl / 0.5));
    if (bm.ttl <= 0) booms.splice(i, 1);
  }

  // repair yards: heal friendly units within 5 tiles
  healTimer -= dt;
  if (healTimer <= 0) {
    healTimer = 0.5;
    for (const b of buildings) {
      const rate = b.def.healRate;
      if (!rate) continue;
      const c = buildingCenter(b);
      for (const u of units) {
        if (u.owner !== b.owner || u.hp >= u.maxHp) continue;
        if (Math.hypot(u.x - c.x, u.y - c.y) <= 5 * TILE) {
          u.hp = Math.min(u.maxHp, u.hp + rate * 0.5);
        }
      }
    }
  }

  // fog of war (player perspective), cheap enough to refresh a few times a second
  fogTimer -= dt;
  if (fogTimer <= 0) {
    fogTimer = 0.2;
    visible.fill(0);
    const reveal = (cx: number, cy: number, r: number) => {
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (!inBounds(x, y)) continue;
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
            const i = idx(x, y);
            visible[i] = 1; explored[i] = 1;
          }
        }
    };
    for (const u of units) if (u.owner === PLAYER) reveal(tileOf(u.x), tileOf(u.y), u.def.vision);
    for (const b of buildings) if (b.owner === PLAYER) reveal(b.tx + Math.floor(b.def.w / 2), b.ty + Math.floor(b.def.h / 2), b.def.vision);
  }

  // supernova countdown + escalating solar flares in the final third
  if (novaTotal > 0 && novaLeft > 0) {
    novaLeft = Math.max(0, novaLeft - dt);
    const third = novaTotal / 3;
    if (novaLeft < third) {
      flareTimer -= dt;
      if (flareTimer <= 0) {
        const intensity = 1 - novaLeft / third;             // 0 → 1 as the end nears
        flareTimer = 5.5 - intensity * 4;                    // ~5.5s down to ~1.5s apart
        const fx = (2 + Math.random() * (MAP_W - 4)) * TILE;
        const fy = (2 + Math.random() * (MAP_H - 4)) * TILE;
        // owner -1 → damages every faction; a fiery environmental strike
        strikes.push({ x: fx, y: fy, t: 0, delay: 1.2, owner: -1, damage: 120 + intensity * 160, radius: (1.6 + intensity) * TILE });
      }
    }
  }

  // win / lose: walls don't keep a faction "alive"
  const alive = (owner: number) => buildings.some(b => b.owner === owner && !b.def.isWall);
  if (!alive(PLAYER)) gameOver = 'lose';
  else {
    let anyEnemy = false;
    for (let o = 1; o < numPlayers; o++) if (alive(o)) anyEnemy = true;
    if (!anyEnemy) gameOver = 'win';
    else if (novaTotal > 0 && novaLeft <= 0) gameOver = 'lose'; // the sun went nova first
  }
}
