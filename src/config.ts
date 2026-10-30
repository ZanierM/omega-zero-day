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
  ability?: AbilityDef;
  air?: boolean;       // aircraft: fly over terrain, only anti-air weapons can hit them
  antiAir?: boolean;   // this unit's weapon can hit aircraft
  nonBuildable?: boolean;   // campaign-only (the Hollow): never on a build bar
  crystalRegen?: number;    // hp/s healed while standing within 2 tiles of crystal
  healAura?: { radius: number; rate: number };   // heals friendly units around it (hp/s; doubled near crystal)
  shield?: number;          // the Keepers: an energy shield that soaks damage first and recharges
  shieldAura?: { radius: number; rate: number };  // restores allies' shields (per second)
}

// active/toggle unit abilities, fully data-driven
export interface AbilityDef {
  id: string;
  name: string;
  kind: 'toggle' | 'active';
  cooldown: number;    // seconds between uses (active only)
  duration: number;    // seconds a timed effect lasts (0 = instant / until toggled off)
  desc: string;
  // effect modifiers (multipliers unless noted)
  rangeMul?: number;
  dmgMul?: number;
  resist?: number;     // fraction of incoming damage taken (0.5 = half)
  speedMul?: number;
  reloadMul?: number;  // <1 = faster
  immobile?: boolean;  // can't move while the toggle/effect is on
  aoeDmg?: number;     // instant area damage on activation
  aoeRadius?: number;  // tiles
}

export const ABILITIES: Record<string, AbilityDef> = {
  siege:      { id: 'siege',      name: 'Siege Mode',    kind: 'toggle', cooldown: 0,  duration: 0, immobile: true, rangeMul: 1.8, dmgMul: 1.7,
               desc: 'Deploy: immobile, but +80% range and +70% damage. Toggle to pack up.' },
  brace:      { id: 'brace',      name: 'Brace',         kind: 'toggle', cooldown: 0,  duration: 0, immobile: true, resist: 0.45,
               desc: 'Dig in: take 55% less damage but hold position. Toggle off to move.' },
  overdrive:  { id: 'overdrive',  name: 'Overdrive',     kind: 'active', cooldown: 12, duration: 4, speedMul: 1.9,
               desc: '+90% speed for 4s. Strike the harvesters and run.' },
  overcharge: { id: 'overcharge', name: 'Overcharge',    kind: 'active', cooldown: 14, duration: 5, reloadMul: 0.45,
               desc: 'Double fire rate for 5s.' },
  stomp:      { id: 'stomp',      name: 'Seismic Stomp', kind: 'active', cooldown: 14, duration: 0, aoeDmg: 220, aoeRadius: 2.4,
               desc: 'Slam the ground for heavy damage to everything nearby.' },
};

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
  turret?: { damage: number; range: number; reload: number; antiAir?: boolean; airOnly?: boolean };
  grantsHarvester?: boolean;
  isWall?: boolean;
  healRate?: number;   // hp per second restored to friendly units within 5 tiles
  desc?: string;
  sprite?: string;     // file in /sprites (walls & fallbacks draw procedurally)
  upgradable?: boolean;
  superweapon?: { charge: number; damage: number; radius: number }; // orbital strike
  limit?: number;      // max this faction may own (e.g. 1 for the superweapon)
  nonBuildable?: boolean;   // the Vey brood's living structures: never on a build bar
  bloom?: number;           // radius (tiles) of living ground it spreads around itself
  shield?: number;          // the Keepers: an energy shield that soaks damage first and recharges
}

