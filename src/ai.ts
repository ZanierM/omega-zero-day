import { TILE, BUILDINGS, UPGRADES, UNITS, PLAYER, FACTION_NAMES, UNIT_ARMOR, UNIT_DMGTYPE, DMG_TABLE } from './config';
import {
  buildings, units, players, startProduction, placeBuilding, canPlace,
  issueOrder, hasBuilding, buildingCenter, powerOf, numPlayers, deployPioneer, tileOf,
  startRepair, repairCost, superReady, fireStrike, neutrals,
  activateAbility, abilityOn, byId, toast, corridor,
} from './game';
import { rand, crystal, idx, nearestTile } from './map';

// Each AI opponent follows a long build order toward a large fortified base,
// keeps its economy running, researches upgrades, and attacks in growing waves.

// Each faction fights to a doctrine: its own build order, research path,
// unit preferences and way of picking fights, so opponents read differently.
// Counters only use what the AI has actually scouted (see `intel`).
interface Doctrine {
  tag: string;                          // shown when one of its waves heads your way
  build: string[]; research: string[];
  inf: Record<string, number>;          // unit preference weights, before counters
  veh: Record<string, number>;
  vehFunding: number;                   // credits held back before it funds a vehicle (lower = more vehicles)
  infShare: number;                     // once vehicles are possible, chance a cycle also funds infantry
  waveGap: number; waveSize: number;    // wave timing multiplier, extra units per wave
  firstWave: number;                    // multiplier on the first-wave timer
  ventBias: number;                     // chance a wave goes for a flux vent
  raidEcon: number;                     // chance a wave hits harvesters / extractors instead of the HQ
}

const LATE = ['fusion', 'arctower', 'turret', 'arctower', 'bastion', 'railgun', 'fusion', 'bastion'];
const DOCTRINES: Record<string, Doctrine> = {
  // Kessler Collective: slow, heavy armour behind a wall of guns
  kessler: {
    tag: 'armoured column',
    build: ['solar', 'extractor', 'barracks', 'solar', 'turret', 'fab', 'turret', 'extractor', 'solar', 'spire',
      'railgun', 'lab', 'turret', 'solar', 'railgun', 'repairyard', 'extractor', 'solar', 'turret', 'skyguard', 'railgun',
      'skyport', 'solar', 'skyguard', ...LATE],
    research: ['arm1', 'def1', 'arm2', 'wpn1', 'def2', 'wpn2', 'arm3', 'wpn3', 'orbital'],
    inf: { trooper: 1, rocketeer: 2, vanguard: 2.5, juggernaut: 2 },
    veh: { hovertank: 3, dominator: 3, warden: 1, ranger: 0.5, artillery: 1.5, colossus: 2.5, gunship: 0.4 },
    vehFunding: 600, infShare: 0.35, waveGap: 1.25, waveSize: 4, firstWave: 1.3, ventBias: 0.25, raidEcon: 0,
  },
  // Verdant Pact: cheap infantry tides that swarm the vents and hold the middle
  verdant: {
    tag: 'infantry tide',
    build: ['solar', 'barracks', 'extractor', 'solar', 'turret', 'lab', 'fab', 'extractor', 'solar', 'turret',
      'repairyard', 'spire', 'solar', 'extractor', 'turret', 'skyguard', 'solar', 'railgun', 'skyport', 'turret', ...LATE],
    research: ['wpn1', 'arm1', 'wpn2', 'arm2', 'def1', 'wpn3', 'arm3', 'def2', 'orbital'],
    inf: { trooper: 3, pyro: 3, rocketeer: 1.5, vanguard: 1, sniper: 1, juggernaut: 0.6 },
    veh: { ranger: 1, warden: 2, artillery: 1.5, hovertank: 0.8 },
    vehFunding: 1600, infShare: 1, waveGap: 0.8, waveSize: 0, firstWave: 0.85, ventBias: 0.7, raidEcon: 0.1,
  },
  // Ashen Syndicate: fast raiders and aircraft that burn your economy
  ashen: {
    tag: 'raiding party',
    build: ['solar', 'extractor', 'barracks', 'fab', 'solar', 'turret', 'skyport', 'extractor', 'solar', 'spire',
      'lab', 'skyguard', 'solar', 'turret', 'extractor', 'railgun', 'solar', 'repairyard', 'turret', 'skyguard', ...LATE],
    research: ['wpn1', 'wpn2', 'arm1', 'wpn3', 'orbital', 'def1', 'arm2', 'arm3', 'def2'],
    inf: { trooper: 1, rocketeer: 1.5, sniper: 2, pyro: 0.5 },
    veh: { raider: 3, ranger: 1.5, artillery: 2, gunship: 3, bomber: 2, warden: 0.6 },
    vehFunding: 450, infShare: 0.4, waveGap: 0.9, waveSize: -1, firstWave: 0.8, ventBias: 0.3, raidEcon: 0.6,
  },
};
// faction slot → doctrine (FACTION_NAMES: player, Kessler, Verdant, Ashen)
const DOCTRINE_OF = ['kessler', 'kessler', 'verdant', 'ashen'];
export function doctrineOf(owner: number) { return DOCTRINES[DOCTRINE_OF[owner] ?? 'kessler']; }

