// All game balance data lives here — tweak freely.

export const TILE = 32;

export const START_CREDITS = 5000;
export const HARVEST_RATE = 150;      // credits worth of crystal per second while harvesting
export const HARVESTER_CAPACITY = 500;
export const LOW_POWER_SPEED = 0.4;   // build-speed multiplier when power is insufficient
export const BUILD_RADIUS = 5;        // new buildings must be within this many tiles of an existing one

export type Tab = 'build' | 'def' | 'inf' | 'veh' | 'ups';
export const TAB_NAMES: Record<Tab, string> = {
  build: 'Structures', def: 'Defence', inf: 'Infantry', veh: 'Vehicles', ups: 'Research',
};

export interface UnitDef {
  id: string;
  name: string;
  tab: 'inf' | 'veh';
  cost: number;
  buildTime: number;   // seconds
  hp: number;
  speed: number;       // tiles per second
  damage: number;      // 0 = unarmed
  range: number;       // tiles
  reload: number;      // seconds between shots
  vision: number;      // tiles
  radius: number;      // pixels, for drawing / hit checks
  harvester?: boolean;
  prereq?: string;     // building def id required
  prereqUp?: string;   // research upgrade id required
  desc?: string;
  // 8-direction isometric sprites: /sprites/u_<model><mstep>_<dir>.png
  model: 'soldier' | 'mech' | 'mech2' | 'car' | 'drone';
  mstep: 1 | 2 | 3;    // pack design variant (steel / green tech / purple)
  spriteH: number;     // drawn height in pixels
  // weapons fire instant beams unless given a projectile type
  weapon?: 'shell' | 'rocket';
  splash?: number;     // splash radius in tiles (projectiles only)
  deploysTo?: string;  // building this unit can deploy into (Pioneer → Command Post)
}

export interface BuildingDef {
  id: string;
  name: string;
  tab: 'build' | 'def';
  cost: number;
  buildTime: number;
  hp: number;
  power: number;       // + supplies, - drains
  w: number;           // footprint in tiles
  h: number;
  vision: number;
  prereq?: string;
  prereqUp?: string;   // research upgrade id required
  produces?: 'inf' | 'veh';
  turret?: { damage: number; range: number; reload: number };
  grantsHarvester?: boolean;
  isWall?: boolean;
  healRate?: number;   // hp per second restored to friendly units within 5 tiles
  desc?: string;
  sprite?: string;     // file in /sprites (walls & fallbacks draw procedurally)
  upgradable?: boolean;
  superweapon?: { charge: number; damage: number; radius: number }; // orbital strike
  limit?: number;      // max this faction may own (e.g. 1 for the superweapon)
}