export const UNITS: Record<string, UnitDef> = {
  trooper:   { id: 'trooper',   name: 'Trooper',        tab: 'inf', cost: 200,  buildTime: 4,  hp: 100, speed: 2.2, damage: 10, range: 4,   reload: 1.0, vision: 5, radius: 8,  model: 'soldier', mstep: 1, spriteH: 26, antiAir: true,
               desc: 'Cheap, expendable, everywhere. Helion’s coilgun infantry.' },
  rocketeer: { id: 'rocketeer', name: 'Rocket Trooper', tab: 'inf', cost: 350,  buildTime: 6,  hp: 90,  speed: 2.0, damage: 35, range: 5,   reload: 2.2, vision: 5, radius: 8,  model: 'soldier', mstep: 3, spriteH: 26, weapon: 'rocket', splash: 0.5, antiAir: true,
               desc: 'Shoulder-launched anti-armor. Melts tanks, hates knives.' },
  vanguard:  { id: 'vanguard',  name: 'Vanguard',       tab: 'inf', cost: 500,  buildTime: 8,  hp: 260, speed: 1.8, damage: 18, range: 3.5, reload: 0.8, vision: 5, radius: 9,  model: 'soldier', mstep: 2, spriteH: 30, ability: ABILITIES.brace,
               desc: 'Exo-armored shock trooper. Walks in first, walks out last.' },
  ranger:    { id: 'ranger',    name: 'Scout Ranger',   tab: 'veh', cost: 500,  buildTime: 6,  hp: 150, speed: 5.0, damage: 12, range: 4,   reload: 0.8, vision: 8, radius: 11, model: 'car', mstep: 1, spriteH: 32,
               desc: 'Fast recon rover. Finds trouble before trouble finds you.' },
  hovertank: { id: 'hovertank', name: 'Strider Hovertank', tab: 'veh', cost: 900,  buildTime: 10, hp: 400, speed: 3.0, damage: 40, range: 5,   reload: 1.8, vision: 6, radius: 14, model: 'mech2', mstep: 1, spriteH: 38,
               desc: 'Armored hover tank. Glides over rough ground and drives a heavy cannon through enemy lines.' },
  artillery: { id: 'artillery', name: 'Thumper',        tab: 'veh', cost: 1400, buildTime: 14, hp: 280, speed: 1.6, damage: 90, range: 9,   reload: 4.0, vision: 7, radius: 14, model: 'mech', mstep: 2, spriteH: 40, prereq: 'spire', weapon: 'shell', splash: 1.5, ability: ABILITIES.siege,
               desc: 'Long-range seismic artillery walker. Shells an area — devastates groups.' },
  dominator: { id: 'dominator', name: 'Dominator',      tab: 'veh', cost: 1750, buildTime: 16, hp: 800, speed: 2.0, damage: 70, range: 5.5, reload: 2.4, vision: 6, radius: 17, model: 'mech', mstep: 1, spriteH: 52, weapon: 'shell', splash: 0.9,
               desc: 'Twin-cannon siege mech. Slow. Unstoppable. Requires Research Spire.' },
  pioneer:   { id: 'pioneer',   name: 'Pioneer',        tab: 'veh', cost: 2000, buildTime: 16, hp: 500, speed: 1.8, damage: 0,  range: 0,   reload: 0,   vision: 6, radius: 15, model: 'drone', mstep: 3, spriteH: 42, prereq: 'fab', deploysTo: 'outpost',
               desc: 'Mobile expansion base. Drive it to a fresh crystal field and DEPLOY.' },
  harvester: { id: 'harvester', name: 'Harvester',      tab: 'veh', cost: 1400, buildTime: 12, hp: 600, speed: 2.5, damage: 0,  range: 0,   reload: 0,   vision: 5, radius: 15, model: 'drone', mstep: 1, spriteH: 40, harvester: true,
               desc: 'Hover-drone that mines flux crystal and hauls it to an Extractor. Protect it.' },

  gunship:   { id: 'gunship',   name: 'Skyhawk',        tab: 'veh', cost: 1200, buildTime: 12, hp: 260, speed: 4.5, damage: 24,  range: 4.5, reload: 0.6, vision: 8, radius: 13, model: 'drone', mstep: 1, spriteH: 30, prereq: 'skyport', air: true, antiAir: true,
               desc: 'Fast strike VTOL. Ignores terrain, dogfights other aircraft. Cannons cannot touch it.' },
  bomber:    { id: 'bomber',    name: 'Ravager',        tab: 'veh', cost: 2200, buildTime: 18, hp: 520, speed: 2.6, damage: 160, range: 2.2, reload: 3.5, vision: 6, radius: 16, model: 'drone', mstep: 3, spriteH: 34, prereq: 'skyport', air: true, weapon: 'shell', splash: 1.6,
               desc: 'Heavy bomber. Slow, but its payload levels structures. Escort it.' },

  pyro:      { id: 'pyro',      name: 'Pyro',           tab: 'inf', cost: 450,  buildTime: 6,  hp: 185,  speed: 2.9, damage: 9,   range: 2.2, reload: 0.25, vision: 4, radius: 8, model: 'soldier', mstep: 2, spriteH: 26,
               desc: 'Point-blank plasma thrower. Shreds infantry up close.' },
  raider:    { id: 'raider',    name: 'Raider',         tab: 'veh', cost: 650,  buildTime: 7,  hp: 180,  speed: 5.5, damage: 15,  range: 3.5, reload: 0.6, vision: 6, radius: 11, model: 'car', mstep: 3, spriteH: 32, ability: ABILITIES.overdrive,
               desc: 'Stripped-down harassment buggy. Hit the harvesters, run.' },
  warden:    { id: 'warden',    name: 'Warden Drone',   tab: 'veh', cost: 1100, buildTime: 10, hp: 220,  speed: 4.2, damage: 22,  range: 4.5, reload: 0.5, vision: 7, radius: 12, model: 'drone', mstep: 2, spriteH: 36, prereq: 'fab', ability: ABILITIES.overcharge, antiAir: true,
               desc: 'Armed hover-drone. Fast response, thin armor.' },

  // ---- research-gated elite tier ----
  sniper:    { id: 'sniper',    name: 'Ghost Sniper',   tab: 'inf', cost: 800,  buildTime: 9,  hp: 80,   speed: 2.4, damage: 60,  range: 7,  reload: 3.0, vision: 8, radius: 8,  model: 'soldier', mstep: 3, spriteH: 28, prereq: 'lab', prereqUp: 'wpn1', antiAir: true,
               desc: 'One shot, one kill, from outside their vision. Requires Weapons I.' },
  juggernaut:{ id: 'juggernaut',name: 'Juggernaut',     tab: 'inf', cost: 1200, buildTime: 12, hp: 600,  speed: 1.5, damage: 30,  range: 4,  reload: 0.7, vision: 5, radius: 11, model: 'mech2', mstep: 2, spriteH: 30, prereq: 'lab', prereqUp: 'arm2',
               desc: 'A soldier in a walking bunker. Requires Armor II.' },
  colossus:  { id: 'colossus',  name: 'Colossus',       tab: 'veh', cost: 3000, buildTime: 22, hp: 1500, speed: 1.6, damage: 120, range: 6,  reload: 2.8, vision: 7, radius: 19, model: 'mech', mstep: 3, spriteH: 62, prereq: 'spire', prereqUp: 'wpn2', weapon: 'shell', splash: 1.2, ability: ABILITIES.stomp,
               desc: 'Superheavy siege platform. The ground remembers where it walked. Requires Weapons II.' },
  // ---- the Keepers: the Vey's makers, come back to judge (AI only) ----
  acolyte:   { id: 'acolyte',   name: 'Acolyte',        tab: 'inf', cost: 300,  buildTime: 6,  hp: 130,  speed: 2.4, damage: 17,  range: 5.5, reload: 1.0, vision: 7, radius: 9,  model: 'soldier', mstep: 3, spriteH: 28, nonBuildable: true, shield: 90, antiAir: true,
               desc: 'Tall, unhurried, wrapped in light. Its rifle is a thread of the sun.' },
  lancer:    { id: 'lancer',    name: 'Lancer',         tab: 'veh', cost: 650,  buildTime: 9,  hp: 260,  speed: 4.6, damage: 46,  range: 3.2, reload: 1.5, vision: 7, radius: 13, model: 'car', mstep: 3, spriteH: 32, nonBuildable: true, shield: 160,
               desc: 'A gold skimmer that runs down armour and pins it with a lance of light.' },
  luminar:   { id: 'luminar',   name: 'Luminar',        tab: 'veh', cost: 550,  buildTime: 9,  hp: 180,  speed: 3.2, damage: 8,   range: 4,   reload: 1.0, vision: 9, radius: 11, model: 'drone', mstep: 3, spriteH: 28, nonBuildable: true, air: true, antiAir: true, shield: 140, shieldAura: { radius: 4.5, rate: 18 },
               desc: 'A floating orb in a cage of rings. It pours light back into the shields around it.' },
  monolith:  { id: 'monolith',  name: 'Monolith',       tab: 'veh', cost: 1600, buildTime: 20,  hp: 900,  speed: 1.2, damage: 95,  range: 9,   reload: 3.2, vision: 9, radius: 18, model: 'mech', mstep: 3, spriteH: 56, nonBuildable: true, shield: 700,
               desc: 'A walking obelisk. When it opens, the light it fires can cut a building in half.' },
  // ---- the Vey brood: crystal grown through flesh (AI only) ----
  skitter:   { id: 'skitter',   name: 'Skitter',        tab: 'inf', cost: 110,  buildTime: 3,  hp: 95,   speed: 3.6, damage: 9,   range: 1.4, reload: 0.45, vision: 6, radius: 7,  model: 'soldier', mstep: 2, spriteH: 18, nonBuildable: true, crystalRegen: 3,
               desc: 'Six legs, a crystal spine, too many of them. They pour out of the pods.' },
  spitter:   { id: 'spitter',   name: 'Spitter',        tab: 'inf', cost: 240,  buildTime: 5,  hp: 150,  speed: 2.5, damage: 26,  range: 5.5, reload: 1.8, vision: 7, radius: 9,  model: 'soldier', mstep: 2, spriteH: 22, nonBuildable: true, weapon: 'shell', splash: 0.7, antiAir: true,
               desc: 'Swells its glowing throat and spits a gob of crystal acid.' },
  carapace:  { id: 'carapace',  name: 'Carapace',       tab: 'veh', cost: 600,  buildTime: 10,  hp: 720,  speed: 2.0, damage: 48,  range: 1.8, reload: 1.3, vision: 5, radius: 14, model: 'mech', mstep: 2, spriteH: 30, nonBuildable: true, crystalRegen: 8,
               desc: 'A walking shell of crystal plate over meat. It rams armour until something gives.' },
  moth:      { id: 'moth',      name: 'Lumen Moth',     tab: 'veh', cost: 520,  buildTime: 9,  hp: 230,  speed: 4.2, damage: 18,  range: 3.5, reload: 0.7, vision: 9, radius: 12, model: 'drone', mstep: 3, spriteH: 26, nonBuildable: true, air: true, antiAir: true,
               desc: 'Translucent wings veined with light. It drifts over walls and burns what is underneath.' },
  behemoth:  { id: 'behemoth',  name: 'Behemoth',       tab: 'veh', cost: 1700, buildTime: 22,  hp: 2100, speed: 1.3, damage: 110, range: 8.5, reload: 3.6, vision: 8, radius: 22, model: 'mech', mstep: 3, spriteH: 60, nonBuildable: true, weapon: 'shell', splash: 1.7, crystalRegen: 15,
               desc: 'A hill that walks. The crystal on its back fires like a mortar.' },
  // ---- the Hollow (campaign): the Meridian's descendants, grown through with the Vey's crystal ----
  shardkin:  { id: 'shardkin',  name: 'Shardkin',       tab: 'inf', cost: 0,    buildTime: 1,  hp: 150,  speed: 2.7, damage: 15,  range: 2.4, reload: 0.7, vision: 6, radius: 8,  model: 'soldier', mstep: 2, spriteH: 26, nonBuildable: true, crystalRegen: 6,
               desc: 'Hollow kin with crystal grown through them. Fast, close in, and they mend standing near crystal.' },
  burrower:  { id: 'burrower',  name: 'Burrower',       tab: 'inf', cost: 0,    buildTime: 1,  hp: 420,  speed: 2.0, damage: 42,  range: 1.8, reload: 1.4, vision: 5, radius: 11, model: 'soldier', mstep: 2, spriteH: 30, nonBuildable: true, crystalRegen: 10,
               desc: 'A hunched crystal-backed brute that comes up through the rock under machines and crushes them.' },
  choir:     { id: 'choir',     name: 'Choir',          tab: 'inf', cost: 0,    buildTime: 1,  hp: 110,  speed: 2.2, damage: 6,   range: 5,   reload: 1.2, vision: 8, radius: 8,  model: 'soldier', mstep: 2, spriteH: 28, nonBuildable: true, healAura: { radius: 4, rate: 9 },
               desc: 'Hollow singer. Its song closes wounds in every Hollow around it, louder near crystal.' },
};

