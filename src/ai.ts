import { TILE, BUILDINGS, UPGRADES } from './config';
import {
  buildings, units, players, startProduction, placeBuilding, canPlace,
  issueOrder, hasBuilding, buildingCenter, powerOf, numPlayers, deployPioneer, tileOf,
  startRepair, repairCost,
} from './game';
import { rand, crystal, idx, nearestTile } from './map';

// Each AI opponent follows a long build order toward a large fortified base,
// keeps its economy running, researches upgrades, and attacks in growing waves.

const BUILD_ORDER = [
  'solar', 'extractor', 'barracks', 'solar', 'fab', 'turret', 'extractor',
  'solar', 'turret', 'spire', 'lab', 'solar', 'railgun', 'turret',
  'extractor', 'solar', 'repairyard', 'turret', 'railgun', 'solar', 'turret',
  // late game: research-gated fortifications (skipped until unlocked)
  'fusion', 'arctower', 'turret', 'arctower', 'bastion', 'railgun', 'fusion', 'bastion',
];
const RESEARCH_ORDER = ['wpn1', 'arm1', 'def1', 'wpn2', 'arm2', 'def2', 'wpn3', 'arm3'];

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
    });
    if (diff.headStart) players[i + 1].upgrades.add('wpn1'); // hard AIs land pre-armed
  }
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

  // modest income trickle so the AI keeps developing even with a lean economy
  p.credits += diff.trickle * dt;

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
    if (p.credits > UPGRADES[up].cost + 1500 && startProduction(ai.owner, up, 'ups')) {
      ai.researchIndex++;
    }
  }

  // --- unit training ---
  // keep a minimal defence force, but otherwise save up for the next building
  ai.trainCooldown -= dt;
  if (ai.trainCooldown <= 0) {
    ai.trainCooldown = 1.5;
    const army = armyUnits(ai.owner);
    const harvesters = units.filter(u => u.owner === ai.owner && u.def.harvester).length;
    const spare = p.credits - reserve;
    if (harvesters < 2 && hasBuilding(ai.owner, 'fab') && spare >= 1400 && !p.queues.veh.length) {
      startProduction(ai.owner, 'harvester', 'veh');   // economy first
    } else if (army.length < diff.armyCap && (spare > 500 || army.length < 6)) {
      // composition counter: read the player's army and lean into what beats it
      let vsVehicles = false, vsInfantry = false;
      if (diff.counters) {
        let inf = 0, veh = 0;
        for (const u of units) {
          if (u.owner !== 0 || u.def.harvester) continue;
          if (u.def.tab === 'inf') inf++; else veh++;
        }
        vsVehicles = veh > inf + 2;
        vsInfantry = inf > veh + 4;
      }
      if (hasBuilding(ai.owner, 'barracks') && !p.queues.inf.length) {
        const roll = rand();
        let pick = vsVehicles ? (roll < 0.65 ? 'rocketeer' : 'trooper')          // rockets shred armor
                 : vsInfantry ? (roll < 0.5 ? 'pyro' : 'vanguard')               // flame + armor vs mobs
                 : roll < 0.4 ? 'trooper' : roll < 0.55 ? 'pyro' : roll < 0.8 ? 'rocketeer' : 'vanguard';
        // elite infantry once the research is in
        if (p.upgrades.has('arm2') && roll < 0.2 && spare > 1500) pick = 'juggernaut';
        else if (p.upgrades.has('wpn1') && roll > 0.85 && spare > 1000) pick = 'sniper';
        startProduction(ai.owner, pick, 'inf');
      }
      if (hasBuilding(ai.owner, 'fab') && !p.queues.veh.length && spare > 1200) {
        const roll = rand();
        const advanced = hasBuilding(ai.owner, 'spire');
        let pick = advanced && roll < 0.2 ? 'dominator'
                 : advanced && roll < 0.35 ? 'artillery'
                 : roll < 0.45 ? 'ranger' : roll < 0.6 ? 'raider' : roll < 0.72 ? 'warden' : 'hovertank';
        if (vsInfantry && advanced && roll < 0.4) pick = 'artillery'; // splash vs infantry mobs
        if (advanced && p.upgrades.has('wpn2') && roll < 0.12 && spare > 4000) pick = 'colossus';
        startProduction(ai.owner, pick, 'veh');
      }
    }
  }

  // --- attack waves: free-for-all — raid whichever enemy faction is closest ---
  ai.attackTimer -= dt;
  const army = armyUnits(ai.owner);
  const waveSize = 6 + Math.floor(ai.buildIndex / 2);
  if (ai.attackTimer <= 0 && army.length >= waveSize) {
    ai.attackTimer = (55 + rand() * 25) * diff.waveGapMul;
    const targetB = pickWaveTarget(ai.owner);
    if (targetB) {
      const c = buildingCenter(targetB);
      for (const u of army) {
        issueOrder(u, { type: 'attackMove', x: c.x + (rand() * 160 - 80), y: c.y + (rand() * 160 - 80) });
      }
    }
  }
}

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