export const UNITS: Record<string, UnitDef> = {
  trooper:   { id: 'trooper',   name: 'Trooper',        tab: 'inf', cost: 200,  buildTime: 4,  hp: 100, speed: 2.2, damage: 10, range: 4,   reload: 1.0, vision: 5, radius: 8,  model: 'soldier', mstep: 1, spriteH: 26,
               desc: 'Cheap, expendable, everywhere. Helion’s coilgun infantry.' },
  rocketeer: { id: 'rocketeer', name: 'Rocket Trooper', tab: 'inf', cost: 350,  buildTime: 6,  hp: 90,  speed: 2.0, damage: 35, range: 5,   reload: 2.2, vision: 5, radius: 8,  model: 'soldier', mstep: 3, spriteH: 26, weapon: 'rocket', splash: 0.8,
               desc: 'Shoulder-launched anti-armor. Melts tanks, hates knives.' },
  vanguard:  { id: 'vanguard',  name: 'Vanguard',       tab: 'inf', cost: 500,  buildTime: 8,  hp: 260, speed: 1.8, damage: 18, range: 3.5, reload: 0.8, vision: 5, radius: 9,  model: 'soldier', mstep: 2, spriteH: 30,
               desc: 'Exo-armored shock trooper. Walks in first, walks out last.' },
  ranger:    { id: 'ranger',    name: 'Scout Ranger',   tab: 'veh', cost: 500,  buildTime: 6,  hp: 150, speed: 5.0, damage: 12, range: 4,   reload: 0.8, vision: 8, radius: 11, model: 'car', mstep: 1, spriteH: 32,
               desc: 'Fast recon rover. Finds trouble before trouble finds you.' },
  hovertank: { id: 'hovertank', name: 'Strider Mech',   tab: 'veh', cost: 900,  buildTime: 10, hp: 400, speed: 3.0, damage: 40, range: 5,   reload: 1.8, vision: 6, radius: 14, model: 'mech2', mstep: 1, spriteH: 38,
               desc: 'Mainline battle walker. The backbone of any assault.' },
  artillery: { id: 'artillery', name: 'Thumper',        tab: 'veh', cost: 1400, buildTime: 14, hp: 280, speed: 1.6, damage: 90, range: 9,   reload: 4.0, vision: 7, radius: 14, model: 'mech', mstep: 2, spriteH: 40, prereq: 'spire', weapon: 'shell', splash: 1.5,
               desc: 'Long-range seismic artillery walker. Shells an area — devastates groups.' },
  dominator: { id: 'dominator', name: 'Dominator',      tab: 'veh', cost: 1750, buildTime: 16, hp: 800, speed: 2.0, damage: 70, range: 5.5, reload: 2.4, vision: 6, radius: 17, model: 'mech', mstep: 1, spriteH: 52, weapon: 'shell', splash: 0.9,
               desc: 'Twin-cannon siege mech. Slow. Unstoppable. Requires Research Spire.' },
  pioneer:   { id: 'pioneer',   name: 'Pioneer',        tab: 'veh', cost: 2000, buildTime: 16, hp: 500, speed: 1.8, damage: 0,  range: 0,   reload: 0,   vision: 6, radius: 15, model: 'drone', mstep: 3, spriteH: 42, prereq: 'fab', deploysTo: 'outpost',
               desc: 'Mobile expansion base. Drive it to a fresh crystal field and DEPLOY.' },
  harvester: { id: 'harvester', name: 'Harvester',      tab: 'veh', cost: 1400, buildTime: 12, hp: 600, speed: 2.5, damage: 0,  range: 0,   reload: 0,   vision: 5, radius: 15, model: 'drone', mstep: 1, spriteH: 40, harvester: true,
               desc: 'Hover-drone that mines flux crystal and hauls it to an Extractor. Protect it.' },

  pyro:      { id: 'pyro',      name: 'Pyro',           tab: 'inf', cost: 450,  buildTime: 6,  hp: 140,  speed: 2.3, damage: 9,   range: 2.2, reload: 0.25, vision: 4, radius: 8, model: 'soldier', mstep: 2, spriteH: 26,
               desc: 'Point-blank plasma thrower. Shreds infantry up close.' },
  raider:    { id: 'raider',    name: 'Raider',         tab: 'veh', cost: 650,  buildTime: 7,  hp: 180,  speed: 5.5, damage: 15,  range: 3.5, reload: 0.6, vision: 6, radius: 11, model: 'car', mstep: 3, spriteH: 32,
               desc: 'Stripped-down harassment buggy. Hit the harvesters, run.' },
  warden:    { id: 'warden',    name: 'Warden Drone',   tab: 'veh', cost: 1100, buildTime: 10, hp: 220,  speed: 4.2, damage: 22,  range: 4.5, reload: 0.5, vision: 7, radius: 12, model: 'drone', mstep: 2, spriteH: 36, prereq: 'fab',
               desc: 'Armed hover-drone. Fast response, thin armor.' },

  // ---- research-gated elite tier ----
  sniper:    { id: 'sniper',    name: 'Ghost Sniper',   tab: 'inf', cost: 800,  buildTime: 9,  hp: 80,   speed: 2.4, damage: 60,  range: 7,  reload: 3.0, vision: 8, radius: 8,  model: 'soldier', mstep: 3, spriteH: 28, prereq: 'lab', prereqUp: 'wpn1',
               desc: 'One shot, one kill, from outside their vision. Requires Weapons I.' },
  juggernaut:{ id: 'juggernaut',name: 'Juggernaut',     tab: 'inf', cost: 1200, buildTime: 12, hp: 600,  speed: 1.5, damage: 30,  range: 4,  reload: 0.7, vision: 5, radius: 11, model: 'mech2', mstep: 2, spriteH: 30, prereq: 'lab', prereqUp: 'arm2',
               desc: 'A soldier in a walking bunker. Requires Armor II.' },
  colossus:  { id: 'colossus',  name: 'Colossus',       tab: 'veh', cost: 3000, buildTime: 22, hp: 1500, speed: 1.6, damage: 120, range: 6,  reload: 2.8, vision: 7, radius: 19, model: 'mech', mstep: 3, spriteH: 62, prereq: 'spire', prereqUp: 'wpn2', weapon: 'shell', splash: 1.2,
               desc: 'Superheavy siege platform. The ground remembers where it walked. Requires Weapons II.' },
};