export const BUILDINGS: Record<string, BuildingDef> = {
  nexus:     { id: 'nexus',     name: 'Nexus HQ',       tab: 'build', cost: 3000, buildTime: 20, hp: 1500, power: 50,   w: 3, h: 3, vision: 8, sprite: 'bld_hq', upgradable: true,
               desc: 'Colony command core. Other surviving buildings can keep the operation alive if it falls.' },
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

  skyport:   { id: 'skyport',   name: 'Skyport',        tab: 'build', cost: 1500, buildTime: 12, hp: 800,  power: -30,  w: 2, h: 2, vision: 6, prereq: 'fab',
               desc: 'Aerodrome pad. Unlocks the Skyhawk gunship and Ravager bomber.' },

  wall:      { id: 'wall',      name: 'Barrier Wall',   tab: 'def',   cost: 100,  buildTime: 1.5, hp: 500, power: 0,    w: 1, h: 1, vision: 1, isWall: true,
               desc: 'Cheap plasteel segment. Slows a push, absorbs fire.' },
  turret:    { id: 'turret',    name: 'Pulse Turret',   tab: 'def',   cost: 1000, buildTime: 8,  hp: 600,  power: -25,  w: 1, h: 1, vision: 7, prereq: 'barracks', turret: { damage: 30, range: 6.5, reload: 1.0, antiAir: true }, upgradable: true,
               desc: 'Automated base defence. Goes offline without power.' },
  railgun:   { id: 'railgun',   name: 'Rail Cannon',    tab: 'def',   cost: 1800, buildTime: 12, hp: 850,  power: -40,  w: 2, h: 2, vision: 9, prereq: 'spire', turret: { damage: 95, range: 8.5, reload: 2.4 }, sprite: 'bld_silo', upgradable: true,
               desc: 'Hypervelocity siege deterrent. Expensive, worth it.' },

  // ---- research-gated elite tier ----
  heavywall: { id: 'heavywall', name: 'Bulwark Wall',   tab: 'def',   cost: 300,  buildTime: 2.5, hp: 1500, power: 0,   w: 1, h: 1, vision: 1, isWall: true, prereqUp: 'arm1',
               desc: 'Triple-plated composite barrier. Requires Armor I.' },
  skyguard:  { id: 'skyguard',  name: 'Skyguard AA',    tab: 'def',   cost: 900,  buildTime: 8,  hp: 550,  power: -20,  w: 1, h: 1, vision: 9, prereq: 'barracks', turret: { damage: 35, range: 8, reload: 0.7, antiAir: true, airOnly: true },
               desc: 'Dedicated flak battery. Shreds aircraft, useless against ground.' },
  arctower:  { id: 'arctower',  name: 'Arc Tower',      tab: 'def',   cost: 2400, buildTime: 13, hp: 700,  power: -35,  w: 1, h: 1, vision: 8, prereq: 'lab', prereqUp: 'def1', turret: { damage: 55, range: 7, reload: 0.8 }, upgradable: true,
               desc: 'Rapid-discharge lightning emitter. Requires Defence Grid I.' },
  bastion:   { id: 'bastion',   name: 'Bastion Battery', tab: 'def',  cost: 3500, buildTime: 18, hp: 1400, power: -60,  w: 2, h: 2, vision: 10, prereq: 'railgun', prereqUp: 'def2', turret: { damage: 150, range: 9, reload: 3.0 }, sprite: 'bld_silo', upgradable: true,
               desc: 'Quad-cannon fortress emplacement. Requires Defence Grid II.' },
  // ---- campaign landmarks ----
  meridian:  { id: 'meridian',  name: 'The Meridian',   tab: 'build', cost: 0,    buildTime: 1,  hp: 5000, power: 0,    w: 4, h: 3, vision: 7,  nonBuildable: true,
               desc: 'The first colony ship, two hundred years in the ground. The Hollow were born in her.' },
  lanternshaft:{ id: 'lanternshaft', name: 'Lantern Shaft', tab: 'build', cost: 0, buildTime: 1,  hp: 3200, power: 0,    w: 3, h: 3, vision: 7,  nonBuildable: true,
               desc: 'Project Lantern: Helion\'s deep tap into the heart of the Vey. Something down there is still bleeding light.' },
  // ---- the Keepers: arrive in light, never built (AI only) ----
  beacon:    { id: 'beacon',    name: 'Keeper Beacon',  tab: 'build', cost: 0,    buildTime: 1,  hp: 2200, power: 0,    w: 3, h: 3, vision: 10, nonBuildable: true, shield: 1400,
               desc: 'A spire of pale gold that sings at the sky. Whatever the Keepers send comes down its light.' },
  sanctum:   { id: 'sanctum',   name: 'Sanctum',        tab: 'build', cost: 700,  buildTime: 14,  hp: 900,  power: 0,    w: 2, h: 2, vision: 6,  nonBuildable: true, shield: 600,
               desc: 'A ring of floating stones around a held breath of light. Arrivals come faster while it stands.' },
  shrine:    { id: 'shrine',    name: 'Shrine',         tab: 'build', cost: 450,  buildTime: 10,  hp: 700,  power: 0,    w: 2, h: 2, vision: 6,  nonBuildable: true, shield: 400,
               desc: 'It listens to the crystal and is fed by it. Gently.' },
  obelisk:   { id: 'obelisk',   name: 'Ward Obelisk',   tab: 'def',   cost: 500,  buildTime: 9,  hp: 650,  power: 0,    w: 1, h: 1, vision: 9,  nonBuildable: true, shield: 450,
               turret: { damage: 42, range: 7.5, reload: 1.4, antiAir: true },
               desc: 'A floating blade of gold that turns its light on intruders.' },
  // ---- the Vey brood: grown, not built (AI only) ----
  heart:     { id: 'heart',     name: 'Brood Heart',    tab: 'build', cost: 0,    buildTime: 1,  hp: 3200, power: 0,    w: 3, h: 3, vision: 9,  nonBuildable: true, bloom: 8,
               desc: 'A mound of flesh and crystal the size of a bunker, beating. Everything the brood is grows out from it.' },
  broodpod:  { id: 'broodpod',  name: 'Brood Pod',      tab: 'build', cost: 450,  buildTime: 14,  hp: 950,  power: 0,    w: 2, h: 2, vision: 5,  nonBuildable: true, bloom: 4,
               desc: 'A cluster of glowing egg-sacs. Things move inside.' },
  veinwell:  { id: 'veinwell',  name: 'Vein Well',      tab: 'build', cost: 350,  buildTime: 10,  hp: 750,  power: 0,    w: 2, h: 2, vision: 5,  nonBuildable: true, bloom: 3,
               desc: 'Roots sunk into the crystal, drinking flux straight from the ground.' },
  bloomnode: { id: 'bloomnode', name: 'Bloom Node',     tab: 'build', cost: 120,  buildTime: 4,  hp: 320,  power: 0,    w: 1, h: 1, vision: 6,  nonBuildable: true, bloom: 5,
               desc: 'A bulb on a stalk that pushes the living ground further out.' },
  spinespire:{ id: 'spinespire',name: 'Spine Spire',    tab: 'def',   cost: 400,  buildTime: 9,  hp: 700,  power: 0,    w: 1, h: 1, vision: 8,  nonBuildable: true, bloom: 2,
               turret: { damage: 32, range: 6.5, reload: 1.1, antiAir: true },
               desc: 'A crystal-tipped stalk that flings shards at anything walking on the bloom.' },
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

// ---- veterancy: units rank up by killing, earning XP = the victim's value ----
// rank 0 Rookie, 1 Veteran, 2 Elite. Index arrays by rank.
export const VET_XP = [0, 600, 2000];       // total XP needed to reach each rank
export const VET_DMG = [1, 1.25, 1.55];     // damage multiplier
export const VET_HEAL = [0, 4, 10];         // self-repair hp/sec (veteran+)
export const VET_RELOAD = [1, 1, 0.82];     // reload multiplier (elite reloads faster)
export const VET_NAME = ['', 'Veteran', 'Elite'];

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
  ranger: 'light', raider: 'light', warden: 'light', harvester: 'light', pioneer: 'light', gunship: 'light', bomber: 'heavy',
  hovertank: 'heavy', artillery: 'heavy', dominator: 'heavy', colossus: 'heavy', juggernaut: 'heavy',
  shardkin: 'infantry', burrower: 'light', choir: 'infantry',
  skitter: 'light', spitter: 'light', carapace: 'heavy', moth: 'light', behemoth: 'heavy',
  acolyte: 'infantry', lancer: 'light', luminar: 'light', monolith: 'heavy',
};
export const UNIT_DMGTYPE: Record<string, DmgType> = {
  trooper: 'gun', vanguard: 'gun', ranger: 'gun', raider: 'gun', warden: 'gun', juggernaut: 'gun', gunship: 'gun', bomber: 'cannon',
  pyro: 'flame', rocketeer: 'rocket', sniper: 'sniper',
  hovertank: 'cannon', artillery: 'cannon', dominator: 'cannon', colossus: 'cannon',
  shardkin: 'flame', burrower: 'cannon', choir: 'gun',   // shard claws tear soft targets; a burrower crushes
  skitter: 'flame', spitter: 'rocket', carapace: 'cannon', moth: 'gun', behemoth: 'cannon',
  acolyte: 'sniper', lancer: 'rocket', luminar: 'gun', monolith: 'cannon',
};
export const TURRET_DMGTYPE: Record<string, DmgType> = {
  turret: 'gun', arctower: 'gun', railgun: 'cannon', bastion: 'cannon', spinespire: 'gun', obelisk: 'cannon',
};
// multiplier[weapon dmgType][target armor class]
export const DMG_TABLE: Record<DmgType, Record<ArmorClass, number>> = {
  gun:    { infantry: 1.0, light: 0.9, heavy: 0.5, structure: 0.6 },  // coilguns — vs soft targets
  flame:  { infantry: 1.8, light: 1.0, heavy: 0.4, structure: 0.8 },  // pyro — shreds infantry, useless vs armor
  rocket: { infantry: 0.35, light: 1.4, heavy: 1.7, structure: 1.2 },  // anti-armor — wasted on infantry
  cannon: { infantry: 0.7, light: 1.2, heavy: 1.4, structure: 1.5 },  // shells — vs armor & buildings
  sniper: { infantry: 2.0, light: 0.7, heavy: 0.5, structure: 0.3 },  // precision — vs infantry only
};