export type Difficulty = 'easy' | 'normal' | 'hard';

// per-difficulty AI behaviour knobs
const DIFF = {
  easy:   { trickle: 4,  armyCap: 16, firstWave: 75, waveGapMul: 1.5, counters: false, headStart: false },
  normal: { trickle: 9,  armyCap: 30, firstWave: 45, waveGapMul: 1.0, counters: true,  headStart: false },
  hard:   { trickle: 16, armyCap: 42, firstWave: 32, waveGapMul: 0.75, counters: true, headStart: true },
};

interface AIState {
  owner: number;
  buildIndex: number;
  researchIndex: number;
  attackTimer: number;
  trainCooldown: number;
  repairCooldown: number;
  abilCooldown: number;
  clock: number;                         // seconds this AI has run
  intel: Record<number, { a: Kind; t: number; o: number }>;   // enemy unit id → what it is, when last seen, owner
  intelTimer: number;
  scoutId: number; scoutTimer: number;
  warnedWave?: boolean;
}

// what a scouted unit counts as for countering: its armour class, or air
type Kind = 'infantry' | 'light' | 'heavy' | 'air';
const kindOf = (defId: string): Kind => UNITS[defId].air ? 'air' : (UNIT_ARMOR[defId] as Kind) ?? 'light';
const INTEL_MEMORY = 120;   // seconds a sighting stays useful

// nearest enemy unit/building distance (px) to a point, for ability decisions
function nearestEnemyDist(owner: number, x: number, y: number): number {
  let best = Infinity;
  for (const u of units) if (u.owner !== owner && !u.def.harvester) best = Math.min(best, Math.hypot(u.x - x, u.y - y));
  for (const b of buildings) if (b.owner !== owner && !b.def.isWall) {
    const c = buildingCenter(b); best = Math.min(best, Math.hypot(c.x - x, c.y - y));
  }
  return best;
}

// let the AI use unit special abilities sensibly
function manageAbilities(owner: number) {
  for (const u of units) {
    if (u.owner !== owner || !u.def.ability) continue;
    const a = u.def.ability;
    const near = nearestEnemyDist(owner, u.x, u.y);
    if (a.kind === 'toggle') {
      // siege/brace up when an enemy is in weapon range; pack up when they're far
      const wantOn = near <= (u.def.range + 2) * TILE;
      const wantOff = near > (u.def.range + 5) * TILE;
      if (wantOn && !abilityOn(u)) activateAbility(u);
      else if (wantOff && abilityOn(u)) activateAbility(u);
    } else if (u.abilityCd <= 0 && near <= 5 * TILE) {
      activateAbility(u); // stomp / overcharge / overdrive when the enemy is close
    }
  }
}

let ais: AIState[] = [];
let diff = DIFF.normal;

export function initAI(numEnemies: number, difficulty: Difficulty = 'normal') {
  diff = DIFF[difficulty];
  ais = [];
  for (let i = 0; i < numEnemies; i++) {
    ais.push({
      owner: i + 1,
      buildIndex: 0,
      researchIndex: 0,
      attackTimer: diff.firstWave + i * 12,   // stagger the first waves
      trainCooldown: 0,
      repairCooldown: 5,
      abilCooldown: 0,
      clock: 0, intel: {}, intelTimer: 0, scoutId: -1, scoutTimer: 40 + i * 15,
    });
    ais[i].attackTimer *= doctrineOf(i + 1).firstWave;
    if (diff.headStart) players[i + 1].upgrades.add('wpn1'); // hard AIs land pre-armed
  }
}