export const BUILDINGS: Record<string, BuildingDef> = {
  nexus:     { id: 'nexus',     name: 'Nexus HQ',       tab: 'build', cost: 3000, buildTime: 20, hp: 1500, power: 50,   w: 3, h: 3, vision: 8, sprite: 'bld_hq', upgradable: true,
               desc: 'Colony command core. Lose it and the operation is over.' },
  solar:     { id: 'solar',     name: 'Solar Array',    tab: 'build', cost: 800,  buildTime: 6,  hp: 500,  power: 100,  w: 2, h: 2, vision: 4, sprite: 'bld_power',
               desc: '+100 power. Everything else runs on these.' },
  extractor: { id: 'extractor', name: 'Extractor',      tab: 'build', cost: 2000, buildTime: 12, hp: 900,  power: -30,  w: 3, h: 2, vision: 5, prereq: 'solar', grantsHarvester: true, sprite: 'bld_refinery',
               desc: 'Refines flux crystal into credits. Includes a free Harvester.' },
  barracks:  { id: 'barracks',  name: 'Barracks',       tab: 'build', cost: 500,  buildTime: 6,  hp: 700,  power: -20,  w: 2, h: 2, vision: 5, prereq: 'solar', produces: 'inf', sprite: 'bld_barracks', upgradable: true,
               desc: 'Trains infantry. Unlocks basic defences.' },
  fab:       { id: 'fab',       name: 'Fabricator',     tab: 'build', cost: 2000, buildTime: 14, hp: 1000, power: -30,  w: 3, h: 3, vision: 5, prereq: 'extractor', produces: 'veh', sprite: 'bld_workshop', upgradable: true,
               desc: 'Prints vehicles, from skimmers to siege crawlers.' },
  spire:     { id: 'spire',     name: 'Research Spire', tab: 'build', cost: 1500, buildTime: 12, hp: 600,  power: -50,  w: 2, h: 2, vision: 5, prereq: 'fab', sprite: 'bld_tower',
               desc: 'Advanced weapons lab. Unlocks the Dominator and Thumper.' },
  lab:       { id: 'lab',       name: 'Laboratory',     tab: 'build', cost: 1800, buildTime: 14, hp: 650,  power: -40,  w: 2, h: 2, vision: 5, prereq: 'barracks', sprite: 'bld_greenhouse',
               desc: 'Unlocks the Research tab: weapon, armor and defence upgrades.' },
  fusion:    { id: 'fusion',    name: 'Fusion Reactor', tab: 'build', cost: 2600, buildTime: 16, hp: 800,  power: 250,  w: 2, h: 2, vision: 4, prereq: 'lab', prereqUp: 'def1', sprite: 'bld_power', upgradable: true,
               desc: '+250 power from a caged star. Requires Defence Grid I.' },
  outpost:   { id: 'outpost',   name: 'Command Post',   tab: 'build', cost: 2000, buildTime: 1,  hp: 1000, power: 25,   w: 2, h: 2, vision: 8, sprite: 'bld_hq', upgradable: true,
               desc: 'Deployed from a Pioneer. Lets you build (and mine) far from home.' },
  sensor:    { id: 'sensor',    name: 'Sensor Array',   tab: 'build', cost: 900,  buildTime: 8,  hp: 450,  power: -15,  w: 1, h: 1, vision: 14, prereq: 'barracks',
               desc: 'Long-range radar. Sees trouble coming from very far away.' },
  repairyard:{ id: 'repairyard',name: 'Repair Yard',    tab: 'build', cost: 1600, buildTime: 12, hp: 800,  power: -25,  w: 2, h: 2, vision: 5, prereq: 'fab', healRate: 12,
               desc: 'Field workshop. Slowly repairs all friendly units nearby.' },
  uplink:    { id: 'uplink',    name: 'Orbital Uplink', tab: 'build', cost: 5000, buildTime: 25, hp: 750,  power: -150, w: 2, h: 2, vision: 6, prereq: 'spire', prereqUp: 'orbital', limit: 1, sprite: 'bld_silo', superweapon: { charge: 300, damage: 750, radius: 3.6 },
               desc: 'The ark-fleet\'s main gun. A cataclysmic strike every 5 minutes. One per faction. Requires Orbital Protocol research.' },

  wall:      { id: 'wall',      name: 'Barrier Wall',   tab: 'def',   cost: 100,  buildTime: 1.5, hp: 500, power: 0,    w: 1, h: 1, vision: 1, isWall: true,
               desc: 'Cheap plasteel segment. Slows a push, absorbs fire.' },
  turret:    { id: 'turret',    name: 'Pulse Turret',   tab: 'def',   cost: 1000, buildTime: 8,  hp: 600,  power: -25,  w: 1, h: 1, vision: 7, prereq: 'barracks', turret: { damage: 30, range: 6.5, reload: 1.0 }, upgradable: true,
               desc: 'Automated base defence. Goes offline without power.' },
  railgun:   { id: 'railgun',   name: 'Rail Cannon',    tab: 'def',   cost: 1800, buildTime: 12, hp: 850,  power: -40,  w: 2, h: 2, vision: 9, prereq: 'spire', turret: { damage: 95, range: 8.5, reload: 2.4 }, sprite: 'bld_silo', upgradable: true,
               desc: 'Hypervelocity siege deterrent. Expensive, worth it.' },

  // ---- research-gated elite tier ----
  heavywall: { id: 'heavywall', name: 'Bulwark Wall',   tab: 'def',   cost: 300,  buildTime: 2.5, hp: 1500, power: 0,   w: 1, h: 1, vision: 1, isWall: true, prereqUp: 'arm1',
               desc: 'Triple-plated composite barrier. Requires Armor I.' },
  arctower:  { id: 'arctower',  name: 'Arc Tower',      tab: 'def',   cost: 2400, buildTime: 13, hp: 700,  power: -35,  w: 1, h: 1, vision: 8, prereq: 'lab', prereqUp: 'def1', turret: { damage: 55, range: 7, reload: 0.8 }, upgradable: true,
               desc: 'Rapid-discharge lightning emitter. Requires Defence Grid I.' },
  bastion:   { id: 'bastion',   name: 'Bastion Battery', tab: 'def',  cost: 3500, buildTime: 18, hp: 1400, power: -60,  w: 2, h: 2, vision: 10, prereq: 'railgun', prereqUp: 'def2', turret: { damage: 150, range: 9, reload: 3.0 }, sprite: 'bld_silo', upgradable: true,
               desc: 'Quad-cannon fortress emplacement. Requires Defence Grid II.' },
};