export const PLAYER = 0;
// player is blue; AI opponents take the other Kenney unit palettes
export const TEAM_COLORS = ['#4db8ff', '#e58a3a', '#57c46a', '#a7abb8', '#bfeef2', '#b46cff', '#ffd27a'];   // 4 = the Hollow (campaign), 5 = the Vey brood, 6 = the Keepers
export const FACTION_NAMES = ['Helion Dynamics', 'Kessler Collective', 'Verdant Pact', 'Ashen Syndicate', 'The Hollow', 'The Vey Brood', 'The Keepers'];
export const BROOD = 5, KEEPERS = 6;   // the AI slots the aliens use

// ---- factions: who sits in each owner slot this match ----
// Slots are fixed numbers (0 is always the player); which faction holds each one
// is set per match, so the player can be any faction. TEAM_COLORS and
// FACTION_NAMES are rewritten in place to match.
export type FactionId = 'helion' | 'kessler' | 'verdant' | 'ashen' | 'hollow' | 'brood' | 'keepers';
export type FactionKind = 'human' | 'hollow' | 'brood' | 'keepers';
export const FACTIONS: Record<FactionId, { name: string; color: string; kind: FactionKind; blurb: string }> = {
  helion:  { name: 'Helion Dynamics',    color: '#4db8ff', kind: 'human',   blurb: 'Balanced. Harvesters work 20% faster.' },
  kessler: { name: 'Kessler Collective', color: '#e58a3a', kind: 'human',   blurb: 'Armour. Vehicles and defences 15% tougher, turrets hit harder.' },
  verdant: { name: 'Verdant Pact',       color: '#57c46a', kind: 'human',   blurb: 'Infantry. Troops 20% cheaper and faster to train; vents fall quicker.' },
  ashen:   { name: 'Ashen Syndicate',    color: '#a7abb8', kind: 'human',   blurb: 'Raids. Fast vehicles and aircraft 20% quicker and 10% cheaper.' },
  hollow:  { name: 'The Hollow',         color: '#bfeef2', kind: 'hollow',  blurb: '' },
  brood:   { name: 'The Vey Brood',      color: '#b46cff', kind: 'brood',   blurb: 'Grow on your bloom, hatch swarms, feed from Vein Wells. No harvesters.' },
  keepers: { name: 'The Keepers',        color: '#ffd27a', kind: 'keepers', blurb: 'Few, shielded, costly. Units arrive by light; Shrines feed you.' },
};
const DEFAULT_SLOTS: FactionId[] = ['helion', 'kessler', 'verdant', 'ashen', 'hollow', 'brood', 'keepers'];
export const SLOTS: FactionId[] = [...DEFAULT_SLOTS];
export function setSlots(slots: FactionId[]) {
  SLOTS.splice(0, SLOTS.length, ...slots);
  SLOTS.forEach((f, i) => { TEAM_COLORS[i] = FACTIONS[f].color; FACTION_NAMES[i] = FACTIONS[f].name; });
}
export const resetSlots = () => setSlots(DEFAULT_SLOTS);
export const kindOf = (o: number): FactionKind => FACTIONS[SLOTS[o] ?? 'helion']?.kind ?? 'human';
/** The Vey's own (the Hollow, the brood, the Keepers who made it) never fight each other; the player fights everyone. */
export const isVey = (o: number) => kindOf(o) !== 'human';
// campaign alliances (e.g. the Hollow beside you if you protected the Meridian)
const ALLIES = new Set<string>();
export function setAllied(a: number, b: number, on: boolean) { const k = a < b ? `${a},${b}` : `${b},${a}`; if (on) ALLIES.add(k); else ALLIES.delete(k); }
export const clearAllies = () => ALLIES.clear();
export const hostile = (a: number, b: number) => a !== b && !ALLIES.has(a < b ? `${a},${b}` : `${b},${a}`)
  && (a === PLAYER || b === PLAYER || !(isVey(a) && isVey(b)));