// ---------- save / resume ----------
export interface AISnapshot { difficulty: Difficulty; ais: AIState[] }
export function snapshotAI(difficulty: Difficulty): AISnapshot {
  return { difficulty, ais: ais.map(a => ({ ...a, intel: { ...a.intel } })) };
}
export function restoreAI(s: AISnapshot) {
  diff = DIFF[s.difficulty];
  // older saves predate scouting intel
  ais = s.ais.map(a => ({ ...a, clock: a.clock ?? 0, intel: { ...(a.intel ?? {}) }, intelTimer: a.intelTimer ?? 0, scoutId: a.scoutId ?? -1, scoutTimer: a.scoutTimer ?? 30 }));
}

function myHQ(owner: number) {
  return buildings.find(b => b.owner === owner && b.def.id === 'nexus')
      ?? buildings.find(b => b.owner === owner && !b.def.isWall) ?? null;
}

function placeNear(owner: number, defId: string): boolean {
  // anchor at the HQ first, then at any deployed Command Posts (expansions)
  const anchors = [
    myHQ(owner),
    ...buildings.filter(b => b.owner === owner && b.def.id === 'outpost'),
  ].filter(Boolean) as { tx: number, ty: number }[];
  // extractors prefer the anchor closest to unmined crystal
  if (defId === 'extractor') anchors.reverse();
  for (const a of anchors) {
    for (let r = 2; r < 20; r++) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const tx = a.tx + Math.floor((rand() * 2 - 1) * r);
        const ty = a.ty + Math.floor((rand() * 2 - 1) * r);
        if (canPlace(owner, defId, tx, ty)) {
          placeBuilding(defId, owner, tx, ty);
          return true;
        }
      }
    }
  }
  return false;
}

function armyUnits(owner: number) {
  return units.filter(u => u.owner === owner && !u.def.harvester);
}