// Buildings that can never be queued from the build bar
export const NON_BUILDABLE = new Set(['nexus', 'outpost']);

// building repair: cost fraction of base price for a full heal, healing rate per second
export const REPAIR_COST = 0.3;
export const REPAIR_RATE = 0.08;

// neutral objectives: hold ground near them with combat units to capture
export const VENT_INCOME = 8;     // flux per second while you hold a vent
export const CAPTURE_RADIUS = 3.5; // tiles
export const CAPTURE_TIME = 6;     // seconds of uncontested presence to flip it
export const TOWER_VISION = 13;    // watchtower reveal radius (tiles)

// ---- research upgrades (need a Laboratory) ----
export interface UpgradeDef {
  id: string;
  name: string;
  cost: number;
  buildTime: number;
  desc: string;
  prereqUp?: string;   // previous tier
}
export const UPGRADES: Record<string, UpgradeDef> = {
  wpn1: { id: 'wpn1', name: 'Weapons I',   cost: 800,  buildTime: 15, desc: '+15% damage for all your troops and vehicles.' },
  wpn2: { id: 'wpn2', name: 'Weapons II',  cost: 1200, buildTime: 20, desc: '+15% more damage.', prereqUp: 'wpn1' },
  wpn3: { id: 'wpn3', name: 'Weapons III', cost: 1600, buildTime: 25, desc: '+15% more damage.', prereqUp: 'wpn2' },
  arm1: { id: 'arm1', name: 'Armor I',     cost: 800,  buildTime: 15, desc: '+15% hit points for newly built units.' },
  arm2: { id: 'arm2', name: 'Armor II',    cost: 1200, buildTime: 20, desc: '+15% more hit points.', prereqUp: 'arm1' },
  arm3: { id: 'arm3', name: 'Armor III',   cost: 1600, buildTime: 25, desc: '+15% more hit points.', prereqUp: 'arm2' },
  def1: { id: 'def1', name: 'Defence Grid I',  cost: 1000, buildTime: 18, desc: '+25% turret damage.' },
  def2: { id: 'def2', name: 'Defence Grid II', cost: 1500, buildTime: 24, desc: '+25% more turret damage.', prereqUp: 'def1' },
  // prestige unlock: gates the Orbital Uplink superweapon
  orbital: { id: 'orbital', name: 'Orbital Protocol', cost: 3000, buildTime: 45, desc: 'Establishes a fire-control link to the ark-fleet. Unlocks the Orbital Uplink. Requires Weapons III.', prereqUp: 'wpn3' },
};
export const WPN_BONUS = 0.15, ARM_BONUS = 0.15, DEF_BONUS = 0.25;