// what each kind of faction can make (humans: everything not marked nonBuildable)
const BROOD_TECH = new Set(['broodpod', 'veinwell', 'bloomnode', 'spinespire', 'skitter', 'spitter', 'carapace', 'moth', 'behemoth']);
const KEEPER_TECH = new Set(['sanctum', 'shrine', 'obelisk', 'acolyte', 'lancer', 'luminar', 'monolith']);
export function canMake(owner: number, id: string): boolean {
  const k = kindOf(owner);
  if (k === 'brood') return BROOD_TECH.has(id);
  if (k === 'keepers') return KEEPER_TECH.has(id);
  if (k === 'hollow') return false;
  const d = (BUILDINGS as Record<string, { nonBuildable?: boolean }>)[id] ?? (UNITS as Record<string, { nonBuildable?: boolean }>)[id];
  return !!UPGRADES[id] || (!!d && !d.nonBuildable);
}
// which structures turn out a faction's units (and where they appear)
export function producersOf(owner: number, tab: 'inf' | 'veh', air = false): string[] {
  const k = kindOf(owner);
  if (k === 'brood') return ['broodpod', 'heart'];
  if (k === 'keepers') return ['sanctum', 'beacon'];
  return tab === 'inf' ? ['barracks'] : air ? ['skyport', 'fab'] : ['fab'];
}

// human faction bonuses (also applied to the AI playing that faction)
export interface FactionBonus { harvest?: number; infCost?: number; infTime?: number; capture?: number; vehHp?: number; defHp?: number; turretDmg?: number; fast?: string[]; fastSpeed?: number; fastCost?: number }
export const BONUS: Partial<Record<FactionId, FactionBonus>> = {
  helion:  { harvest: 1.2 },
  kessler: { vehHp: 1.15, defHp: 1.15, turretDmg: 1.1 },
  verdant: { infCost: 0.8, infTime: 0.8, capture: 1.4 },
  ashen:   { fast: ['raider', 'ranger', 'gunship', 'bomber', 'warden'], fastSpeed: 1.2, fastCost: 0.9 },
};
export const bonusOf = (o: number): FactionBonus => BONUS[SLOTS[o]] ?? {};