function updateOne(ai: AIState, dt: number) {
  const p = players[ai.owner];
  const doc = doctrineOf(ai.owner);
  const BUILD_ORDER = doc.build, RESEARCH_ORDER = doc.research;
  ai.clock += dt;

  // scouting: remember what enemy units it has actually seen
  ai.intelTimer -= dt;
  if (ai.intelTimer <= 0) { ai.intelTimer = 1; gatherIntel(ai); }

  // modest income trickle so the AI keeps developing even with a lean economy
  p.credits += diff.trickle * dt;

  // unit special abilities (throttled — no need to check every frame)
  ai.abilCooldown -= dt;
  if (ai.abilCooldown <= 0) { ai.abilCooldown = 0.5; manageAbilities(ai.owner); }

  // field repairs: patch up badly damaged structures when affordable
  ai.repairCooldown -= dt;
  if (ai.repairCooldown <= 0) {
    ai.repairCooldown = 4;
    const hurt = buildings.find(b => b.owner === ai.owner && !b.def.isWall && !b.repairing && b.hp < b.maxHp * 0.6);
    if (hurt && p.credits > repairCost(hurt) + 800) startRepair(hurt);
  }

  // --- construction (build tab and defence tab share the plan) ---
  // what the AI wants to build next (used to reserve credits below)
  let want: string | null = null;
  if (!hasBuilding(ai.owner, 'solar')) want = 'solar';
  else if (!hasBuilding(ai.owner, 'extractor')) want = 'extractor';
  // prestige priority: once the Orbital Protocol is researched, build the superweapon
  else if (p.upgrades.has('orbital') && hasBuilding(ai.owner, 'spire') && !hasBuilding(ai.owner, 'uplink')) want = 'uplink';
  else if (ai.buildIndex < BUILD_ORDER.length) want = BUILD_ORDER[ai.buildIndex];
  else if (powerOf(ai.owner).low) want = 'solar';
  const reserve = want ? BUILDINGS[want].cost + 300 : 0;

  const bq = p.queues.build[0] ?? p.queues.def[0];
  if (bq?.ready) {
    placeNear(ai.owner, bq.defId);
    // clear from whichever queue it lives in (drop it even if unplaceable)
    for (const tab of ['build', 'def'] as const) {
      if (p.queues[tab][0]?.ready) p.queues[tab].shift();
    }
  } else if (!p.queues.build.length && !p.queues.def.length) {
    if (want && p.credits >= reserve) {
      const tab = BUILDINGS[want].tab;
      if (startProduction(ai.owner, want, tab)) {
        if (want === BUILD_ORDER[ai.buildIndex]) ai.buildIndex++;
      } else if (want === BUILD_ORDER[ai.buildIndex] && BUILDINGS[want].prereqUp && !p.upgrades.has(BUILDINGS[want].prereqUp!)) {
        ai.buildIndex++; // research not done yet — skip; the order repeats these later
      }
    }
  }

  // --- expansion: home crystal exhausted → send a Pioneer to fresh fields ---
  const hq = myHQ(ai.owner);
  if (hq && ai.buildIndex > 5) {
    const homeCrystal = nearestTile(hq.tx, hq.ty, 15, (x, y) => crystal[idx(x, y)] > 0);
    const pio = units.find(u => u.owner === ai.owner && u.def.deploysTo);
    if (!homeCrystal && !pio && hasBuilding(ai.owner, 'fab') && !p.queues.veh.length && p.credits > 3500) {
      startProduction(ai.owner, 'pioneer', 'veh');
    }
    if (pio && pio.order.type === 'idle') {
      const field = nearestTile(tileOf(pio.x), tileOf(pio.y), 70, (x, y) => crystal[idx(x, y)] > 0);
      if (field) {
        const d = Math.hypot(tileOf(pio.x) - field.x, tileOf(pio.y) - field.y);
        if (d < 5) deployPioneer(pio);
        else issueOrder(pio, { type: 'move', x: field.x * TILE, y: (field.y + 3) * TILE });
      }
    }
  }

  // --- research ---
  if (hasBuilding(ai.owner, 'lab') && ai.researchIndex < RESEARCH_ORDER.length && !p.queues.ups.length) {
    const up = RESEARCH_ORDER[ai.researchIndex];
    if (p.credits > UPGRADES[up].cost + 150 && startProduction(ai.owner, up, 'ups')) {
      ai.researchIndex++;
    }
  }

  // --- unit training ---
  // Fund an army in PARALLEL with base-building: we save toward the next
  // structure, but cap how much we hold back so ongoing income keeps producing
  // troops instead of hoarding for one expensive building.
  ai.trainCooldown -= dt;
  if (ai.trainCooldown <= 0) {
    ai.trainCooldown = 1.4;
    const army = armyUnits(ai.owner);
    const harvesters = units.filter(u => u.owner === ai.owner && u.def.harvester).length;
    // keep the next research affordable too, or a busy barracks starves the lab forever
    const nextUp = hasBuilding(ai.owner, 'lab') ? RESEARCH_ORDER[ai.researchIndex] : undefined;
    const spare = p.credits - Math.min(reserve, 1600) - (nextUp ? UPGRADES[nextUp].cost * 0.5 : 0);
    const canHarvest = hasBuilding(ai.owner, 'fab') && hasBuilding(ai.owner, 'extractor');
    // raided harvesters get replaced before anything else, unless it has almost no army
    const rebuildEcon = canHarvest && harvesters < 2 && army.length >= 4;
    if (canHarvest && harvesters < 3 && p.credits >= 1400 && !p.queues.veh.length) {
      startProduction(ai.owner, 'harvester', 'veh');   // economy first
    } else if (!rebuildEcon && army.length < diff.armyCap && spare > 250) {
      // counters read only scouted enemies, weighted toward the faction it means to hit
      const mix = diff.counters ? scoutedMix(ai, waveTargetOwner(ai.owner)) : null;
      const vehicles = hasBuilding(ai.owner, 'fab');
      if (hasBuilding(ai.owner, 'barracks') && !p.queues.inf.length && (!vehicles || rand() < doc.infShare)) {
        const pick = choose(ai.owner, doc.inf, mix, spare);
        if (pick) startProduction(ai.owner, pick, 'inf');
      }
      if (hasBuilding(ai.owner, 'fab') && !p.queues.veh.length && spare > doc.vehFunding) {
        const pick = choose(ai.owner, doc.veh, mix, spare);
        if (pick) startProduction(ai.owner, pick, 'veh');
      }
    }
  }

  // --- scouting: a fast unit takes a look when intel on the next target is stale ---
  ai.scoutTimer -= dt;
  if (ai.scoutTimer <= 0) {
    ai.scoutTimer = 75;
    const tgtOwner = waveTargetOwner(ai.owner);
    const fresh = Object.values(ai.intel).some(i => i.o === tgtOwner && ai.clock - i.t < 60);
    const tgt = tgtOwner >= 0 ? pickWaveTarget(ai.owner) : null;
    if (!fresh && tgt && !byId.has(ai.scoutId)) {
      const army = armyUnits(ai.owner).filter(u => u.order.type === 'idle' && !u.def.air);
      army.sort((x, y) => y.def.speed - x.def.speed);
      const scout = army.length >= 3 ? army[0] : undefined;
      if (scout) {
        const c = buildingCenter(tgt);
        ai.scoutId = scout.id;
        issueOrder(scout, { type: 'move', x: c.x + (rand() * 200 - 100), y: c.y + (rand() * 200 - 100) });
      }
    }
  }

  // --- attack waves: free-for-all — raid whichever enemy faction is closest ---
  ai.attackTimer -= dt;
  const army = armyUnits(ai.owner).filter(u => u.id !== ai.scoutId);
  const waveSize = Math.max(4, Math.min(16, 5 + doc.waveSize + Math.floor(ai.buildIndex / 3)));
  // someone close to securing the corridor pulls every wave onto the vents
  const corridorThreat = corridor.owner >= 0 && corridor.owner !== ai.owner && corridor.held > 30;
  if (corridorThreat && ai.attackTimer > 12 && army.length >= 4) ai.attackTimer = Math.min(ai.attackTimer, 4);
  if (ai.attackTimer <= 0 && army.length >= (corridorThreat ? 4 : waveSize)) {
    ai.attackTimer = (55 + rand() * 25) * diff.waveGapMul * doc.waveGap;
    let c: { x: number, y: number } | null = null;
    let victim = -1;
    const vents = neutrals.filter(n => n.kind === 'vent' && n.owner !== ai.owner);
    const threatVents = vents.filter(n => n.owner === corridor.owner);
    const roll = rand();
    if (corridorThreat && threatVents.length) {
      const n = threatVents[Math.floor(rand() * threatVents.length)];
      c = { x: (n.tx + 0.5) * TILE, y: (n.ty + 0.5) * TILE }; victim = n.owner;
    } else if (vents.length && roll < doc.ventBias) {
      const n = vents[Math.floor(rand() * vents.length)];
      c = { x: (n.tx + 0.5) * TILE, y: (n.ty + 0.5) * TILE }; victim = n.owner;
    } else if (roll < doc.ventBias + doc.raidEcon) {
      const t = pickEconTarget(ai.owner);
      if (t) { c = t; victim = waveTargetOwner(ai.owner); }
    }
    if (!c) {
      const targetB = pickWaveTarget(ai.owner);
      if (targetB) { c = buildingCenter(targetB); victim = targetB.owner; }
    }
    if (c) {
      for (const u of army) {
        issueOrder(u, { type: 'attackMove', x: c.x + (rand() * 160 - 80), y: c.y + (rand() * 160 - 80) });
      }
      if (victim === PLAYER) toast(`${FACTION_NAMES[ai.owner]} ${doc.tag} inbound`);
    }
  }

  // --- orbital strike: fire a ready uplink at the enemy's fattest cluster ---
  const uplink = buildings.find(b => b.owner === ai.owner && superReady(b));
  if (uplink) {
    const target = pickWaveTarget(ai.owner);
    if (target) {
      const c = buildingCenter(target);
      fireStrike(uplink, c.x + (rand() * 60 - 30), c.y + (rand() * 60 - 30));
    }
  }
}