// building upgrade economics (per level, up to 3)
export const BLD_UPGRADE_COST = 0.6;   // fraction of base cost per level
export const BLD_UPGRADE_HP = 0.5;     // +50% max hp per level
export const BLD_UPGRADE_DMG = 0.3;    // +30% turret damage per level

// ---- damage types: rock-paper-scissors combat ----
// every target has an armor class; every weapon a damage type. The table below
// multiplies damage, so unit composition and counters actually matter.
export type ArmorClass = 'infantry' | 'light' | 'heavy' | 'structure';
export type DmgType = 'gun' | 'flame' | 'rocket' | 'cannon' | 'sniper';

export const UNIT_ARMOR: Record<string, ArmorClass> = {
  trooper: 'infantry', rocketeer: 'infantry', vanguard: 'infantry', pyro: 'infantry', sniper: 'infantry',
  ranger: 'light', raider: 'light', warden: 'light', harvester: 'light', pioneer: 'light',
  hovertank: 'heavy', artillery: 'heavy', dominator: 'heavy', colossus: 'heavy', juggernaut: 'heavy',
};
export const UNIT_DMGTYPE: Record<string, DmgType> = {
  trooper: 'gun', vanguard: 'gun', ranger: 'gun', raider: 'gun', warden: 'gun', juggernaut: 'gun',
  pyro: 'flame', rocketeer: 'rocket', sniper: 'sniper',
  hovertank: 'cannon', artillery: 'cannon', dominator: 'cannon', colossus: 'cannon',
};
export const TURRET_DMGTYPE: Record<string, DmgType> = {
  turret: 'gun', arctower: 'gun', railgun: 'cannon', bastion: 'cannon',
};
// multiplier[weapon dmgType][target armor class]
export const DMG_TABLE: Record<DmgType, Record<ArmorClass, number>> = {
  gun:    { infantry: 1.0, light: 0.9, heavy: 0.5, structure: 0.6 },  // coilguns — vs soft targets
  flame:  { infantry: 1.8, light: 1.0, heavy: 0.4, structure: 0.8 },  // pyro — shreds infantry, useless vs armor
  rocket: { infantry: 0.5, light: 1.4, heavy: 1.7, structure: 1.2 },  // anti-armor — wasted on infantry
  cannon: { infantry: 0.7, light: 1.2, heavy: 1.4, structure: 1.5 },  // shells — vs armor & buildings
  sniper: { infantry: 2.0, light: 0.7, heavy: 0.5, structure: 0.3 },  // precision — vs infantry only
};

export const PLAYER = 0;
// player is blue; AI opponents take the other Kenney unit palettes
export const TEAM_COLORS = ['#4db8ff', '#e58a3a', '#57c46a', '#a7abb8'];
export const FACTION_NAMES = ['Helion Dynamics', 'Kessler Collective', 'Verdant Pact', 'Ashen Syndicate'];