// note every enemy unit within sight of this AI's units and structures
function gatherIntel(ai: AIState) {
  const eyes: { x: number, y: number, r: number }[] = [];
  for (const u of units) if (u.owner === ai.owner) eyes.push({ x: u.x, y: u.y, r: u.def.vision * TILE });
  for (const b of buildings) if (b.owner === ai.owner) { const c = buildingCenter(b); eyes.push({ x: c.x, y: c.y, r: b.def.vision * TILE }); }
  for (const u of units) {
    if (u.owner === ai.owner || u.def.harvester) continue;
    for (const e of eyes) {
      if (Math.abs(u.x - e.x) > e.r || Math.abs(u.y - e.y) > e.r) continue;
      if (Math.hypot(u.x - e.x, u.y - e.y) <= e.r) { ai.intel[u.id] = { a: kindOf(u.def.id), t: ai.clock, o: u.owner }; break; }
    }
  }
  for (const id in ai.intel) if (!byId.has(+id) || ai.clock - ai.intel[id].t > INTEL_MEMORY) delete ai.intel[id];
}

// share of each kind among scouted enemies (the intended victim counts double)
function scoutedMix(ai: AIState, focus: number): Record<Kind, number> | null {
  const mix: Record<Kind, number> = { infantry: 0, light: 0, heavy: 0, air: 0 };
  let total = 0;
  for (const id in ai.intel) { const i = ai.intel[id]; const w = i.o === focus ? 2 : 1; mix[i.a] += w; total += w; }
  if (total < 3) return null;   // too little seen to react to
  for (const k in mix) mix[k as Kind] /= total;
  return mix;
}

// weighted pick from a doctrine's preferences, bent toward what beats the scouted mix
function choose(owner: number, prefs: Record<string, number>, mix: Record<Kind, number> | null, spare: number): string | null {
  const p = players[owner];
  const options: [string, number][] = [];
  for (const id in prefs) {
    const d = UNITS[id];
    if (d.prereq && !hasBuilding(owner, d.prereq)) continue;
    if (d.prereqUp && !p.upgrades.has(d.prereqUp)) continue;
    if (d.cost > spare + 400) continue;
    let w = prefs[id];
    if (mix) {
      const dt = UNIT_DMGTYPE[id];
      const vs = (k: 'infantry' | 'light' | 'heavy') => dt ? DMG_TABLE[dt][k] : 0.8;
      const score = mix.infantry * vs('infantry') + mix.light * vs('light') + mix.heavy * vs('heavy')
                  + mix.air * (d.antiAir ? 1.6 : 0);
      w *= 0.25 + score * score;   // squared so a clear counter stands out
    }
    if (w > 0) options.push([id, w]);
  }
  if (!options.length) return null;
  let r = rand() * options.reduce((a, o) => a + o[1], 0);
  for (const [id, w] of options) if ((r -= w) <= 0) return id;
  return options[options.length - 1][0];
}

// harvesters or an extractor of the next target faction, for raiding doctrines
function pickEconTarget(owner: number): { x: number, y: number } | null {
  const victim = waveTargetOwner(owner);
  if (victim < 0) return null;
  const h = units.find(u => u.owner === victim && u.def.harvester);
  if (h) return { x: h.x, y: h.y };
  const ex = buildings.find(b => b.owner === victim && b.def.id === 'extractor');
  return ex ? buildingCenter(ex) : null;
}

function waveTargetOwner(owner: number) { return pickWaveTarget(owner)?.owner ?? -1; }

// nearest enemy faction's HQ (falling back to any of its structures) — the player
// gets no special treatment, so AIs raid each other too
function pickWaveTarget(owner: number) {
  const hq = myHQ(owner);
  if (!hq) return null;
  const myC = buildingCenter(hq);
  let bestOwner = -1, bestD = Infinity;
  for (const b of buildings) {
    if (b.owner === owner || b.def.isWall) continue;
    const c = buildingCenter(b);
    const d = Math.hypot(c.x - myC.x, c.y - myC.y);
    if (d < bestD) { bestD = d; bestOwner = b.owner; }
  }
  if (bestOwner === -1) return null;
  return buildings.find(b => b.owner === bestOwner && b.def.id === 'nexus')
      ?? buildings.find(b => b.owner === bestOwner && !b.def.isWall) ?? null;
}

export function updateAI(dt: number) {
  for (const ai of ais) {
    if (ai.owner >= numPlayers) continue;
    updateOne(ai, dt);
  }
}
