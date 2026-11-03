// Act I — Landfall. Each mission is data (map, tech, objectives) plus small
// script hooks the runner calls. Story: docs/campaign-plan.md.

import type { Ctx, Speaker } from './runner';
import type { GameEvent, Unit, Building } from '../game';
import { mission, damage, surface } from '../game';
import { nearestTile, inBounds, terrain, idx, occupied } from '../map';
import { sfx } from '../audio';
import { PLAYER, KEEPERS } from '../config';
import { seedKeepers, initKeepers, clearSpot } from '../keepers';
import { seedBrood, initBrood } from '../brood';
import { setAllied, hostile } from '../config';
import { ventsHeld, neutrals, buildingCenter, issueOrder, units, burrowUnit, players, resCell, RES_TREMOR, RES_STORM, addResonance, byId, resonance, ensureFaction, setSupernova, novaLeft } from '../game';

export interface Objective {
  id: string;
  text: string | ((c: Ctx) => string);
  check: (c: Ctx) => boolean;
  hidden?: boolean;     // stays off the tracker until a trigger shows it
  optional?: boolean;
}
export interface Trigger { id: string; when: (c: Ctx) => boolean; run: (c: Ctx) => void }
export interface MissionDef {
  id: string; act: 0 | 1 | 2 | 3; code: string; title: string; tagline: string;
  optional?: boolean;   // the boot camp: listed first, but nothing waits on it
  briefing: string[]; goals: string[];
  seed: number; enemies: number; crystalMul?: number; credits: number;
  size?: number;                           // map size override (tiles)
  resonance?: boolean;                     // the Vey reacts to harvesting
  startUpgrades?: string[];                // research the player starts with
  allowed: string[];
  aiOwners?: number[];                     // factions left to the skirmish AI (default: none, all scripted)
  setup(c: Ctx): void;
  intro(c: Ctx): void;
  update?(c: Ctx, dt: number): void;
  onEvent?(c: Ctx, ev: GameEvent): void;
  onChoice?(c: Ctx, key: string, option: string): void;
  objectives: Objective[];
  triggers: Trigger[];
  win(c: Ctx): boolean;
  lose?(c: Ctx): boolean;
  endWin: { title: string; text: string } | ((c: Ctx) => { title: string; text: string });
  endLose: { title: string; text: string };
  onInstall?(c: Ctx): void;               // runs at start and on resume (alliances from flags)
  endEliminated?: { title: string; text: string };   // base wiped out, if different from endLose
}

const KESSLER = 1, HEARTH = 2, ASHEN = 3, HOLLOW = 4;   // Reyes's Hearth Clans and Vessa's Ashen Clans
const BASE_TECH = ['solar', 'extractor', 'barracks', 'turret', 'wall', 'trooper', 'rocketeer', 'harvester'];

const hqOf = (c: Ctx) => c.buildingsOf(PLAYER, 'nexus')[0] ?? c.buildingsOf(PLAYER)[0];
const hqPos = (c: Ctx) => { const h = hqOf(c); return h ? buildingCenter(h) : { x: 0, y: 0 }; };
const towersHeld = (owner: number) => neutrals.filter(n => n.kind === 'tower' && n.owner === owner).length;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const nexusAtBase = (c: Ctx) => { const b = c.base(PLAYER); return c.place('nexus', PLAYER, b.tx, b.ty); };
// a lost harvester gets one warning per mission
function harvesterWarning(c: Ctx, ev: GameEvent) {
  if (ev.type === 'destroyed' && ev.e.kind === 'unit' && ev.e.owner === PLAYER && ev.e.def.harvester && !c.run.vars.harvWarned) {
    c.run.vars.harvWarned = 1;
    c.say('okoye', 'We lost a harvester. Another Extractor brings a replacement. The fleet can\'t wait.');
  }
}

// ---------------------------------------------------------------------------
// Boot camp (optional): the controls, one step at a time, on a small quiet map
const bootCamp: MissionDef = {
  id: 'boot', act: 0, code: 'B', title: 'Boot Camp', tagline: 'Learn the ground before you hold it', optional: true,
  briefing: [
    'Lantern, Okoye. Before Varga drops you anywhere that matters, you learn the ground. Small yard, one Kessler outpost on the hill, nobody in a hurry.',
    'I\'ll talk you through it a step at a time. Skip it if you\'ve done this before; Depot Six is open either way.',
  ],
  goals: ['Move a squad', 'Build power, an Extractor and a Barracks', 'Take a vent', 'Knock out the Kessler outpost'],
  seed: 4242, enemies: 1, size: 48, credits: 2500,
  allowed: BASE_TECH,
  setup(c) {
    nexusAtBase(c);
    const b = c.base(PLAYER), k = c.base(KESSLER);
    c.spawn(['trooper', 'trooper', 'trooper'], PLAYER, b.tx + 1, b.ty + 5, 'squad');
    // the marker: a little way out toward the middle
    c.run.vars.mx = Math.round(b.tx + (k.tx - b.tx) * 0.25); c.run.vars.my = Math.round(b.ty + (k.ty - b.ty) * 0.25);
    c.place('outpost', KESSLER, k.tx, k.ty);
    c.spawn(['trooper', 'trooper'], KESSLER, k.tx + 1, k.ty + 3, 'post');
  },
  intro(c) {
    c.say('okoye', 'First, your squad. Drag a box around them to select them, or tap one. Double-tap selects every unit of that type.');
    c.say('okoye', 'Now right-click the ground by the marker to move them there. On a touch screen, just tap where you want them.');
  },
  update(c, dt) {
    const v = c.run.vars;
    if (!c.done('move') && (v.pingT = (v.pingT ?? 0) - dt) <= 0) { v.pingT = 4; c.ping(v.mx, v.my, '#e8c66a'); }
  },
  objectives: [
    { id: 'move', text: 'Select your squad and move it to the marker', check: c => units.filter(u => u.owner === PLAYER && u.def.id === 'trooper' && Math.hypot(u.x / 32 - c.run.vars.mx, u.y / 32 - c.run.vars.my) < 3.5).length >= 2 },
    { id: 'solar', text: 'Build a Solar Array (Structures tab)', hidden: true, check: c => c.buildingsOf(PLAYER, 'solar').length > 0 },
    { id: 'extractor', text: 'Build an Extractor beside the crystal', hidden: true, check: c => c.buildingsOf(PLAYER, 'extractor').length > 0 },
    { id: 'flux', text: c => `Deliver flux: ${Math.min(500, Math.round(c.flux()))} / 500`, hidden: true, check: c => c.flux() >= 500 },
    { id: 'barracks', text: c => `Build a Barracks and train Troopers: ${Math.min(3, Math.max(0, units.filter(u => u.owner === PLAYER && u.def.id === 'trooper').length - (c.run.vars.t0 ?? 3)))} / 3`, hidden: true,
      check: c => c.buildingsOf(PLAYER, 'barracks').length > 0 && units.filter(u => u.owner === PLAYER && u.def.id === 'trooper').length - (c.run.vars.t0 ?? 3) >= 3 },
    { id: 'vent', text: 'Capture a flux vent', hidden: true, check: () => ventsHeld(PLAYER) >= 1 },
    { id: 'outpost', text: 'Destroy the Kessler outpost', hidden: true, check: c => c.buildingsOf(KESSLER).length === 0 },
  ],
  triggers: [
    { id: 'move', when: c => c.done('move'), run: c => {
      c.show('solar');
      c.say('okoye', 'Good. Everything here runs on power. Open the Structures tab at the bottom, pick the Solar Array, then click (or tap) a spot next to your HQ.');
    } },
    { id: 'solar', when: c => c.done('solar'), run: c => {
      c.show('extractor');
      c.say('okoye', 'Lights on. Now an Extractor, right next to the blue crystal. It comes with a harvester that mines on its own and brings the flux home.');
    } },
    { id: 'extractor', when: c => c.done('extractor'), run: c => {
      c.show('flux');
      c.say('okoye', 'Flux pays for everything. Watch the counter top left climb as the harvester unloads.');
    } },
    { id: 'flux', when: c => c.done('flux'), run: c => {
      c.run.vars.t0 = units.filter(u => u.owner === PLAYER && u.def.id === 'trooper').length;
      c.show('barracks');
      c.say('okoye', 'Now soldiers. Build a Barracks, then queue three Troopers from the Infantry tab. You can queue several at once.');
    } },
    { id: 'barracks', when: c => c.done('barracks'), run: c => {
      c.show('vent');
      const n = c.vents().sort((p, q) => Math.hypot(p.tx - c.base(PLAYER).tx, p.ty - c.base(PLAYER).ty) - Math.hypot(q.tx - c.base(PLAYER).tx, q.ty - c.base(PLAYER).ty))[0];
      if (n) { c.ping(n.tx, n.ty, '#43f3ec'); c.reveal(n.tx, n.ty, 4); }
      c.say('okoye', 'See the vent I marked? Stand troops on it and keep enemies off until the ring fills. A vent pays flux every second you hold it.');
    } },
    { id: 'vent', when: c => c.done('vent'), run: c => {
      c.show('outpost');
      const k = c.base(KESSLER); c.ping(k.tx, k.ty, '#e58a3a'); c.reveal(k.tx, k.ty, 6);
      c.say('okoye', 'Last thing. Kessler\'s outpost on the hill. Select your troops and right-click it (or tap it) to attack. Press A then click to attack-move: they\'ll fight anything on the way.');
    } },
  ],
  win: c => c.done('outpost'),
  endWin: { title: 'Ready', text: 'Okoye: "That\'s the job, Lantern. Power, flux, soldiers, ground. Everything else is just more of it, under fire. Depot Six is waiting."' },
  endLose: { title: 'Back to the yard', text: 'Okoye: "Happens to everyone the first time. Again."' },
};

// ---------------------------------------------------------------------------
// I-1 · Cold Drop
const coldDrop: MissionDef = {
  id: 'act1-1', act: 1, code: 'I-1', title: 'Cold Drop', tagline: 'Restart flux production at Depot Six',
  briefing: [
    'Lantern, this is Varga. You land at Depot Six at first light. It burned three weeks ago, and nobody on the surface will tell me why.',
    'The fleet\'s drives are dry. Get the depot running and send flux up the tether. Kessler\'s people patrol the ridge; they used to be colony security. Assume they\'ll shoot.',
  ],
  goals: ['Power the depot and build an Extractor', 'Deliver 12,000 flux to the fleet', 'Deal with whatever Kessler has on the ridge'],
  seed: 11017, enemies: 1, credits: 4000,
  allowed: BASE_TECH,
  setup(c) {
    const hq = nexusAtBase(c);
    const b = c.base(PLAYER);
    c.spawn(['trooper', 'trooper', 'trooper'], PLAYER, b.tx + 1, b.ty + 5);
    if (hq) hq.hp = Math.round(hq.maxHp * 0.7);   // the depot still carries the fire's damage
    const k = c.base(KESSLER);
    c.place('barracks', KESSLER, k.tx, k.ty);
    c.place('solar', KESSLER, k.tx + 3, k.ty);
    c.place('solar', KESSLER, k.tx + 3, k.ty - 3);
    for (const [dx, dy] of [[-1, 3], [3, 3], [-2, -1], [5, 1]]) c.place('turret', KESSLER, k.tx + dx, k.ty + dy);
    c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer'], KESSLER, k.tx + 1, k.ty + 4, 'camp');
  },
  intro(c) {
    c.say('varga', 'Lantern, Varga. You\'re down. Forty thousand sleepers are waiting on what you dig out of that ground. No pressure.');
    c.say('okoye', 'Okoye here, on the ground with you. Power first: a Solar Array next to the HQ. Nothing else in this yard wakes up without it.');
  },
  objectives: [
    { id: 'solar', text: 'Build a Solar Array', check: c => c.buildingsOf(PLAYER, 'solar').length > 0 },
    { id: 'extractor', text: 'Build an Extractor near the crystal', check: c => c.buildingsOf(PLAYER, 'extractor').length > 0 },
    { id: 'flux', text: c => `Deliver flux to the fleet: ${Math.min(12000, Math.round(c.flux())).toLocaleString()} / 12,000`, check: c => c.flux() >= 12000 },
    { id: 'camp', text: 'Destroy the Kessler patrol camp', hidden: true, check: c => c.buildingsOf(KESSLER).length === 0 },
  ],
  triggers: [
    { id: 'solar', when: c => c.done('solar'), run: c => c.say('okoye', 'Lights on. Now an Extractor on the crystal field. It brings its own harvester: keep it fed and keep it alive.') },
    { id: 'extractor', when: c => c.done('extractor'), run: c => {
      c.say('okoye', 'Every load goes up the tether to the fleet. Varga wants twelve thousand.');
      c.say('okoye', 'Put up a Barracks while it works. Kessler\'s patrols come down that ridge.');
    } },
    { id: 'patrol1', when: c => c.t >= 120, run: c => {
      const k = c.base(KESSLER), p = hqPos(c);
      c.attackMove(c.spawn(['trooper', 'trooper', 'trooper'], KESSLER, k.tx + 2, k.ty + 5, 'p1'), p.x, p.y);
      c.say('okoye', 'Movement on the ridge, in Kessler colours. Three weeks ago those people were guarding this depot. Now they\'re shooting at it.');
    } },
    { id: 'patrol1done', when: c => c.run.fired.includes('patrol1') && c.alive('p1').length === 0, run: c => c.say('okoye', 'Patrol\'s down. Nobody\'s calling them back, which means more are coming.') },
    { id: 'patrol2', when: c => c.t >= 270, run: c => {
      const k = c.base(KESSLER), p = hqPos(c);
      c.attackMove(c.spawn(['trooper', 'trooper', 'trooper', 'rocketeer'], KESSLER, k.tx + 2, k.ty + 5, 'p2'), p.x, p.y);
      c.say('okoye', 'Second patrol, and it\'s bigger. They know exactly where we are, so someone up on that ridge is spotting for them.');
    } },
    { id: 'patrol3', when: c => c.t >= 430, run: c => {
      const k = c.base(KESSLER), p = hqPos(c);
      c.attackMove(c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer'], KESSLER, k.tx + 2, k.ty + 5, 'p3'), p.x, p.y);
      c.say('okoye', 'Here they come again, a full squad this time. Somebody up there really doesn\'t want this depot running.');
    } },
    { id: 'flux', when: c => c.done('flux'), run: c => {
      c.run.shown.push('camp');
      const k = c.base(KESSLER);
      c.reveal(k.tx + 1, k.ty + 1, 7); c.ping(k.tx + 1, k.ty + 1, '#e58a3a');
      c.say('varga', 'Fleet confirms receipt. And Lantern: that camp on the ridge has been reporting your position since you landed. Shut it down.');
      c.say('okoye', 'Marked it. Take Rocket Troopers for the turrets.');
    } },
  ],
  onEvent: harvesterWarning,
  win: c => c.done('flux') && c.buildingsOf(KESSLER).length === 0,
  endWin: { title: 'Depot Six holds', text: 'Okoye: "Lantern, Harvester Two stopped reporting an hour ago. No wreck, no tracks. Just a hole in the ground, still warm."' },
  endLose: { title: 'Depot Six has fallen', text: 'The tether goes quiet. In orbit, forty thousand sleepers wait for flux that never comes.' },
};

// ---------------------------------------------------------------------------
// I-2 · Flux Lines
const fluxLines: MissionDef = {
  id: 'act1-2', act: 1, code: 'I-2', title: 'Flux Lines', tagline: 'Take the vents from the Hearth Clans',
  briefing: [
    'Lantern, Varga. Your crystal yields are good, but not good enough. Dr. Lind says the real flux comes up through the vents, straight from the deep crust.',
    'The Hearth Clans sit on two of them: miners\' grandchildren, left in the deep crust when the company moved on. Old rifles, and they know every rock. Take the vents and a watchtower, and hold them long enough for Lind\'s survey.',
    'Okoye\'s notes on the clans: they need no power and their camps can pack up and move. They hide snares in the dirt round anything they hold, and you won\'t see one until it springs. Walk a cheap squad in first.',
  ],
  goals: ['Capture two flux vents', 'Capture a watchtower', 'Hold them for 90 seconds'],
  seed: 22073, enemies: 2, credits: 3000,
  allowed: [...BASE_TECH, 'sensor', 'pyro', 'vanguard'],
  setup(c) {
    nexusAtBase(c);
    const b = c.base(PLAYER);
    c.place('solar', PLAYER, b.tx + 4, b.ty);
    c.place('extractor', PLAYER, b.tx, b.ty - 4);
    c.place('barracks', PLAYER, b.tx + 4, b.ty + 3);
    c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer'], PLAYER, b.tx + 1, b.ty + 5);
    const v = c.base(HEARTH);
    c.place('longhouse', HEARTH, v.tx, v.ty);
    c.place('lookout', HEARTH, v.tx + 3, v.ty);
    c.place('gunnest', HEARTH, v.tx + 1, v.ty + 3);
    // Hearth pickets stand on the two vents nearest their camp (they capture them in seconds), with snares round them
    const vents = c.vents().sort((a, z) => Math.hypot(a.tx - v.tx, a.ty - v.ty) - Math.hypot(z.tx - v.tx, z.ty - v.ty));
    for (const vent of vents.slice(0, 2)) {
      c.spawn(['firebrand', 'firebrand', 'scav', 'scav', 'scav', 'harpooner'], HEARTH, vent.tx, vent.ty, 'pickets');
      c.place('gunnest', HEARTH, vent.tx + 2, vent.ty + 2);
      for (const [dx, dy] of [[-3, 1], [1, -3]]) c.place('snare', HEARTH, vent.tx + dx, vent.ty + dy);
    }
  },
  intro(c) {
    c.say('lind', 'Lind here, on the survey channel. Once you hold both vents and a watchtower, I need ninety steady seconds of readings. I\'ll be listening.');
    c.say('okoye', 'The Hearth Clans have pickets on two of them. Stand your troops on a vent and keep enemies off it to take it. And watch the ground: the clans set snares.');
  },
  update(c, dt) {
    if (!c.run.shown.includes('hold')) return;
    c.run.vars.hold = ventsHeld(PLAYER) >= 2 && towersHeld(PLAYER) >= 1 ? (c.run.vars.hold ?? 0) + dt : 0;
    // the Hearth keeps throwing squads at the vents while the survey runs
    c.run.vars.raid = (c.run.vars.raid ?? 35) - dt;
    if (c.run.vars.raid <= 0) {
      c.run.vars.raid = 45;
      const v = c.base(HEARTH);
      const held = neutrals.filter(n => n.kind === 'vent' && n.owner === PLAYER);
      const n = held[Math.floor(Math.random() * held.length)];
      if (n) c.attackMove(c.spawn(['firebrand', 'firebrand', 'scav', 'scav', 'scav', 'harpooner'], HEARTH, v.tx + 1, v.ty + 4), (n.tx + 0.5) * 32, (n.ty + 0.5) * 32);
    }
  },
  objectives: [
    { id: 'vents', text: () => `Capture flux vents: ${Math.min(2, ventsHeld(PLAYER))} / 2`, check: () => ventsHeld(PLAYER) >= 2 },
    { id: 'tower', text: 'Capture a watchtower', check: () => towersHeld(PLAYER) >= 1 },
    { id: 'hold', text: c => `Hold 2 vents and a tower: ${Math.floor(c.run.vars.hold ?? 0)} / 90 s`, hidden: true, check: c => (c.run.vars.hold ?? 0) >= 90 },
  ],
  triggers: [
    { id: 'firstvent', when: () => ventsHeld(PLAYER) >= 1, run: c => {
      c.run.vars.firstVentAt = c.t;
      c.say('lind', 'Feel that hum through your boots? That\'s the vent breathing. Odd word for it. Never mind.');
    } },
    // the survey can't start until the ground has shown its hand
    { id: 'showhold', when: c => c.done('vents') && c.done('tower') && c.run.fired.includes('ambushdone'), run: c => {
      c.run.shown.push('hold');
      c.say('okoye', 'Now hold them. Ninety seconds and Lind\'s survey locks the readings. Lose a vent and the clock starts again.');
    } },
    { id: 'verdant1', when: c => c.t >= 150 || (c.run.vars.firstVentAt !== undefined && c.t >= c.run.vars.firstVentAt + 40), run: c => {
      const v = c.base(HEARTH), target = c.vents().find(n => neutrals.some(x => x.tx === n.tx && x.ty === n.ty && x.owner === PLAYER)) ?? c.vents()[0];
      c.attackMove(c.spawn(['firebrand', 'firebrand', 'scav', 'scav', 'scav'], HEARTH, v.tx + 1, v.ty + 4, 'v1'), (target.tx + 0.5) * 32, (target.ty + 0.5) * 32);
      c.say('okoye', 'Clan squad moving on the vents. Firebombs, so keep your infantry spread out.');
    } },
    // the Hollow surface once the vents start being taken (or after a while regardless)
    { id: 'ambush', when: c => (c.t >= 210 || (c.run.vars.firstVentAt !== undefined && c.t >= c.run.vars.firstVentAt + 25)) && units.some(u => u.owner === PLAYER && u.def.harvester), run: c => {
      const h = units.find(u => u.owner === PLAYER && u.def.harvester)!;
      // far enough off that there's a moment to react before they reach it
      const tx = Math.floor(h.x / 32) + 6, ty = Math.floor(h.y / 32) + 4;
      const us = c.spawn(['pyro', 'pyro', 'trooper', 'trooper', 'pyro', 'vanguard'], HOLLOW, tx, ty, 'hollow');
      for (const u of us) issueOrder(u, { type: 'attack', targetId: h.id });
      c.run.vars.ambushAt = c.t;
      c.ping(tx, ty, '#bfeef2'); c.reveal(tx, ty, 4);
      c.say('seren', '—root-takers. You cut the singing. Give it BACK—');
      c.say('okoye', 'Contacts out of the ground! Right under the harvester. Move!');
    } },
    // survivors go back underground after a minute (or once their harvester is gone)
    { id: 'burrow', when: c => c.run.fired.includes('ambush') && c.alive('hollow').length > 0
        && (c.t >= (c.run.vars.ambushAt ?? 0) + 60 || !units.some(u => u.owner === PLAYER && u.def.harvester)) && c.t >= (c.run.vars.ambushAt ?? 0) + 15, run: c => {
      for (const u of c.alive('hollow')) burrowUnit(u);
      c.say('okoye', 'They\'re going back down. Into the rock, like it opened for them.');
    } },
    { id: 'ambushdone', when: c => c.run.fired.includes('ambush') && c.alive('hollow').length === 0, run: c => {
      c.say('okoye', 'Lantern... I\'ve looked at the bodies. They\'re human. Skin like quartz, but human.');
      c.say('lind', 'That\'s not possible. Nobody has lived out here since— That isn\'t possible.');
    } },
    { id: 'verdant2', when: c => c.t >= 330, run: c => {
      const v = c.base(HEARTH), p = c.vents()[1] ?? c.vents()[0];
      c.attackMove(c.spawn(['firebrand', 'scav', 'scav', 'harpooner', 'scav', 'scav'], HEARTH, v.tx + 1, v.ty + 4, 'v2'), (p.tx + 0.5) * 32, (p.ty + 0.5) * 32);
    } },
  ],
  onEvent: harvesterWarning,
  win: c => c.done('hold'),
  endWin: { title: 'The vents are ours', text: 'Lind: "Readings locked. Lantern, the flux under these vents isn\'t just pressure. It\'s pulsing, like a heartbeat. I\'ll... put it in the report."' },
  endLose: { title: 'Driven off the vents', text: 'The survey teams never get their readings. Whatever is under the vents keeps its secret a little longer.' },
};

// ---------------------------------------------------------------------------
// I-3 · Iron Weather
const WAVES = [
  { at: 150, units: ['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer'],
    line: 'Helion commander. You\'re standing on a crime scene, and you don\'t even know it.' },
  { at: 330, units: ['hovertank', 'vanguard', 'vanguard', 'vanguard', 'trooper', 'trooper'],
    line: 'Ask yourself why your company burned its own depot before you landed.' },
  { at: 510, units: ['hovertank', 'hovertank', 'ranger', 'ranger', 'rocketeer', 'rocketeer', 'rocketeer', 'trooper', 'trooper', 'trooper'],
    line: 'Last warning, Lantern. Walk away from the vents.' },
];
const ironWeather: MissionDef = {
  id: 'act1-3', act: 1, code: 'I-4', title: 'Iron Weather', tagline: 'Break the Kessler assault',
  briefing: [
    'Lantern, Varga. Kessler has stopped probing. Orbit shows an armoured column forming at his forward base, and it\'s pointed at you.',
    'Your Fabricator clearance just came through. Build armour, dig in behind the turrets and let his column break on them. Then take the fight to him.',
  ],
  goals: ['Survive three Kessler assault waves', 'Destroy the Kessler forward base'],
  seed: 33091, enemies: 1, credits: 6000,
  allowed: [...BASE_TECH, 'sensor', 'pyro', 'vanguard', 'fab', 'repairyard', 'lab', 'skyguard', 'heavywall',
    'ranger', 'hovertank', 'raider', 'warden', 'wpn1', 'arm1', 'def1'],
  setup(c) {
    nexusAtBase(c);
    const b = c.base(PLAYER);
    c.place('solar', PLAYER, b.tx + 4, b.ty);
    c.place('solar', PLAYER, b.tx + 4, b.ty - 3);
    c.place('extractor', PLAYER, b.tx, b.ty - 4);
    c.place('barracks', PLAYER, b.tx + 4, b.ty + 3);
    c.place('turret', PLAYER, b.tx + 6, b.ty - 1);
    c.place('turret', PLAYER, b.tx + 2, b.ty - 6);
    c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer'], PLAYER, b.tx + 1, b.ty + 5);
    const k = c.base(KESSLER);
    c.place('outpost', KESSLER, k.tx, k.ty);
    c.place('barracks', KESSLER, k.tx + 3, k.ty);
    c.place('fab', KESSLER, k.tx - 1, k.ty + 3);
    c.place('solar', KESSLER, k.tx + 3, k.ty + 3);
    c.place('solar', KESSLER, k.tx + 5, k.ty + 1);
    for (const [dx, dy] of [[-2, -1], [2, 6], [6, 4]]) c.place('turret', KESSLER, k.tx + dx, k.ty + dy);
    c.spawn(['hovertank', 'hovertank', 'vanguard', 'vanguard', 'vanguard'], KESSLER, k.tx + 2, k.ty + 6, 'guard');
  },
  intro(c) {
    c.say('varga', 'Lantern. Kessler has stopped probing. That column is coming for Depot Six.');
    c.say('okoye', 'Fabricator\'s cleared. Get armour out, put Rocket Troopers behind the turrets, and let them break on our guns first.');
    c.say('okoye', 'And keep the harvester behind the guns. Kessler knows what feeds the fleet.');
  },
  update(c) {
    const next = WAVES.find((w, i) => !c.run.fired.includes(`wave${i}`));
    c.run.vars.next = next ? next.at - c.t : 0;
  },
  objectives: [
    { id: 'survive', text: c => {
      const cleared = c.run.vars.cleared ?? 0;
      const next = c.run.vars.next ?? 0;
      return cleared >= 3 ? 'Survive the Kessler assault' : `Survive the Kessler assault: wave ${cleared} / 3 broken${next > 0 ? ` · next in ${fmt(next)}` : ''}`;
    }, check: c => (c.run.vars.cleared ?? 0) >= 3 },
    { id: 'base', text: 'Destroy the Kessler forward base', hidden: true, check: c => c.buildingsOf(KESSLER).length === 0 },
  ],
  triggers: [
    ...WAVES.map((w, i): Trigger => ({ id: `wave${i}`, when: c => c.t >= w.at, run: c => {
      const k = c.base(KESSLER), p = hqPos(c);
      c.attackMove(c.spawn(w.units, KESSLER, k.tx + 2, k.ty + 7, `w${i}`), p.x, p.y);
      c.say('kessler', w.line);
      if (i === 0) c.say('okoye', 'That\'s Kessler himself, on an open channel so the whole colony hears it. Don\'t answer him. Watch the ridge.');
    } })),
    ...WAVES.map((_, i): Trigger => ({ id: `cleared${i}`, when: c => c.run.fired.includes(`wave${i}`) && c.alive(`w${i}`).length === 0, run: c => {
      c.run.vars.cleared = (c.run.vars.cleared ?? 0) + 1;
      if (i === 1) c.say('okoye', 'Second wave\'s scrap. Lantern, about what he said... I served under Kessler for twelve years. He doesn\'t lie for fun.');
    } })),
    { id: 'push', when: c => (c.run.vars.cleared ?? 0) >= 3, run: c => {
      c.run.shown.push('base');
      const k = c.base(KESSLER);
      c.reveal(k.tx + 2, k.ty + 2, 9); c.ping(k.tx + 2, k.ty + 2, '#e58a3a');
      c.say('okoye', 'Their column is broken. The forward base is wide open. Finish it.');
    } },
  ],
  onEvent: harvesterWarning,
  win: c => c.buildingsOf(KESSLER).length === 0,
  endWin: { title: 'To be continued', text: 'Open channel, every frequency: "This is Marshal Dieter Kessler. Helion will tell you the sun is dying by accident. Ask your company what Project Lantern was. Ask them who signed it." · Act I complete.' },
  endLose: { title: 'Depot Six is overrun', text: 'Kessler\'s column rolls through the yard. On an open channel, a calm voice asks the colony a question nobody at Helion will answer.' },
};


// ===========================================================================
// Act II — The Corridor

const ACT2_TECH = [...BASE_TECH, 'sensor', 'pyro', 'vanguard', 'fab', 'repairyard', 'lab', 'skyguard', 'heavywall',
  'ranger', 'hovertank', 'raider', 'warden', 'wpn1', 'arm1', 'def1'];
const harvesters = () => units.filter(u => u.owner === PLAYER && u.def.harvester);
const nearestHarvester = (x: number, y: number) =>
  harvesters().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
// a mid-sized player base: every Act II mission starts from one
function act2Base(c: Ctx, extra: string[] = []) {
  nexusAtBase(c);
  const b = c.base(PLAYER);
  const spots: [string, number, number][] = [['solar', 4, 0], ['solar', 4, -3], ['extractor', 0, -4], ['barracks', 4, 3], ['turret', 6, -1], ['turret', 2, -6]];
  for (const [id, dx, dy] of spots) c.place(id, PLAYER, b.tx + dx, b.ty + dy);
  for (const [k, id] of extra.entries()) c.place(id, PLAYER, b.tx - 4, b.ty + k * 4 - 2);
}

// ---------------------------------------------------------------------------
// II-4 · Sparks
const sparks: MissionDef = {
  id: 'act2-4', act: 2, code: 'II-5', title: 'Sparks', tagline: 'Keep the harvesters alive under Ashen raids',
  briefing: [
    'Lantern, Varga. A supply convoy lands at Depot Six in eight minutes, and it needs flux on the pad when it does.',
    'The Ashen Clans have started hitting harvesters across the valley: technicals in fast, cutters out, gone before the guns turn. Every harvester they wreck pays them. Keep yours running. Get a Fabricator up so you have something that can catch them.',
  ],
  goals: ['Build a Fabricator', 'Keep harvesting until the convoy lands (8:00)', 'Lose no more than three harvesters'],
  seed: 44107, enemies: 3, size: 64, credits: 4500,
  allowed: ACT2_TECH,
  setup(c) {
    act2Base(c);
    const b = c.base(PLAYER);
    c.place('extractor', PLAYER, b.tx - 4, b.ty - 3);   // two fields, two harvesters to protect
    c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer'], PLAYER, b.tx + 1, b.ty + 5);
    const a = c.base(ASHEN);
    c.place('camp', ASHEN, a.tx, a.ty);
    c.place('lookout', ASHEN, a.tx + 3, a.ty);
    for (const [dx, dy] of [[-2, 3], [4, 3], [1, -3]]) c.place('gunnest', ASHEN, a.tx + dx, a.ty + dy);
  },
  intro(c) {
    c.say('varga', 'Lantern. Eight minutes to the convoy. Keep the flux moving.');
    c.say('okoye', 'Ashen technicals hit fast and run. Turrets by the crystal, and a Fabricator so we can chase.');
  },
  update(c, dt) {
    const v = c.run.vars;
    v.raid = (v.raid ?? 55) - dt;
    if (v.raid > 0 || c.t >= 480) return;
    const truce = (v.truceUntil ?? 0) > c.t;
    v.raid = c.t > 240 ? 32 : 42;
    if (truce) return;
    // raids grow through the mission and come from two edges, each pack after a different harvester
    const a = c.base(ASHEN), b = c.base(PLAYER);
    const size = 4 + Math.floor(c.t / 100) + (v.refused ? 1 : 0);
    const edges = [{ x: a.tx + 1, y: a.ty + 4 }, { x: b.tx + (b.tx < 32 ? 22 : -22), y: b.ty }];
    const hs = harvesters();
    edges.forEach((e, k) => {
      if (k === 1 && c.t < 120) return;                       // the flank opens after two minutes
      const comp = Array.from({ length: Math.ceil(size / (k ? 2 : 1)) }, () => 'technical');
      const us = c.spawn(comp, ASHEN, e.x, e.y, `raid${Math.floor(c.t)}_${k}`);
      const tgt = hs[k % Math.max(1, hs.length)] ?? nearestHarvester(e.x * 32, e.y * 32);
      for (const u of us) {
        if (tgt) issueOrder(u, { type: 'attack', targetId: tgt.id });
        else { const ex = c.buildingsOf(PLAYER, 'extractor')[0]; if (ex) { const p = buildingCenter(ex); issueOrder(u, { type: 'attackMove', x: p.x, y: p.y }); } }
      }
    });
    if (!v.firstRaid) { v.firstRaid = 1; c.say('okoye', 'Technicals on the flats, heading straight for a harvester. They know exactly what they want.'); }
  },
  objectives: [
    { id: 'fab', text: 'Build a Fabricator', check: c => c.buildingsOf(PLAYER, 'fab').length > 0 },
    { id: 'convoy', text: c => c.t >= 480 ? 'Keep harvesting until the convoy lands' : `Keep harvesting until the convoy lands: ${fmt(480 - c.t)}`, check: c => c.t >= 480 },
    { id: 'losses', text: c => `Harvesters lost: ${c.run.vars.lost ?? 0} / 4 (four and the convoy turns back)`, check: () => false },
  ],
  triggers: [
    { id: 'fab', when: c => c.done('fab'), run: c => c.say('okoye', 'Fabricator\'s up. Rangers and Raiders can run their technicals down. Watch for harpoons: they pin vehicles.') },
    { id: 'deal', when: c => c.t >= 180, run: c => {
      c.ask('vessa', 'Commander. That\'s a lot of machinery you\'re losing. Two thousand flux and my crews go quiet for two minutes. No questions about where my flux comes from.', {
        key: 'deal', fallback: 'refuse', options: [{ id: 'pay', label: 'Pay 2,000' }, { id: 'refuse', label: 'Refuse' }],
      });
    } },
    { id: 'air', when: c => c.t >= 300, run: c => {
      // a mortar cart shells the base from the ridge while technicals run escort
      const a = c.base(ASHEN), p = hqPos(c);
      c.attackMove(c.spawn(['mortar', 'technical', 'technical'], ASHEN, a.tx + 1, a.ty + 4, 'air'), p.x, p.y);
      c.say('okoye', 'Mortar cart coming over the ridge. It outranges the turrets, so get something fast onto it.');
    } },
    { id: 'late', when: c => c.t >= 420, run: c => c.say('varga', 'Convoy is on approach. One more minute, Lantern.') },
  ],
  onChoice(c, key, opt) {
    if (key !== 'deal') return;
    const p = players[PLAYER];
    if (opt === 'pay' && p.credits >= 2000) {
      p.credits -= 2000;
      c.run.vars.truceUntil = c.t + 120; c.run.vars.paid = 1;
      c.say('vessa', 'Pleasure doing business. Two minutes. Count them.');
      c.say('okoye', 'She paid for that quiet with something, Lantern. Ashen flux is too pure for a mine. I don\'t want to know where it comes from.');
    } else {
      c.run.vars.refused = 1;
      c.say('vessa', opt === 'pay' ? 'Can\'t afford me? Then you can\'t afford the quiet either.' : 'Your funeral, sweetheart. My crews will make it a nice one.');
    }
  },
  onEvent(c, ev) {
    if (ev.type === 'destroyed' && ev.e.kind === 'unit' && ev.e.owner === PLAYER && ev.e.def.harvester) {
      const n = c.run.vars.lost = (c.run.vars.lost ?? 0) + 1;
      if (n === 1) c.say('okoye', 'Harvester down. Another Extractor brings a replacement, but they\'ll keep coming.');
      if (n === 2) c.say('varga', 'Lantern, that\'s two. Two more and I turn the convoy around.');
    }
  },
  win: c => c.t >= 480 && c.done('fab') && (c.run.vars.lost ?? 0) < 4,
  lose: c => (c.run.vars.lost ?? 0) >= 4,
  endWin: { title: 'The convoy lands', text: 'Vessa Kol, on an open channel: "You held, Commander. Next time, ask me where the purest flux on Cinder comes from. Or don\'t. Most people don\'t."' },
  endLose: { title: 'The convoy turns back', text: 'Varga: "Four harvesters, Lantern. I can\'t land a convoy into that." Somewhere in the valley, the Ashen cutters are already at work.' },
};

// ---------------------------------------------------------------------------
// II-5 · The Green Tide
const greenTide: MissionDef = {
  id: 'act2-5', act: 2, code: 'II-6', title: 'The Green Tide', tagline: 'Break the Hearth\'s hold on the central vents',
  briefing: [
    'Lantern, Varga. The Hearth Clans hold three of the four central vents, and Lind needs them for the corridor survey. Take them.',
    'Their Speaker, Ama Reyes, keeps broadcasting that the vents are "wounds". Ignore it. The clans come in swarms and seed the ground with snares: bring splash, and the Thumper is cleared for you.',
  ],
  goals: ['Take three of the central vents', 'Hold them for 90 seconds', 'Optional: leave Reyes\'s labs standing'],
  seed: 55223, enemies: 2, size: 70, credits: 6000, resonance: true,
  allowed: [...ACT2_TECH, 'spire', 'artillery', 'railgun', 'arctower', 'wpn2', 'arm2'],
  setup(c) {
    act2Base(c, ['fab']);
    const b = c.base(PLAYER);
    c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer', 'hovertank', 'hovertank'], PLAYER, b.tx + 1, b.ty + 5);
    const v = c.base(HEARTH);
    c.place('longhouse', HEARTH, v.tx, v.ty); c.place('longhouse', HEARTH, v.tx + 3, v.ty);
    c.place('lookout', HEARTH, v.tx, v.ty + 3); c.place('gunnest', HEARTH, v.tx + 3, v.ty + 3);
    // three of the four vents: pickets, gun nests and snares
    const vents = c.vents().sort((p, q) => Math.hypot(p.tx - b.tx, p.ty - b.ty) - Math.hypot(q.tx - b.tx, q.ty - b.ty));
    for (const vent of vents.slice(1)) {
      c.spawn(['firebrand', 'firebrand', 'firebrand', 'scav', 'scav', 'scav', 'scav', 'harpooner', 'harpooner', 'longshot'], HEARTH, vent.tx, vent.ty, 'pickets');
      c.place('gunnest', HEARTH, vent.tx + 2, vent.ty + 2);
      c.place('gunnest', HEARTH, vent.tx - 2, vent.ty - 1);
      for (const [dx, dy] of [[-4, 2], [3, -3], [0, 4]]) c.place('snare', HEARTH, vent.tx + dx, vent.ty + dy);
    }
    // Reyes's labs, in the old terraforming station between the vents
    const mx = Math.round(vents.slice(1).reduce((a, p) => a + p.tx, 0) / 3), my = Math.round(vents.slice(1).reduce((a, p) => a + p.ty, 0) / 3);
    c.place('lab', HEARTH, mx, my); c.place('lab', HEARTH, mx + 3, my + 1); c.place('lookout', HEARTH, mx + 1, my + 3);
    c.run.vars.labX = mx; c.run.vars.labY = my;
  },
  intro(c) {
    c.say('reyes', 'Reyes to the Helion commander. My people are on the vents and they will not move. I am sorry it has come to this.');
    c.say('okoye', 'Clan swarms, firebombs and harpoons. Thumpers break them up. Keep the tanks in front, and sweep ahead for snares.');
  },
  update(c, dt) {
    const v = c.run.vars;
    if (c.run.shown.includes('hold')) v.hold = ventsHeld(PLAYER) >= 3 ? (v.hold ?? 0) + dt : 0;
    v.tide = (v.tide ?? 45) - dt;
    if (v.tide > 0) return;
    v.tide = 40;
    const vb = c.base(HEARTH);
    const held = neutrals.filter(n => n.kind === 'vent' && n.owner === PLAYER);
    const n = held[Math.floor(Math.random() * held.length)] ?? neutrals.find(x => x.kind === 'vent');
    if (!n) return;
    const tide = ['firebrand', 'firebrand', 'firebrand', 'firebrand', 'scav', 'scav', 'scav', 'scav', 'harpooner', 'harpooner', ...(c.t > 240 ? ['firebrand', 'harpooner', 'longshot', 'longshot', 'scav'] : [])];
    c.attackMove(c.spawn(tide, HEARTH, vb.tx + 1, vb.ty + 5), (n.tx + 0.5) * 32, (n.ty + 0.5) * 32);
    if (!v.firstTide) { v.firstTide = 1; c.say('okoye', 'Here\'s the tide. Spread out and let the Thumpers work.'); }
  },
  objectives: [
    { id: 'vents', text: () => `Take the central vents: ${Math.min(3, ventsHeld(PLAYER))} / 3`, check: () => ventsHeld(PLAYER) >= 3 },
    { id: 'hold', text: c => `Hold three vents: ${Math.floor(c.run.vars.hold ?? 0)} / 90 s`, hidden: true, check: c => (c.run.vars.hold ?? 0) >= 90 },
    { id: 'labs', text: 'Leave Reyes\'s labs standing', optional: true, hidden: true,
      check: c => c.done('hold') && c.buildingsOf(HEARTH, 'lab').length > 0 },
  ],
  triggers: [
    { id: 'scream', when: () => neutrals.some(n => n.kind === 'vent' && n.owner === PLAYER), run: c => {
      // taking a vent makes the whole field cry out
      const n = neutrals.find(x => x.kind === 'vent' && x.owner === PLAYER)!;
      addResonance(n.tx, n.ty, 0.3);
      c.say('lind', 'Did... did you hear that? Every sensor on the field just spiked at once.');
      c.say('reyes', 'That was it screaming, Commander. Every vent you take, it screams.');
    } },
    { id: 'invite', when: () => ventsHeld(PLAYER) >= 2, run: c => {
      c.show('labs');
      c.ping(c.run.vars.labX, c.run.vars.labY, '#57c46a');
      c.say('reyes', 'Come to our labs, between the vents. See what we found. Then decide what you are.');
    } },
    { id: 'labsSeen', when: c => units.some(u => u.owner === PLAYER && Math.hypot(u.x / 32 - c.run.vars.labX, u.y / 32 - c.run.vars.labY) < 7), run: c => {
      c.say('lind', 'Lantern, these are signal maps. Of the crystal. Patterns, repeating, across the whole field.');
      c.say('lind', 'It\'s not geology. It\'s... thinking.');
    } },
    { id: 'showhold', when: c => c.done('vents'), run: c => { c.show('hold'); c.say('okoye', 'Three vents. Hold them ninety seconds and Lind gets his survey.'); } },
    // Act III remembers whether the labs were left standing
    { id: 'labsFlag', when: c => c.done('hold'), run: c => c.setFlag('labs', c.buildingsOf(HEARTH, 'lab').length > 0 ? 'spared' : 'burned') },
  ],
  onEvent(c, ev) {
    harvesterWarning(c, ev);
    if (ev.type !== 'resonance') return;
    if (ev.level === RES_TREMOR && !c.run.vars.tremorSaid) {
      c.run.vars.tremorSaid = 1;
      c.say('okoye', 'The ground\'s heaving under a crystal field. Spread the harvesters out before it tears the base apart.');
    }
    if (ev.level === RES_STORM && !c.run.vars.stormSaid) {
      c.run.vars.stormSaid = 1;
      c.say('lind', 'Crystal storm! Sight\'s gone in there, and the vents are choking. It\'s reacting to the cutting.');
    }
  },
  win: c => c.done('hold'),
  endWin: { title: 'The vents are taken', text: 'Reyes: "You can hear it now, can\'t you? Read our labs, Commander, before you cut again. Ask Helion why they never did."' },
  endLose: { title: 'The tide holds the vents', text: 'The Hearth holds the centre. Under the vents, something settles, and goes quiet again.' },
};

// ---------------------------------------------------------------------------
// II-6 · Resonance
const UPLINK_DEADLINE = 660;
const resonanceM: MissionDef = {
  id: 'act2-6', act: 2, code: 'II-8', title: 'Resonance', tagline: 'Destroy Kessler\'s Orbital Uplink before it charges',
  briefing: [
    'Lantern, Varga. Kessler is charging an Orbital Uplink. When it fires, he can hold the ark-fleet hostage, every sleeper aboard.',
    'Fleet Command has cleared you for the Orbital Protocol and your own Uplink. You have eleven minutes. Destroy his. And Lantern: deep-space arrays picked up something on approach to Cinder last night. Not ours. Not Kessler\'s.',
  ],
  goals: ['Destroy the three relay pylons that shield the Uplink', 'Destroy the Kessler Orbital Uplink before it charges (11:00)', 'Watch the crystal fields, and the sky'],
  seed: 66301, enemies: 1, size: 64, credits: 5000, resonance: true,
  startUpgrades: ['wpn1', 'wpn2', 'wpn3', 'orbital'],
  allowed: [...ACT2_TECH, 'spire', 'artillery', 'railgun', 'arctower', 'dominator', 'skyport', 'gunship', 'uplink', 'fusion', 'arm2', 'def2', 'bastion', 'juggernaut', 'sniper'],
  setup(c) {
    ensureFaction(KEEPERS);
    act2Base(c, ['fab', 'lab']);
    const b = c.base(PLAYER);
    c.place('spire', PLAYER, b.tx - 4, b.ty + 6);
    c.spawn(['hovertank', 'hovertank', 'rocketeer', 'rocketeer', 'rocketeer', 'trooper', 'trooper', 'trooper'], PLAYER, b.tx + 1, b.ty + 5);
    const k = c.base(KESSLER);
    c.place('nexus', KESSLER, k.tx, k.ty);
    const up = c.place('uplink', KESSLER, k.tx + 4, k.ty + 1);
    if (up) { c.run.vars.uplink = up.id; up.maxHp = up.hp = 2400; up.shielded = true; }   // hardened, and shielded by its relays
    for (const [id, dx, dy] of [['solar', -3, 0], ['solar', -3, 3], ['barracks', 0, 4], ['fab', 3, 4]] as [string, number, number][]) c.place(id, KESSLER, k.tx + dx, k.ty + dy);
    for (const [id, dx, dy] of [['railgun', 1, -3], ['railgun', 7, 3], ['railgun', 2, 8], ['bastion', 6, -3], ['turret', -1, 7], ['turret', 6, -2], ['turret', 7, 7], ['turret', -4, -2], ['turret', 9, 1], ['arctower', 4, 6]] as [string, number, number][]) c.place(id, KESSLER, k.tx + dx, k.ty + dy);
    for (let i = -3; i <= 9; i++) { c.place('heavywall', KESSLER, k.tx + i, k.ty - 6); c.place('heavywall', KESSLER, k.tx - 6, k.ty + i); }
    c.spawn(['dominator', 'dominator', 'hovertank', 'hovertank', 'hovertank', 'hovertank', 'vanguard', 'vanguard', 'vanguard', 'vanguard', 'rocketeer', 'rocketeer', 'rocketeer', 'artillery'], KESSLER, k.tx + 2, k.ty + 8, 'guard');
    // three relay pylons across the valley feed the uplink's shield: the far flank, the middle, and the player's side
    const mid = { tx: Math.round((b.tx + k.tx) / 2), ty: Math.round((b.ty + k.ty) / 2) };
    const relays: { tx: number; ty: number }[] = [
      { tx: k.tx + (b.tx < k.tx ? -2 : 2), ty: b.ty }, mid, { tx: b.tx, ty: k.ty + (b.ty < k.ty ? -2 : 2) },
    ];
    c.run.vars.relays = 0;
    relays.forEach((r, i) => {
      const p = c.place('fusion', KESSLER, r.tx, r.ty);
      if (!p) return;
      c.run.vars[`relay${i}`] = p.id; c.run.vars.relays++;
      c.place('turret', KESSLER, r.tx + 2, r.ty + 2); c.place('railgun', KESSLER, r.tx - 3, r.ty);
      c.spawn(['hovertank', 'vanguard', 'vanguard', 'rocketeer', 'rocketeer'], KESSLER, r.tx + 1, r.ty + 3, `relayGuard${i}`);
    });
  },
  intro(c) {
    c.say('kessler', 'You\'ve read it by now, haven\'t you? No? Then ask your engineer. That uplink is the only leverage this colony has left.');
    c.say('okoye', 'Eleven minutes. His uplink is shielded by three relay pylons out in the valley, so we take those first. Orbital Protocol\'s researched: get our own Uplink up too.');
  },
  update(c, dt) {
    const v = c.run.vars;
    c.run.vars.left = UPLINK_DEADLINE - c.t;
    // the shield holds while any relay stands
    const up = byId.get(v.uplink);
    const standing = [0, 1, 2].filter(i => v[`relay${i}`] !== undefined && byId.has(v[`relay${i}`])).length;
    v.relaysLeft = standing;
    if (up && up.kind === 'building' && up.shielded && standing === 0) {
      up.shielded = false;
      c.say('okoye', 'Last relay\'s down. The uplink\'s shield just dropped. Hit it with everything.');
    }
    v.wave = (v.wave ?? 60) - dt;
    if (v.wave <= 0) {
      v.wave = 80;
      const k = c.base(KESSLER), p = hqPos(c);
      c.attackMove(c.spawn(['hovertank', 'hovertank', 'vanguard', 'vanguard', 'rocketeer', 'trooper', 'trooper', ...(c.t > 300 ? ['dominator'] : [])], KESSLER, k.tx + 2, k.ty + 9), p.x, p.y);
    }
    // a field pushed past tremor sends the Hollow up, once per patch, three at most
    for (const h of harvesters()) {
      const tx = Math.floor(h.x / 32), ty = Math.floor(h.y / 32), cell = resCell(tx, ty);
      const key = `hollowCell${cell}`;
      if (v[key] || (v.hollowWaves ?? 0) >= 3) continue;
      const lvl = resonance[cell] ?? 0;
      // a field past tremor always calls them; the first time, any worked field will do after a while
      if (lvl < RES_TREMOR && !(c.t >= 200 && !v.hollowWaves && lvl >= 0.12)) continue;
      v[key] = 1; v.hollowWaves = (v.hollowWaves ?? 0) + 1;
      c.ambush(tx + 4, ty + 3, ['shardkin', 'shardkin', 'shardkin', 'burrower', 'choir'], `hollow${cell}`, h.id);
      c.say('seren', v.hollowWaves === 1 ? 'You cut and cut and cut. It is crying, root-takers. We hear it crying.' : 'Again. Again you cut.');
      if (v.hollowWaves === 1) c.say('okoye', 'Hollow, out of the ground at the harvesters! The field we\'re mining too hard, that\'s where they come up.');
    }
  },
  objectives: [
    { id: 'relays', text: c => `Destroy the shield relays: ${(c.run.vars.relays ?? 3) - (c.run.vars.relaysLeft ?? 3)} / ${c.run.vars.relays ?? 3}`, check: c => (c.run.vars.relaysLeft ?? 1) === 0 },
    { id: 'uplink', text: c => `Destroy the Kessler Orbital Uplink: ${fmt(Math.max(0, UPLINK_DEADLINE - c.t))} until it charges`, check: c => !byId.has(c.run.vars.uplink) },
  ],
  triggers: [
    { id: 'report', when: c => c.t >= 60, run: c => {
      c.say('lind', 'Lantern. Private channel. I\'ve sent you a file: the Resonance Report. Please read it.');
      c.say('lind', 'Nineteen years ago Helion proved that cutting the crystal destabilises Helios. They buried it. Then they built Project Lantern, to cut faster.');
      c.say('lind', 'I built it. I named it. I\'m so sorry.');
    } },
    { id: 'question', when: c => c.t >= 160, run: c => {
      c.say('okoye', 'Lantern.');
      c.say('okoye', 'Did you know?');
    } },
    { id: 'silence', when: c => c.t >= 230, run: c => c.say('okoye', 'Fleet\'s not answering. Varga\'s gone dark on us. Of course she has.') },
    { id: 'warn', when: c => c.t >= UPLINK_DEADLINE - 120, run: c => {
      c.say('kessler', 'Two minutes, Lantern. Then the fleet hears my terms, and so does every sleeper on it.');
      if (c.run.fired.includes('keepers')) c.say('keeper', 'Your machines argue over who will leave. None of you asked who will stay.');
    } },
    // the Vey's makers come down between the two human camps
    // ...at 2:30, or sooner if the second relay falls (the uplink is close to breaking)
    { id: 'keepers', when: c => c.t >= 150 || ((c.run.vars.relays ?? 3) - (c.run.vars.relaysLeft ?? 3)) >= 2, run: c => {
      // the open ground furthest from both camps and every relay, so nobody is standing on them when they land
      const keep = [c.base(PLAYER), c.base(KESSLER), ...c.buildingsOf(KESSLER, 'fusion').map(f => ({ tx: f.tx, ty: f.ty }))];
      let mid = { x: 0, y: 0 }, best = -1;
      for (let y = 8; y < 56; y += 4) for (let x = 8; x < 56; x += 4) {
        const dmin = Math.min(...keep.map(k => Math.hypot(k.tx - x, k.ty - y)));
        if (dmin > best) { best = dmin; mid = { x, y }; }
      }
      const at = clearSpot('beacon', mid, 10);
      if (at) {
        seedKeepers(at, 2600);
        c.place('obelisk', KEEPERS, at.x - 2, at.y + 1); c.place('obelisk', KEEPERS, at.x + 4, at.y + 1);
      }
      initKeepers(true, 0.7);
      if (at) { c.ping(at.x + 1, at.y + 1, '#ffd27a'); c.reveal(at.x + 1, at.y + 1, 8); }
      c.say('keeper', 'Small ones. You were given a garden that held your star in its place. You have cut it to the root.');
      c.say('lind', 'Lantern... the patterns on their hulls. They\'re the signal maps from Reyes\'s labs. They made it. The crystal is theirs.');
      c.say('kessler', 'What in God\'s name is that?');
      c.say('keeper', 'The one who cuts the most will answer first.');
      c.say('okoye', 'They\'re going for the harvesters, ours and Kessler\'s. Keep yours close, and keep pushing those relays.');
    } },
  ],
  onEvent: harvesterWarning,
  win: c => !byId.has(c.run.vars.uplink),
  lose: c => c.t >= UPLINK_DEADLINE && byId.has(c.run.vars.uplink),
  endWin: { title: 'The uplink falls', text: 'The Keeper, as the uplink burns: "One machine less. It changes nothing you have done." Okoye, quietly: "I asked you a question, Lantern." · Act II complete.' },
  endEliminated: { title: 'Caught between them', text: 'Kessler\'s guns on one side, the Keepers\' light on the other. Depot Six goes dark, and the uplink keeps charging.' },
  endLose: { title: 'The uplink fires', text: 'Kessler\'s uplink locks onto the ark-fleet. On every channel his terms begin, and the first of them is the Resonance Report, read aloud.' },
};

// ===========================================================================
// Act III — Last Light

const ACT3_TECH = [...ACT2_TECH, 'spire', 'artillery', 'railgun', 'arctower', 'dominator', 'skyport', 'gunship', 'bomber', 'fusion',
  'arm2', 'arm3', 'wpn2', 'wpn3', 'def2', 'bastion', 'juggernaut', 'sniper', 'colossus'];
const BROOD_SLOT = 5;
const hollowAllied = (c: Ctx) => c.flag('meridian') === 'protected';

// ---------------------------------------------------------------------------
// III-7 · Meridian
const meridian: MissionDef = {
  id: 'act3-7', act: 3, code: 'III-9', title: 'Meridian', tagline: 'The Hollow\'s ship, and a choice',
  briefing: [
    'Lantern, Varga. Survey drones found the wreck the Hollow live in: the Meridian. Colony ship, two hundred years down, listed as lost with all hands.',
    'The Ashen Clans found her too. Vessa Kol has sent you a message. So has something under the crust. You will have to decide which of them you answer.',
  ],
  goals: ['Decide the Meridian\'s fate', 'Then live with it'],
  seed: 77117, enemies: 3, size: 72, credits: 7000,
  allowed: ACT3_TECH,
  setup(c) {
    ensureFaction(HOLLOW);
    act2Base(c, ['fab', 'lab']);
    const b = c.base(PLAYER);
    c.spawn(['hovertank', 'hovertank', 'rocketeer', 'rocketeer', 'rocketeer', 'trooper', 'trooper', 'trooper', 'trooper', 'warden'], PLAYER, b.tx + 1, b.ty + 5);
    // the wreck near the middle, the Hollow round her
    const ship = c.place('meridian', HOLLOW, Math.floor(36) - 2, Math.floor(36) - 1);
    if (ship) c.run.vars.ship = ship.id;
    const sx = ship ? ship.tx : 34, sy = ship ? ship.ty : 35;
    c.spawn(['shardkin', 'shardkin', 'shardkin', 'shardkin', 'burrower', 'choir', 'choir'], HOLLOW, sx + 2, sy + 4, 'hollowHome');
    const a = c.base(ASHEN);
    c.place('camp', ASHEN, a.tx, a.ty); c.place('scrapyard', ASHEN, a.tx + 3, a.ty);
    for (const [dx, dy] of [[-2, 3], [4, 3], [1, -3], [6, 0]]) c.place('gunnest', ASHEN, a.tx + dx, a.ty + dy);
  },
  // the Hollow hold their fire until you've chosen; only selling them out makes them enemies
  onInstall(c) { setAllied(PLAYER, HOLLOW, c.run.vars.choice !== 2); },
  intro(c) {
    c.say('vessa', 'Commander. That wreck is mine: two hundred years of flux grown into her walls. Look the other way and there\'s four thousand in it for you.');
    c.say('seren', 'Root-taker. I am Seren. My mother was born in that ship, and hers. They will cut my children out of her walls. Will you watch?');
    c.ask('okoye', 'Your call, Lantern.', { key: 'meridian', fallback: 'defend', options: [{ id: 'defend', label: 'Stand with the Hollow' }, { id: 'sell', label: 'Take the money' }] });
  },
  onChoice(c, key, opt) {
    if (key !== 'meridian') return;
    if (opt === 'defend') {
      c.run.vars.choice = 1; c.setFlag('meridian', 'protected');
      setAllied(PLAYER, HOLLOW, true);
      c.show('protect');
      c.say('elder', 'Then stand at her side. We will stand at yours.');
      c.say('vessa', 'Pity. I liked you. Crews, take the ship. And whoever is standing in front of it.');
    } else {
      c.run.vars.choice = 2; c.setFlag('meridian', 'sold');
      setAllied(PLAYER, HOLLOW, false);
      players[PLAYER].credits += 4000;
      c.show('survive');
      c.say('vessa', 'Sensible. Stay out of my way for ten minutes and we\'re friends.');
      c.say('elder', 'Then you are what they are. We will remember you, root-taker. All of us.');
      c.say('okoye', '...Four thousand flux. I hope it was worth it, Lantern. I really do.');
    }
  },
  update(c, dt) {
    const v = c.run.vars;
    if (!v.choice) return;
    v.t0 ??= c.t;
    const into = c.t - v.t0;
    v.wave = (v.wave ?? 30) - dt;
    if (v.wave > 0) return;
    v.wave = v.choice === 1 ? 45 : 38;
    const ship = byId.get(v.ship);
    if (v.choice === 1) {
      // the Ashen come for the ship, more of them every time
      const a = c.base(ASHEN), n = 5 + Math.floor(into / 45);
      // mortars come once the fight is on (a second later): they outrange everything guarding her
      const comp = [...Array.from({ length: n }, (_, i) => ['technical', 'scav', 'harpooner', 'firebrand', 'scav', 'technical', 'rustbucket'][(i + Math.floor(into / 40)) % 7]), ...(into > 150 ? ['mortar'] : []), ...(into > 300 ? ['mortar'] : [])];
      const tgt = ship ? buildingCenter(ship as any) : hqPos(c);
      c.attackMove(c.spawn(comp, ASHEN, a.tx + 1, a.ty + 5), tgt.x, tgt.y);
    } else {
      // the Ashen strip the ship; the Hollow come up out of the ground for you
      if (ship && !v.cutting) { v.cutting = 1; const a = c.base(ASHEN); c.attackMove(c.spawn(['technical', 'technical', 'harpooner', 'harpooner', 'mortar', 'mortar'], ASHEN, a.tx + 1, a.ty + 5), buildingCenter(ship as any).x, buildingCenter(ship as any).y); }
      const hs = units.filter(u => u.owner === PLAYER && (u.def.harvester || u.def.id === 'trooper'));
      const tgt = hs[Math.floor(Math.random() * hs.length)];
      const at = tgt ? { x: Math.floor(tgt.x / 32), y: Math.floor(tgt.y / 32) } : { x: c.base(PLAYER).tx + 4, y: c.base(PLAYER).ty + 6 };
      const n = 4 + Math.floor(into / 70);
      c.ambush(at.x + 5, at.y + 4, Array.from({ length: n }, (_, i) => (i % 4 === 3 ? 'burrower' : i % 5 === 4 ? 'choir' : 'shardkin')), `fury${Math.floor(c.t)}`, tgt?.id);
    }
  },
  objectives: [
    { id: 'protect', text: c => `Protect the Meridian: ${fmt(Math.max(0, 420 - (c.t - (c.run.vars.t0 ?? c.t))))}`, hidden: true, check: c => c.run.vars.choice === 1 && c.t - (c.run.vars.t0 ?? c.t) >= 420 },
    { id: 'survive', text: c => `Survive the Hollow's fury: ${fmt(Math.max(0, 360 - (c.t - (c.run.vars.t0 ?? c.t))))}`, hidden: true, check: c => c.run.vars.choice === 2 && c.t - (c.run.vars.t0 ?? c.t) >= 360 },
  ],
  triggers: [
    { id: 'half', when: c => !!c.run.vars.choice && c.t - (c.run.vars.t0 ?? c.t) >= 200, run: c => {
      if (c.run.vars.choice === 1) c.say('elder', 'Her walls remember the sky. Two hundred years. A little longer, root-taker. A little longer.');
      else c.say('okoye', 'The Ashen are cutting into her now. Listen to that. It sounds like screaming.');
    } },
  ],
  onEvent: harvesterWarning,
  win: c => (c.run.vars.choice === 1 && c.done('protect')) || (c.run.vars.choice === 2 && c.done('survive')),
  lose: c => c.run.vars.choice === 1 && !byId.has(c.run.vars.ship),
  endWin: c => c.run.vars.choice === 1
    ? { title: 'The Meridian stands', text: 'Seren: "You stood with us. When the light comes, root-taker, we will stand with you." For the first time in two hundred years, someone on the surface knows their name.' }
    : { title: 'Four thousand flux', text: 'The Ashen haul the last of the Meridian\'s crystal away. Okoye says nothing on the drive back. She doesn\'t have to.' },
  endLose: { title: 'The Meridian falls', text: 'The Ashen cutters reach her heart. Under the crust, something that sounded like a choir goes silent.' },
};

// ---------------------------------------------------------------------------
// III-8 · Kessler's Wall
const kesslersWall: MissionDef = {
  id: 'act3-8', act: 3, code: 'III-12', title: 'Kessler\'s Wall', tagline: 'Break the Collective; hold the Lantern shaft',
  briefing: [
    'Lantern, Varga. Kessler has walled himself in around the last launch-capable vents in the north. His fleet bid goes out the moment the corridor opens. It cannot.',
    'Lind says Project Lantern is still drawing from the Vey\'s heart. He wants to go down the shaft and shut it off himself. I can\'t order you to let him. I can\'t order you to stop him either.',
  ],
  goals: ['Hold the head of the Lantern shaft while Lind goes down', 'Destroy Kessler\'s Nexus'],
  seed: 88231, enemies: 1, size: 72, credits: 9000,
  allowed: ACT3_TECH,
  aiOwners: [KESSLER],
  setup(c) {
    ensureFaction(HOLLOW); ensureFaction(BROOD_SLOT);
    act2Base(c, ['fab', 'lab']);
    const b = c.base(PLAYER);
    c.place('spire', PLAYER, b.tx - 4, b.ty + 6);
    c.spawn(['dominator', 'hovertank', 'hovertank', 'hovertank', 'artillery', 'rocketeer', 'rocketeer', 'rocketeer', 'rocketeer', 'vanguard', 'vanguard'], PLAYER, b.tx + 1, b.ty + 5);
    const k = c.base(KESSLER);
    const hq = c.place('nexus', KESSLER, k.tx, k.ty);
    if (hq) { c.run.vars.kessler = hq.id; hq.level = 3; hq.maxHp = hq.hp = hq.maxHp * 2; }   // his command core, fully hardened
    for (const [id, dx, dy] of [['solar', -4, 0], ['solar', -4, 3], ['barracks', 4, 0], ['fab', 4, 4], ['extractor', 0, 5], ['repairyard', -4, 6]] as [string, number, number][]) c.place(id, KESSLER, k.tx + dx, k.ty + dy);
    for (const [id, dx, dy] of [['bastion', -3, -4], ['bastion', 5, -3], ['railgun', 8, 2], ['railgun', -7, 4], ['arctower', 2, -5], ['turret', 9, 6], ['turret', -7, -2], ['turret', 1, 9], ['skyguard', 6, 8]] as [string, number, number][]) c.place(id, KESSLER, k.tx + dx, k.ty + dy);
    for (let i = -8; i <= 10; i++) { c.place('heavywall', KESSLER, k.tx + i, k.ty - 8); c.place('heavywall', KESSLER, k.tx - 9, k.ty + i); }
    c.spawn(['dominator', 'dominator', 'hovertank', 'hovertank', 'hovertank', 'vanguard', 'vanguard', 'vanguard', 'rocketeer', 'rocketeer', 'artillery'], KESSLER, k.tx + 2, k.ty + 10, 'guard');
    players[KESSLER].credits = 10000;
    // the Lantern shaft, out between the two of you
    const shaft = c.place('lanternshaft', PLAYER, Math.round((b.tx + k.tx) / 2), Math.round((b.ty + k.ty) / 2));
    if (shaft) c.run.vars.shaft = shaft.id;
  },
  intro(c) {
    c.say('varga', 'Lantern. Kessler\'s wall, and the shaft. Your call how you take them.');
    c.say('okoye', 'Bastions on the north face, railguns either side. Thumpers first, then the heavy armour.');
  },
  update(c, dt) {
    const v = c.run.vars;
    if (c.run.shown.includes('shaft') && !c.done('shaft')) {
      v.held = (v.held ?? 0) + dt;
      // Kessler wants the shaft too: armour comes for it every half minute while Lind is down there
      v.kw = (v.kw ?? 25) - dt;
      const sh = byId.get(v.shaft), hq = byId.get(v.kessler);
      if (v.kw <= 0 && sh && hq) {
        v.kw = 30;
        const k = c.base(KESSLER), p = buildingCenter(sh as any), n = Math.floor((v.held ?? 0) / 30);
        c.attackMove(c.spawn(['hovertank', 'hovertank', 'vanguard', 'vanguard', 'rocketeer', 'rocketeer', ...(n >= 1 ? ['dominator'] : []), ...(n >= 2 ? ['artillery', 'hovertank'] : [])], KESSLER, k.tx + 2, k.ty + 10), p.x, p.y);
        if (!v.kwSaid) { v.kwSaid = 1; c.say('kessler', 'That shaft is Helion\'s crime, Lantern. I\'ll have it as evidence, or I\'ll have it buried.'); }
      }
    }
  },
  objectives: [
    { id: 'shaft', text: c => `Hold the Lantern shaft while Lind goes down: ${Math.floor(c.run.vars.held ?? 0)} / 90 s`, hidden: true, check: c => (c.run.vars.held ?? 0) >= 90 },
    { id: 'kessler', text: 'Destroy Kessler\'s Nexus', check: c => !byId.has(c.run.vars.kessler) },
  ],
  triggers: [
    { id: 'terms', when: c => c.t >= 50, run: c => {
      c.say('kessler', 'Lantern. Stand down. Hand me Helion\'s board and every sleeper on that fleet comes with me, yours included. You have my word.');
      if (c.flag('meridian') === 'sold') {
        c.say('okoye', '...He\'s right, Lantern. About them. About you. I\'m sorry.');
        c.say('okoye', 'Okoye to Kessler. I\'m coming over.');
        c.run.vars.okoyeLeft = 1; c.setFlag('okoye', 'left');
      } else {
        c.say('okoye', 'He\'s not wrong about the board. But he\'s wrong about us. I\'m with you, Lantern. Let\'s finish this.');
        c.setFlag('okoye', 'stayed');
      }
    } },
    { id: 'lind', when: c => c.t >= 110, run: c => {
      c.show('shaft');
      const sh = byId.get(c.run.vars.shaft);
      if (sh) { const p = buildingCenter(sh as any); c.ping(Math.floor(p.x / 32), Math.floor(p.y / 32), '#43f3ec'); }
      c.say('lind', 'Lantern. I\'m at the shaft. If I shut Project Lantern off from the bottom, the Vey might hold long enough for the corridor. Keep them off the head of the shaft for ninety seconds.');
      c.say('lind', 'Don\'t argue. I built it. I\'m the only one who knows where the off switch is.');
    } },
    // the moment he starts shutting it down, the Vey wakes, and comes up the shaft
    { id: 'wakes', when: c => c.run.shown.includes('shaft') && (c.run.vars.held ?? 0) >= 25, run: c => {
      const sh = byId.get(c.run.vars.shaft);
      const at = sh ? clearSpot('heart', { x: (sh as any).tx + 6, y: (sh as any).ty + 4 }, 10) : null;
      if (at) { seedBrood(at); initBrood(true, 0.75); }
      c.say('lind', 'Lantern... something\'s coming up the shaft past me. It\'s... it\'s beautiful. It\'s not stopping.');
      c.say(hollowAllied(c) ? 'elder' : c.run.vars.okoyeLeft ? 'varga' : 'okoye', hollowAllied(c) ? 'The Vey is waking. It does not know friend from root-taker any more. Forgive it.' : 'Contacts out of the shaft! The ground itself is coming up at us!');
    } },
    { id: 'lindGone', when: c => c.done('shaft'), run: c => {
      c.say('lind', 'It\'s done. Lantern\'s off. It\'s... quiet down here now. Tell Mara I—');
      c.say(c.run.vars.okoyeLeft ? 'varga' : 'okoye', c.run.vars.okoyeLeft ? 'Signal lost. Lind\'s gone, Lantern.' : 'Teo? Teo. ...Signal lost. He\'s gone, Lantern.');
      c.setFlag('lind', 'gone');
    } },
  ],
  onEvent: harvesterWarning,
  win: c => c.done('shaft') && !byId.has(c.run.vars.kessler),
  lose: c => !c.done('shaft') && !byId.has(c.run.vars.shaft),
  endWin: c => ({ title: 'The wall comes down', text: `Kessler, on a dying channel: "You'll see what they are soon enough, Lantern. Remember I told you." ${c.run.vars.okoyeLeft ? "Somewhere in the rubble, Okoye's beacon stops moving." : 'Okoye stands at the shaft head for a long time.'}` }),
  endLose: { title: 'The shaft is lost', text: 'Something comes up the Lantern shaft and doesn\'t stop. Lind\'s channel goes to static and stays there.' },
};

// ---------------------------------------------------------------------------
// III-9 · Zero Day
const NOVA = 900, HOLD = 300;
// vents held by you or anyone standing with you (the Hearth, the Hollow) light the beacon together
const friendlyVents = () => neutrals.filter(n => n.kind === 'vent' && n.owner >= 0 && !hostile(n.owner, PLAYER)).length;
const zeroDay: MissionDef = {
  id: 'act3-9', act: 3, code: 'III-13', title: 'Zero Day', tagline: 'Hold the corridor while the sun dies',
  briefing: [
    'Lantern. This is Varga, on every channel I have. Helios is coming apart. The corridor opens in minutes and closes for good fifteen after that.',
    'Hold the vents long enough to light the beacon. After that, I\'m told, there will be a choice. I am sorry it falls to you.',
  ],
  goals: ['Hold three of the five vents for 5:00 before the sun goes', 'Then choose'],
  seed: 99991, enemies: 3, size: 80, credits: 9000, resonance: true,
  allowed: ACT3_TECH,
  aiOwners: [ASHEN],
  setup(c) {
    ensureFaction(HOLLOW); ensureFaction(BROOD_SLOT); ensureFaction(KEEPERS);
    act2Base(c, ['fab', 'lab']);
    const b = c.base(PLAYER);
    c.place('spire', PLAYER, b.tx - 4, b.ty + 6); c.place('skyport', PLAYER, b.tx + 7, b.ty + 4);
    c.spawn(['dominator', 'dominator', 'hovertank', 'hovertank', 'hovertank', 'artillery', 'artillery', 'rocketeer', 'rocketeer', 'rocketeer', 'vanguard', 'vanguard', 'sniper', 'gunship'], PLAYER, b.tx + 1, b.ty + 5);
    // the Ashen at their base; the Hearth at theirs (friends if you spared their labs)
    const a = c.base(ASHEN); c.place('hall', ASHEN, a.tx, a.ty); players[ASHEN].credits = 7000;
    const v = c.base(HEARTH);
    c.place('longhouse', HEARTH, v.tx, v.ty); c.place('lookout', HEARTH, v.tx + 3, v.ty); c.place('gunnest', HEARTH, v.tx + 1, v.ty + 3);
    setSupernova(NOVA);
  },
  onInstall(c) {
    if (c.flag('labs') === 'spared') setAllied(PLAYER, HEARTH, true);
    if (hollowAllied(c)) setAllied(PLAYER, HOLLOW, true);
  },
  intro(c) {
    c.say('varga', 'Lantern. Whatever happens in the next fifteen minutes: thank you.');
    if (c.flag('labs') === 'spared') c.say('reyes', 'Commander. You left our labs standing. The Hearth will hold the vents beside you, whatever you decide at the end.');
    else c.say('reyes', 'You burned our proof. We will not help you, Commander. Do what you came to do.');
    c.say(c.flag('okoye') === 'left' ? 'varga' : 'okoye', c.flag('okoye') === 'left' ? 'Okoye isn\'t with you. I know. Hold anyway.' : 'Last one, Lantern. Three vents. Five minutes. Let\'s go.');
  },
  update(c, dt) {
    const v = c.run.vars;
    if (!c.done('hold')) v.hold = friendlyVents() >= 3 ? (v.hold ?? 0) + dt : Math.max(0, (v.hold ?? 0) - dt * 2);
    if (v.seedAt !== undefined && !c.done('seed')) v.seed = (v.seed ?? 0) + (friendlyVents() >= 2 ? dt : 0);
    // everyone left comes for the vents: Vessa's raiders, bigger every minute, and the Hollow if you sold them out
    const friendly = neutrals.filter(n => n.kind === 'vent' && n.owner >= 0 && !hostile(n.owner, PLAYER));
    v.raid = (v.raid ?? 75) - dt;
    if (v.raid <= 0 && !c.done(v.seedAt !== undefined ? 'seed' : 'hold') && friendly.length) {
      v.raid = 45;
      const n = friendly[Math.floor(Math.random() * friendly.length)], a = c.base(ASHEN);
      const size = 5 + Math.floor(c.t / 70);
      c.attackMove(c.spawn(Array.from({ length: size }, (_, i) => ['technical', 'scav', 'harpooner', 'firebrand', 'rustbucket', 'scav', 'technical', 'mortar'][i % 8]), ASHEN, a.tx + 1, a.ty + 4), (n.tx + 0.5) * 32, (n.ty + 0.5) * 32);
      if (c.flag('meridian') === 'sold' && c.t > 150) {
        const fury = c.ambush(n.tx + 3, n.ty + 2, ['shardkin', 'shardkin', 'shardkin', 'burrower', ...(c.t > 400 ? ['shardkin', 'burrower'] : [])], `fury${Math.floor(c.t)}`);
        for (const u of fury) issueOrder(u, { type: 'attackMove', x: (n.tx + 0.5) * 32, y: (n.ty + 0.5) * 32 });   // they come for the vent, not the base
      }
      if (!v.raidSaid) { v.raidSaid = 1; c.say('vessa', 'Last seats on the last ship, Commander. I\'m not asking.'); }
    }
    // allies on the vents: the Hollow (if you stood with them) and the Hearth (if you spared them)
    v.allyWave = (v.allyWave ?? 20) - dt;
    if (v.allyWave <= 0) {
      v.allyWave = 75;
      const held = neutrals.filter(n => n.kind === 'vent' && n.owner === PLAYER);
      const n = held[Math.floor(Math.random() * held.length)] ?? neutrals.find(x => x.kind === 'vent');
      if (n && hollowAllied(c)) { const us = c.spawn(['shardkin', 'shardkin', 'shardkin', 'choir'], HOLLOW, n.tx + 3, n.ty + 3); for (const u of us) issueOrder(u, { type: 'move', x: (n.tx + 0.5) * 32, y: (n.ty + 0.5) * 32 }); }
      if (n && c.flag('labs') === 'spared') { const vb = c.base(HEARTH); c.attackMove(c.spawn(['firebrand', 'firebrand', 'scav', 'scav', 'scav', 'harpooner'], HEARTH, vb.tx + 1, vb.ty + 5), (n.tx + 0.5) * 32, (n.ty + 0.5) * 32); }
    }
  },
  objectives: [
    { id: 'hold', text: c => `Hold three vents, with your allies, to light the beacon: ${fmt(Math.max(0, HOLD - (c.run.vars.hold ?? 0)))}`, check: c => (c.run.vars.hold ?? 0) >= HOLD },
    { id: 'seed', text: c => `Hold two vents while the Hollow carry the heart-crystal to the beacon: ${Math.floor(c.run.vars.seed ?? 0)} / 60 s`, hidden: true, check: c => (c.run.vars.seed ?? 0) >= 60 },
  ],
  triggers: [
    { id: 'brood', when: c => c.t >= 40, run: c => {
      const at = clearSpot('heart', { x: 38, y: 38 }, 14);
      if (at) { seedBrood(at); initBrood(true, 0.8); }
      c.say(hollowAllied(c) ? 'elder' : 'lind', hollowAllied(c) ? 'The Vey is dying, and it is afraid. It will fight everything. Even us.' : 'Static on Lind\'s old channel. Just the sound of the ground breathing.');
    } },
    { id: 'keepers', when: c => c.t >= 120, run: c => {
      const at = clearSpot('beacon', { x: 70, y: 8 }, 10);
      if (at) { seedKeepers(at, 3000); initKeepers(true, 0.75); }
      c.say('keeper', 'We have come to watch the end of what we made. Choose well, small one. It is the last thing you will choose here.');
    } },
    { id: 'final', when: c => c.done('hold'), run: c => {
      const options = [{ id: 'fire', label: 'Fire the beacon' }, { id: 'give', label: 'Give the vents to Reyes' }];
      if (hollowAllied(c)) options.push({ id: 'seed', label: 'Carry the seed' });
      c.say('varga', 'The beacon is lit. Lantern, the corridor is open. I have to tell you something before you choose. I signed Project Lantern\'s fleet contract. I knew.');
      if (hollowAllied(c)) c.say('elder', 'There is a third way. The Vey can live in one crystal, its heart. Carry it with you, and it will not die with this sun. But Helios will not wait for it.');
      c.ask(c.flag('okoye') === 'left' ? 'varga' : 'okoye', 'It\'s yours, Lantern. All of it.', { key: 'end', fallback: 'fire', options });
    } },
  ],
  onChoice(c, key, opt) {
    if (key !== 'end') return;
    c.run.vars.ending = opt === 'fire' ? 1 : opt === 'give' ? 2 : 3;
    if (opt === 'seed') {
      c.run.vars.seedAt = c.t; c.show('seed');
      c.say('elder', 'Hold the vents. We are bringing it up now. All of us.');
    }
  },
  onEvent: harvesterWarning,
  win: c => (c.run.vars.ending === 1 || c.run.vars.ending === 2) || (c.run.vars.ending === 3 && c.done('seed')),
  lose: () => novaLeft <= 0,
  endEliminated: { title: 'The last light goes out', text: 'The base falls with the beacon still dark. Varga holds the fleet in orbit until there is nothing left to hold it for.' },
  endWin: c => c.run.vars.ending === 1
    ? { title: 'Last Light', text: 'The beacon burns the vents dry, and the Vey with them. The ark-fleet rides the corridor out as Helios goes. On an open channel, Admiral Varga reads the Resonance Report aloud to forty thousand waking sleepers. Behind them, Cinder is a cinder.' }
    : c.run.vars.ending === 2
    ? { title: 'The Long Dusk', text: 'You give the vents to Ama Reyes. The beacon gutters out; the Vey, unbled, takes hold of its star again. The fleet comes down to stay. Helion\'s board stands trial in the open, under a sun that is dying more slowly. Nobody knows how long that is. Everyone is here to find out.' }
    : { title: 'The Seed', text: 'The Hollow carry the Vey\'s heart aboard in their arms. The ark-fleet leaves with a living world in its hold and Seren\'s people beside it. Helios goes a moment later. Cinder, the Hearth, everyone who could not reach the corridor: gone. It is the best ending there was. It still cost a world.' },
  endLose: { title: 'Zero Day', text: 'Helios goes before the beacon is lit. There is no corridor, no fleet, no dawn. Only light.' },
};

// ===========================================================================
// Missions added in the second campaign pass. Each borrows a classic RTS idea:
// a day/night cycle (I-3), a commando infiltration (II-7), a convoy hunt
// (III-10) and an environmental hazard escort (III-11).

const tileDist = (u: { x: number; y: number }, tx: number, ty: number) => Math.hypot(u.x / 32 - (tx + 0.5), u.y / 32 - (ty + 0.5));
// the runner calls update() about every 0.3 s but passes 0.25; these missions time themselves off the real clock
function realDt(c: Ctx): number { const v = c.run.vars, d = v.lastT === undefined ? 0 : c.t - v.lastT; v.lastT = c.t; return Math.max(0, d); }
const NEUTRAL = ASHEN;   // an empty slot, allied to everyone, for things nobody owns yet
// a clear tile near a point on the line from a to b (t along it, `side` tiles off to one side)
function along(a: { tx: number; ty: number }, b: { tx: number; ty: number }, t: number, side = 0) {
  const dx = b.tx - a.tx, dy = b.ty - a.ty, len = Math.hypot(dx, dy) || 1;
  const x = Math.round(a.tx + dx * t - dy / len * side), y = Math.round(a.ty + dy * t + dx / len * side);
  return nearestTile(x, y, 8, (tx, ty) => inBounds(tx, ty) && terrain[idx(tx, ty)] === 0 && occupied[idx(tx, ty)] === -1) ?? { x, y };
}

// ---------------------------------------------------------------------------
// I-3 · Night Shift — day and night (after StarCraft II's *Outbreak*). By day the
// Hollow keep to their tunnels and you can push out and collapse them; at night
// they come up and hunt anything outside your lights. Harvester Two is out there.
const DAY = 110, DUSK = 10, NIGHT = 80, DAWN = 10, CYCLE = DAY + DUSK + NIGHT + DAWN;
function nightLevel(t: number) {
  const p = t % CYCLE;
  if (p < DAY) return 0;
  if (p < DAY + DUSK) return (p - DAY) / DUSK;
  if (p < DAY + DUSK + NIGHT) return 1;
  return 1 - (p - DAY - DUSK - NIGHT) / DAWN;
}
const mouthsAlive = (c: Ctx) => [0, 1, 2, 3].map(i => byId.get(c.run.vars[`m${i}`])).filter((b): b is Building => !!b && b.kind === 'building');

const nightShift: MissionDef = {
  id: 'act1-night', act: 1, code: 'I-3', title: 'Night Shift', tagline: 'Find Harvester Two; the tunnels wake at dark',
  briefing: [
    'Lantern, Varga. Harvester Two\'s transponder has started pinging again, from somewhere past the northern scrub, under the ground. It went down with a full load and a drive core the fleet needs.',
    'Okoye has found the tunnels the pale ones came out of. By day they stay below. At night they come up. Collapse the tunnels by daylight and bring the harvester home.',
  ],
  goals: ['Collapse the four tunnel mouths', 'Find Harvester Two and bring it home', 'Keep your people inside the lights after dark'],
  seed: 51207, enemies: 1, credits: 3500,
  allowed: [...BASE_TECH, 'sensor', 'pyro', 'vanguard'],
  // Harvester Two sits in an empty slot that is friends with everyone, so nobody shoots it until it's found
  onInstall() { setAllied(PLAYER, NEUTRAL, true); setAllied(HOLLOW, NEUTRAL, true); setAllied(KESSLER, NEUTRAL, true); },
  setup(c) {
    ensureFaction(NEUTRAL);
    nexusAtBase(c);
    const b = c.base(PLAYER), far = c.base(KESSLER);
    c.place('solar', PLAYER, b.tx + 4, b.ty); c.place('solar', PLAYER, b.tx + 4, b.ty - 3);
    c.place('extractor', PLAYER, b.tx, b.ty - 4); c.place('barracks', PLAYER, b.tx + 4, b.ty + 3);
    c.place('turret', PLAYER, b.tx + 6, b.ty - 1); c.place('turret', PLAYER, b.tx + 2, b.ty + 7);
    c.spawn(['trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer', 'pyro', 'pyro', 'vanguard', 'vanguard'], PLAYER, b.tx + 1, b.ty + 5);
    // four tunnel mouths fanned out between the depot and the far scrub, a few sleepers by each
    const fan: [number, number][] = [[0.36, -9], [0.5, 8], [0.68, -6], [0.86, 5]];
    fan.forEach(([t, side], i) => {
      const p = along(b, far, t, side);
      const m = c.place('tunnelmouth', HOLLOW, p.x, p.y);
      if (m) { c.run.vars[`m${i}`] = m.id; c.spawn(['shardkin', 'shardkin', ...(i >= 2 ? ['burrower'] : [])], HOLLOW, m.tx + 1, m.ty + 3); }
    });
    // Harvester Two, crusted with crystal, out past the last mouth
    const h = c.spawn(['harvester'], NEUTRAL, far.tx + 1, far.ty + 1)[0];
    if (h) { h.harvestState = 'none'; h.hp = Math.round(h.maxHp * 0.45); c.run.vars.h2 = h.id; }
  },
  intro(c) {
    c.say('okoye', 'Daylight. That\'s our window. The tunnel mouths are marked on your map: get troops on them and bring them down while the pale ones sleep.');
    c.say('okoye', 'When the sun goes, pull everyone back inside the lights. They hunt in the dark, and our scopes don\'t see much past the floodlights.');
    for (const m of mouthsAlive(c)) { c.reveal(m.tx + 1, m.ty + 1, 3); c.ping(m.tx + 1, m.ty + 1, '#bfeef2'); }
  },
  update(c) {
    const dt = realDt(c);
    const v = c.run.vars, n = nightLevel(c.t), phase = c.t % CYCLE, nightNo = Math.floor(c.t / CYCLE) + 1;
    mission.night = n * 0.88;
    mission.visionMul = 1 - 0.45 * n;
    mission.lights = () => mouthsAlive(c).map(m => ({ x: (m.tx + 1) * 32, y: (m.ty + 1) * 32, r: 64 }));
    // dusk and dawn, once a cycle
    if (phase >= DAY - 15 && phase < DAY && v.warned !== nightNo) {
      v.warned = nightNo;
      c.say('okoye', nightNo === 1 ? 'Sun\'s going down, Lantern. Fifteen seconds. Get everyone back inside the lights and let the turrets do the work.' : 'Dusk again. Pull them in.');
    }
    const night = phase >= DAY + DUSK * 0.5 && phase < DAY + DUSK + NIGHT;
    if (night) {
      v.wave = (v.wave ?? 3) - dt;
      if (v.wave <= 0) {
        v.wave = 28;
        const mine = c.unitsOf(PLAYER), homes = c.buildingsOf(PLAYER), open = mouthsAlive(c);
        // one tunnel at a time, in turn; bigger each night and the more tunnels you've left open
        for (const m of open.length ? [open[(v.waveNo ?? 0) % open.length]] : []) {
          const size = Math.min(6, nightNo + Math.floor(open.length / 3));
          const pack = Array.from({ length: size }, (_, k) => (k === 2 ? 'burrower' : 'shardkin'));
          const us = c.spawn(pack, HOLLOW, m.tx + 1, m.ty + 3, 'night');
          for (const u of us) surface(u);
          // they go for whatever is out in the dark first, else the nearest building
          const lit = (u: Unit) => homes.some(b => Math.hypot(u.x - buildingCenter(b).x, u.y - buildingCenter(b).y) < Math.max(3, b.def.vision * 0.7) * 32);
          const prey = mine.filter(u => !lit(u)).sort((a, z) => tileDist(a, m.tx, m.ty) - tileDist(z, m.tx, m.ty))[0];
          const home = homes.sort((a, z) => Math.hypot(a.tx - m.tx, a.ty - m.ty) - Math.hypot(z.tx - m.tx, z.ty - m.ty))[0];
          const to = prey ? { x: prey.x, y: prey.y } : home ? buildingCenter(home) : null;
          if (to) c.attackMove(us, to.x, to.y);
        }
        v.waveNo = (v.waveNo ?? 0) + 1;
      }
    } else if (phase >= DAY + DUSK + NIGHT && v.dawn !== nightNo) {
      v.dawn = nightNo; v.wave = 3;
      for (const u of c.alive('night')) burrowUnit(u);
      c.say('okoye', nightNo === 1 ? 'Dawn. They\'re going back down, all of them, at once. Like someone called them home. Move out while it\'s light.' : 'Sun\'s up. Go.');
    }
    // finding Harvester Two: any of yours within reach wakes its transponder and it follows you home
    const h = byId.get(v.h2) as Unit | undefined;
    if (h && h.owner === NEUTRAL && c.unitsOf(PLAYER).some(u => Math.hypot(u.x - h.x, u.y - h.y) < 3 * 32)) {
      h.owner = PLAYER; h.harvestState = 'none';
      const p = hqPos(c); issueOrder(h, { type: 'move', x: p.x + 40, y: p.y + 90 });
      v.found = 1; c.show('home');
      c.say('okoye', 'Found it. Lantern, it isn\'t wrecked. They didn\'t strip it. There\'s crystal grown right over the hull, like a dressing on a wound.');
      c.say('seren', 'It sang to us, under the ground. Take it, root-taker. Take it home and leave the deep ones be.');
      c.say('okoye', 'It\'s driving. Escort it home, and keep it out of the dark.');
    }
    if (h && h.owner === PLAYER && !v.home && Math.hypot(h.x - hqPos(c).x, h.y - hqPos(c).y) < 6 * 32) {
      v.home = 1; issueOrder(h, { type: 'idle' });   // back to work
    }
    if (v.found && !v.home && !h) v.lost = 1;   // once it's home it's just another harvester
  },
  objectives: [
    { id: 'mouths', text: c => `Collapse the tunnel mouths: ${4 - mouthsAlive(c).length} / 4`, check: c => mouthsAlive(c).length === 0 },
    { id: 'find', text: 'Find Harvester Two (its signal comes from the far scrub)', check: c => !!c.run.vars.found },
    { id: 'home', text: 'Bring Harvester Two back to the depot', hidden: true, check: c => !!c.run.vars.home },
    { id: 'clock', text: c => { const p = c.t % CYCLE, night = p >= DAY && p < DAY + DUSK + NIGHT; return night ? `Night: dawn in ${fmt(DAY + DUSK + NIGHT + DAWN - p)}` : `Day: dusk in ${fmt(DAY - p)}`; }, check: () => false },
  ],
  triggers: [
    { id: 'firstMouth', when: c => mouthsAlive(c).length < 4, run: c => {
      c.say('lind', 'Lantern, Lind. The shaft walls are lined with crystal, grown smooth. This wasn\'t dug. It was grown, the way a root grows. I don\'t like what that means.');
    } },
    { id: 'beacon', when: c => c.t >= 40 && !c.run.vars.found, run: c => {
      const f = c.base(KESSLER); c.ping(f.tx + 1, f.ty + 1, '#e8c66a');
      c.say('okoye', 'Harvester Two\'s transponder: faint, out past the last tunnel. Marked. Daylight only, Lantern.');
    } },
    { id: 'lastMouth', when: c => mouthsAlive(c).length === 0, run: c => {
      c.say('okoye', 'That\'s the last of them caved in. Whatever lives down there will have to find another way up.');
    } },
  ],
  onEvent: harvesterWarning,
  win: c => c.done('mouths') && c.done('home'),
  lose: c => !!c.run.vars.lost,
  endWin: { title: 'The night shift ends', text: 'Lind, over the harvester\'s crusted hull: "It isn\'t damaged, Lantern. It\'s been... mended. Whatever they are, they fixed our machine." Okoye, quietly: "Then why do they keep trying to kill us?"' },
  endLose: { title: 'Lost in the dark', text: 'Harvester Two goes back under the crust, and this time its transponder stays silent.' },
  endEliminated: { title: 'The lights go out', text: 'One by one the floodlights at Depot Six go dark. By dawn there is nothing left above ground to light.' },
};

// ---------------------------------------------------------------------------
// II-7 · Dead Drop — a commando mission (after the hero missions of StarCraft,
// Red Alert and Warcraft III). No base: Okoye and a small squad slip past
// searchlights and sentries into the Survey Annex and take the archive core.
interface Searchlight { x: number; y: number; base: number; amp: number; speed: number; phase: number }
const LIGHT_R = 6.5, LIGHT_HW = 0.3, GUARD_SIGHT = 4.5;
const lightAngle = (l: Searchlight, t: number) => l.base + Math.sin(t * l.speed + l.phase) * l.amp;
function inBeam(l: Searchlight, t: number, x: number, y: number) {
  const dx = x / 32 - l.x, dy = y / 32 - l.y, d = Math.hypot(dx, dy);
  if (d > LIGHT_R || d < 0.3) return d < 0.3;
  let da = Math.atan2(dy, dx) - lightAngle(l, t);
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.abs(da) < LIGHT_HW;
}
function lightsOf(c: Ctx): Searchlight[] {
  const v = c.run.vars, out: Searchlight[] = [];
  for (let i = 0; v[`l${i}x`] !== undefined; i++) out.push({ x: v[`l${i}x`], y: v[`l${i}y`], base: v[`l${i}b`], amp: 1.1, speed: v[`l${i}s`], phase: v[`l${i}p`] });
  return out;
}

const deadDrop: MissionDef = {
  id: 'act2-dead', act: 2, code: 'II-7', title: 'Dead Drop', tagline: 'Okoye\'s squad, no base: steal the archive core',
  briefing: [
    'Lantern, Okoye. The Survey Annex: Helion\'s old field office in the badlands. Lind swears the board kept a backup of the survey archive there, the one that burned at Depot Six. Kessler\'s people took the Annex last month. They\'re looking for the same thing.',
    'No base, no reinforcements. Me, two Ghost Snipers and three Troopers. Stay out of the searchlights and away from the sentries. If they see us, they purge the archive.',
  ],
  goals: ['Reach the archive vault unseen', 'Copy the archive core (stay by the vault)', 'Get Okoye back to the landing zone'],
  seed: 64613, enemies: 1, size: 56, credits: 0,
  allowed: [],
  onInstall(c) {
    mission.unitsOnly = true;
    mission.night = 0.62; mission.visionMul = 0.8;
    // the beams are lit pools at night, and drawn over the fog so you can always see where they sweep
    mission.lights = () => lightsOf(c).map(l => { const a = lightAngle(l, c.run.t); return { x: (l.x + Math.cos(a) * LIGHT_R * 0.6) * 32, y: (l.y + Math.sin(a) * LIGHT_R * 0.6) * 32, r: 80 }; });
    mission.drawOver = g => drawSearchlights(g, lightsOf(c), c.run.t, !!c.run.vars.alarm);
  },
  setup(c) {
    const b = c.base(PLAYER), k = c.base(KESSLER);
    c.run.vars.lzx = b.tx + 1; c.run.vars.lzy = b.ty + 1;
    const squad = c.spawn(['okoye', 'sniper', 'sniper', 'trooper', 'trooper', 'trooper'], PLAYER, b.tx + 1, b.ty + 2);
    c.run.vars.okoye = squad[0]?.id ?? -1;
    // the Annex: a command post, the archive vault and its guns
    const hq = c.place('outpost', KESSLER, k.tx, k.ty);
    const vault = c.place('lab', KESSLER, k.tx + (k.tx < b.tx ? 3 : -3), k.ty + (k.ty < b.ty ? 3 : -3));
    if (vault) { vault.inert = true; c.run.vars.vault = vault.id; c.run.vars.vx = vault.tx + 1; c.run.vars.vy = vault.ty + 1; }
    c.place('barracks', KESSLER, k.tx + (k.tx < b.tx ? -1 : 2), k.ty + (k.ty < b.ty ? 4 : -4));
    c.place('solar', KESSLER, k.tx + (k.tx < b.tx ? 4 : -4), k.ty);
    if (hq) c.run.vars.annex = hq.id;
    const away = (n: number, axis: 'x' | 'y') => -n * Math.sign(axis === 'x' ? b.tx - k.tx || 1 : b.ty - k.ty || 1);
    for (const [dx, dy] of [[3, 1], [1, 3]]) c.place('turret', KESSLER, k.tx + away(dx, 'x'), k.ty + away(dy, 'y'));
    // searchlights along the approach, each sweeping across the likely paths
    const towardsBase = Math.atan2(b.ty - k.ty, b.tx - k.tx);
    ([[0.3, -6, 0.6], [0.42, 7, 0.75], [0.55, -3, 0.9], [0.66, 6, 0.7], [0.78, -5, 1.0]] as [number, number, number][]).forEach(([t, side, sp], i) => {
      const p = along(b, k, t, side), v = c.run.vars;
      v[`l${i}x`] = p.x + 0.5; v[`l${i}y`] = p.y + 0.5; v[`l${i}b`] = towardsBase + (side > 0 ? -0.6 : 0.6); v[`l${i}s`] = sp; v[`l${i}p`] = t * 9;
    });
    // sentries that stand still, and pairs that walk a beat
    for (const [t, side] of [[0.5, -1], [0.66, 4], [0.8, 0], [0.92, -3]] as [number, number][]) { const p = along(b, k, t, side); c.spawn(['trooper'], KESSLER, p.x, p.y, 'sentry'); }
    const beats: [number, number, number, number][] = [[0.4, 4, 0.55, -6], [0.6, -7, 0.75, 2], [0.78, 6, 0.9, -4]];
    beats.forEach(([t1, s1, t2, s2], i) => {
      const p = along(b, k, t1, s1), q = along(b, k, t2, s2);
      c.run.vars[`b${i}ax`] = p.x; c.run.vars[`b${i}ay`] = p.y; c.run.vars[`b${i}bx`] = q.x; c.run.vars[`b${i}by`] = q.y;
      c.spawn(['trooper', 'rocketeer'], KESSLER, p.x, p.y, `beat${i}`);
    });
    c.spawn(['trooper', 'trooper', 'rocketeer', 'vanguard'], KESSLER, k.tx + away(2, 'x'), k.ty + away(2, 'y'), 'garrison');
  },
  intro(c) {
    c.say('okoye', 'Lights out, comms low. The Annex is north-east. Watch the searchlight beams: if one touches us, or a sentry gets within a few paces, the whole place wakes up.');
    c.say('okoye', 'The snipers outrange the sentries. Drop one from the dark and nobody hears a thing. Let the patrols walk past.');
    const v = c.run.vars; c.ping(v.vx, v.vy, '#e8c66a');
  },
  update(c) {
    const dt = realDt(c);
    const v = c.run.vars, t = c.t;
    const okoye = byId.get(v.okoye) as Unit | undefined;
    if (!okoye) { v.okoyeDown = 1; return; }
    const mine = c.unitsOf(PLAYER);
    // patrols walk their beat until the alarm goes
    if (!v.alarm) for (let i = 0; i < 3; i++) for (const u of c.alive(`beat${i}`)) {
      if (u.order.type !== 'idle' || u.autoTargetId >= 0) continue;
      const leg = (v[`leg${u.id}`] = 1 - (v[`leg${u.id}`] ?? 0));
      const tx = leg ? v[`b${i}bx`] : v[`b${i}ax`], ty = leg ? v[`b${i}by`] : v[`b${i}ay`];
      issueOrder(u, { type: 'move', x: (tx + 0.5) * 32, y: (ty + 0.5) * 32 }, true);
    }
    // being seen: a beam, a sentry close by, or a gun in range
    if (!v.alarm) {
      const enemies = c.unitsOf(KESSLER), ls = lightsOf(c);
      const seen = mine.find(u => ls.some(l => inBeam(l, t, u.x, u.y)) || enemies.some(e => Math.hypot(e.x - u.x, e.y - u.y) < GUARD_SIGHT * 32));
      if (seen) raiseAlarm(c, seen, true);
    }
    if (v.alarm) {
      // the Annex sends squads after the intruders, and purges the archive if it can
      v.react = (v.react ?? 20) - dt;
      if (v.react <= 0) {
        v.react = 32;
        const k = c.base(KESSLER);
        c.attackMove(c.spawn(['trooper', 'trooper', 'rocketeer', ...(v.copied ? ['vanguard'] : [])], KESSLER, k.tx + 1, k.ty + 3), okoye.x, okoye.y);
      }
      if (!v.copied) { v.purge = (v.purge ?? 150) - dt; if (v.purge <= 0) v.purged = 1; }
    }
    // copying the core: someone stands by the vault
    if (!v.copied && byId.has(v.vault) && mine.some(u => tileDist(u, v.vx, v.vy) < 3)) {
      v.dl = (v.dl ?? 0) + dt;
      if (v.dl >= 15) {
        v.copied = 1; c.show('extract');
        c.ping(v.lzx, v.lzy, '#e8c66a'); c.reveal(v.lzx, v.lzy, 5);
        c.say('okoye', 'Got it. The core\'s copied and it\'s on me. And that tripped every alarm in the building. Back to the landing zone, fast!');
        c.say('varga', 'Lantern, Varga. I have a dropship holding over your LZ with a fire team aboard. Get her there.');
        c.spawn(['trooper', 'trooper', 'rocketeer', 'rocketeer'], PLAYER, v.lzx, v.lzy + 2);
        if (!v.alarm) raiseAlarm(c, okoye, false);
      }
    }
    if (v.copied && tileDist(okoye, v.lzx, v.lzy) < 3.5) v.out = 1;
  },
  objectives: [
    { id: 'vault', text: c => c.run.vars.copied ? 'Copy the archive core' : `Copy the archive core at the vault: ${Math.floor(c.run.vars.dl ?? 0)} / 15 s${c.run.vars.alarm ? ` · ALARM: purge in ${fmt(c.run.vars.purge ?? 0)}` : ''}`, check: c => !!c.run.vars.copied },
    { id: 'unseen', text: 'Reach the vault unseen', optional: true, check: c => !!c.run.vars.copied && !c.run.vars.seenFirst },
    { id: 'extract', text: 'Get Okoye back to the landing zone', hidden: true, check: c => !!c.run.vars.out },
    { id: 'alive', text: 'Okoye must survive', check: () => false },
  ],
  triggers: [
    { id: 'firstKill', when: c => c.alive('sentry').length < 4 || [0, 1, 2].some(i => c.alive(`beat${i}`).length < 2), run: c => {
      c.say('okoye', 'Quiet. I knew some of these people, Lantern. Not well. Well enough.');
    } },
    { id: 'nearVault', when: c => c.unitsOf(PLAYER).some(u => tileDist(u, c.run.vars.vx, c.run.vars.vy) < 8), run: c => {
      c.say('okoye', 'That\'s the vault. Get someone up against it and hold for fifteen seconds while I copy the core.');
    } },
  ],
  win: c => !!c.run.vars.out,
  lose: c => !!c.run.vars.okoyeDown || !!c.run.vars.purged,
  endWin: { title: 'Dead drop', text: 'Lind turns the core over in his hands. "It\'s locked with board keys, Lantern. Nineteen years of survey data, locked." A long pause. "I think I know one of the keys. I\'m afraid I know it."' },
  endLose: { title: 'The archive is gone', text: 'Either Okoye is down or the Annex has purged its archive. Whatever the board buried out here stays buried.' },
};
function raiseAlarm(c: Ctx, u: Unit, spotted: boolean) {
  const v = c.run.vars;
  v.alarm = 1; if (spotted && !v.copied) v.seenFirst = 1;
  sfx('siren');
  const tx = Math.floor(u.x / 32), ty = Math.floor(u.y / 32);
  c.ping(tx, ty, '#ff4030');
  if (spotted) c.say('okoye', 'We\'re spotted! They\'ll start purging the archive. Forget quiet: get to that vault NOW.');
  for (const e of c.unitsOf(KESSLER)) issueOrder(e, { type: 'attackMove', x: u.x + Math.random() * 60 - 30, y: u.y + Math.random() * 60 - 30 });
}
function drawSearchlights(g: CanvasRenderingContext2D, ls: Searchlight[], t: number, alarm: boolean) {
  for (const l of ls) {
    const x = l.x * 32, y = l.y * 32, a = lightAngle(l, t), r = LIGHT_R * 32;
    const grd = g.createRadialGradient(x, y, 4, x, y, r);
    const col = alarm ? '255,90,70' : '255,236,170';
    grd.addColorStop(0, `rgba(${col},0.42)`); grd.addColorStop(0.75, `rgba(${col},0.2)`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a - LIGHT_HW, a + LIGHT_HW); g.closePath(); g.fill();
    g.fillStyle = '#1a1612'; g.fillRect(x - 5, y - 5, 10, 10);
    g.fillStyle = alarm ? '#ff6a4a' : '#ffe9a8'; g.beginPath(); g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.5, 0, Math.PI * 2); g.fill();
  }
}

// ---------------------------------------------------------------------------
// III-10 · The Haul Road — a convoy hunt (after StarCraft II's *The Great Train
// Robbery*). Kessler's ore haulers drive a fixed road from his mine to his depot
// on a timetable; stop eight of twelve. A hauler shot to a third of its plating
// stalls, and anyone of yours who reaches it can drive it home.
const HAULS = 12, HAUL_GAP = 38, HAUL_START = 45;
function roadPoints(c: Ctx): { x: number; y: number }[] {
  const v = c.run.vars, out: { x: number; y: number }[] = [];
  for (let i = 0; v[`rx${i}`] !== undefined; i++) out.push({ x: v[`rx${i}`], y: v[`ry${i}`] });
  return out;
}
const haulRoad: MissionDef = {
  id: 'act3-haul', act: 3, code: 'III-10', title: 'The Haul Road', tagline: 'Stop Kessler\'s flux convoys',
  briefing: [
    'Lantern, Varga. Kessler is stockpiling flux behind his wall in the north. He means to light a beacon of his own and take the corridor with his people. Every load reaches him down one road, from his mine to his depot, on a timetable.',
    'Stop eight of the twelve haulers. Put enough rounds into one and it stalls: get someone onto it and it\'s ours, load and all.',
  ],
  goals: ['Stop 8 of 12 Kessler haulers', 'Don\'t let 5 reach the depot', 'Optional: capture a stalled hauler'],
  seed: 61421, enemies: 1, size: 72, credits: 7000,
  allowed: ACT3_TECH,
  onInstall(c) {
    mission.drawGround = (g, t) => {
      const pts = roadPoints(c);
      if (pts.length < 2) return;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      const path = () => { g.beginPath(); g.moveTo((pts[0].x + 0.5) * 32, (pts[0].y + 0.5) * 32); for (const p of pts.slice(1)) g.lineTo((p.x + 0.5) * 32, (p.y + 0.5) * 32); };
      path(); g.strokeStyle = 'rgba(58,38,24,0.38)'; g.lineWidth = 64; g.stroke();
      path(); g.strokeStyle = 'rgba(150,120,86,0.22)'; g.lineWidth = 44; g.stroke();
      g.setLineDash([10, 14]); g.lineDashOffset = -t * 6;
      for (const off of [-9, 9]) { g.save(); g.translate(off * 0.7, off * 0.7); path(); g.strokeStyle = 'rgba(40,24,14,0.45)'; g.lineWidth = 3; g.stroke(); g.restore(); }
      g.restore();
    };
  },
  setup(c) {
    act2Base(c, ['fab', 'lab']);
    const b = c.base(PLAYER), k = c.base(KESSLER);
    c.spawn(['hovertank', 'hovertank', 'hovertank', 'raider', 'raider', 'rocketeer', 'rocketeer', 'rocketeer', 'trooper', 'trooper'], PLAYER, b.tx + 1, b.ty + 5);
    // the mine and the depot sit on the other two corners; the road crosses the middle
    const mine = { tx: b.tx, ty: k.ty }, depot = { tx: k.tx, ty: b.ty };
    const mid = { tx: Math.round((b.tx + k.tx) / 2), ty: Math.round((b.ty + k.ty) / 2) };
    const pts = [mine, { tx: Math.round((mine.tx + mid.tx) / 2) + 4, ty: Math.round((mine.ty + mid.ty) / 2) + 4 }, mid,
      { tx: Math.round((depot.tx + mid.tx) / 2) - 4, ty: Math.round((depot.ty + mid.ty) / 2) - 4 }, depot].map(p => along(p, p, 0));
    pts.forEach((p, i) => { c.run.vars[`rx${i}`] = p.x; c.run.vars[`ry${i}`] = p.y; });
    c.place('extractor', KESSLER, mine.tx + 1, mine.ty - 1);
    for (const [dx, dy] of [[3, 2], [-2, 3]]) c.place('turret', KESSLER, mine.tx + dx, mine.ty + dy);
    const d = c.place('outpost', KESSLER, depot.tx - 1, depot.ty + 1); if (d) d.maxHp = d.hp = d.maxHp * 3;
    for (const [id, dx, dy] of [['bastion', 3, -3], ['railgun', -4, 3], ['turret', 2, 4], ['turret', -3, -3]] as [string, number, number][]) c.place(id, KESSLER, depot.tx + dx, depot.ty + dy);
    c.place('barracks', KESSLER, k.tx, k.ty); c.place('fab', KESSLER, k.tx + 3, k.ty);
  },
  intro(c) {
    c.say('okoye', 'The road\'s marked on your map. First hauler leaves the mine in under a minute, and one every forty seconds after that.');
    c.say('okoye', 'Early ones run alone. Later ones bring escorts. Hit them on the open stretch, away from the guns at either end.');
    const p = roadPoints(c); if (p[0]) c.ping(p[0].x, p[0].y, '#e58a3a');
    // scouts have walked the whole road: it's on the map from the start
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], z = p[i], n = Math.ceil(Math.hypot(z.x - a.x, z.y - a.y) / 2);
      for (let k = 0; k <= n; k++) c.reveal(Math.round(a.x + (z.x - a.x) * k / n), Math.round(a.y + (z.y - a.y) * k / n), 2);
    }
  },
  update(c) {
    const dt = realDt(c);
    const v = c.run.vars, pts = roadPoints(c);
    // the timetable
    const due = Math.min(HAULS, Math.floor((c.t - HAUL_START) / HAUL_GAP) + 1);
    while ((v.sent ?? 0) < due) {
      const i = v.sent = (v.sent ?? 0) + 1;
      const p = pts[0];
      const h = c.spawn(['harvester'], KESSLER, p.x, p.y)[0];
      if (h) { h.harvestState = 'none'; (c.run.groups.haul ??= []).push(h.id); v[`wp${h.id}`] = 1; }
      const esc = i <= 3 ? [] : i <= 7 ? ['hovertank', 'hovertank'] : i <= 10 ? ['hovertank', 'hovertank', 'dominator'] : ['dominator', 'dominator', 'hovertank', 'artillery'];
      for (const e of c.spawn(esc, KESSLER, p.x + 1, p.y + 1, 'escort')) v[`wp${e.id}`] = 1;
      if (i === 4) c.say('okoye', 'Escorts from here on, Lantern. Two tanks per hauler.');
      if (i === 8) c.say('kessler', 'You\'re robbing colonists of their fuel, Lantern. Every load you burn is a family that doesn\'t leave.');
      if (i === HAULS) c.say('okoye', 'Last one\'s rolling. Make it count.');
    }
    // followers: haulers drive, escorts sweep; both step down the road point by point
    v.step = (v.step ?? 0) - dt;
    const reissue = v.step <= 0; if (reissue) v.step = 2;
    for (const u of [...c.alive('haul'), ...c.alive('escort')]) {
      if (u.owner !== KESSLER) continue;
      const hauler = u.def.harvester;
      if (hauler && v[`dis${u.id}`]) continue;
      if (hauler && u.hp < u.maxHp * 0.34) { v[`dis${u.id}`] = 1; issueOrder(u, { type: 'move', x: u.x, y: u.y }, true); c.ping(Math.floor(u.x / 32), Math.floor(u.y / 32), '#e8c66a'); continue; }
      let wi = v[`wp${u.id}`] ?? 1;
      const wp = pts[wi];
      if (!wp) continue;
      if (tileDist(u, wp.x, wp.y) < 2) {
        wi = v[`wp${u.id}`] = wi + 1;
        if (wi >= pts.length) {
          if (hauler) { v.delivered = (v.delivered ?? 0) + 1; burrowUnit(u); if (v.delivered === 3) c.say('varga', 'Three loads have reached his depot, Lantern. Two more and he has enough.'); }
          // an escort that reaches the depot stays there and guards it
          continue;
        }
      }
      if (reissue && (u.order.type === 'idle' || hauler)) {
        const to = pts[Math.min(wi, pts.length - 1)];
        issueOrder(u, hauler ? { type: 'move', x: (to.x + 0.5) * 32, y: (to.y + 0.5) * 32 } : { type: 'attackMove', x: (to.x + 0.5) * 32, y: (to.y + 0.5) * 32 }, true);
      }
    }
    // a stalled hauler changes hands when someone of yours climbs aboard
    for (const h of c.alive('haul')) {
      if (h.owner !== KESSLER || !v[`dis${h.id}`]) continue;
      if (c.unitsOf(PLAYER).some(u => !u.def.harvester && Math.hypot(u.x - h.x, u.y - h.y) < 1.8 * 32)) {
        h.owner = PLAYER; h.harvestState = 'none'; issueOrder(h, { type: 'idle' });
        v.captured = (v.captured ?? 0) + 1;
        players[PLAYER].credits += 2000;
        c.say('okoye', v.captured === 1 ? 'Hauler\'s ours, load and all. Two thousand flux for the fleet, and a harvester for us.' : 'Another one. Kessler\'s going to start counting.');
      }
    }
    // Kessler answers in kind now and then
    if (c.t >= 150) {
      v.raid = (v.raid ?? 0) - dt;
      if (v.raid <= 0) { v.raid = 110; const k = c.base(KESSLER); c.attackMove(c.spawn(['hovertank', 'vanguard', 'vanguard', 'rocketeer', 'rocketeer'], KESSLER, k.tx + 1, k.ty + 3), hqPos(c).x, hqPos(c).y); }
    }
  },
  onEvent(c, ev) {
    if (ev.type === 'destroyed' && ev.e.kind === 'unit' && ev.e.owner === KESSLER && ev.e.def.harvester) c.run.vars.killed = (c.run.vars.killed ?? 0) + 1;
    harvesterWarning(c, ev);
  },
  objectives: [
    { id: 'stop', text: c => `Haulers stopped: ${(c.run.vars.killed ?? 0) + (c.run.vars.captured ?? 0)} / 8 · delivered ${c.run.vars.delivered ?? 0} / 5 · sent ${c.run.vars.sent ?? 0} / ${HAULS}`,
      check: c => (c.run.vars.killed ?? 0) + (c.run.vars.captured ?? 0) >= 8 },
    { id: 'capture', text: 'Capture a stalled hauler', optional: true, check: c => (c.run.vars.captured ?? 0) >= 1 },
  ],
  triggers: [
    { id: 'firstStall', when: c => Object.keys(c.run.vars).some(k => k.startsWith('dis')), run: c => c.say('okoye', 'That one\'s stalled. Get anyone onto it, a Trooper will do, and it\'s ours.') },
  ],
  win: c => c.done('stop'),
  lose: c => (c.run.vars.delivered ?? 0) >= 5,
  endWin: c => ({ title: 'The road goes quiet', text: `Varga: "Kessler's depot is short, Lantern. Not empty, but short. He'll have to come out from behind the wall to finish his beacon, or not finish it at all."${(c.run.vars.captured ?? 0) ? ' Okoye has the captured haulers repainted by nightfall.' : ''}` }),
  endLose: { title: 'Kessler\'s depot is full', text: 'Five loads reach the north. Behind his wall, Kessler\'s beacon has all the flux it needs.' },
  endEliminated: { title: 'The base falls', text: 'Kessler\'s raiders burn the base while his haulers roll on north, untroubled.' },
};

// ---------------------------------------------------------------------------
// III-11 · Flare Season — an environmental hazard (after StarCraft II's *The
// Devil's Playground*). Helios flares every minute or so and burns anything in
// the open; shelter under the shield domes, in the lee of rock or close to your
// buildings. Lind's rig drives shelter to shelter to the Lantern shaft.
const FLARE_FIRST = 50, FLARE_EVERY = 72, FLARE_WARN = 12, FLARE_LEN = 6, DOME_R = 2.8;
function flarePhase(t: number): { warn: number; burn: number; next: number } {
  if (t < FLARE_FIRST - FLARE_WARN) return { warn: 0, burn: 0, next: FLARE_FIRST - t };
  const p = (t - (FLARE_FIRST - FLARE_WARN)) % FLARE_EVERY;
  if (p < FLARE_WARN) return { warn: p / FLARE_WARN, burn: 0, next: FLARE_WARN - p };
  if (p < FLARE_WARN + FLARE_LEN) return { warn: 1, burn: 1, next: 0 };
  return { warn: 0, burn: 0, next: FLARE_EVERY - p };   // until the next warning
}
// how many flares have burned out by time t
const flaresDone = (t: number) => t < FLARE_FIRST + FLARE_LEN ? 0 : Math.floor((t - FLARE_FIRST - FLARE_LEN) / FLARE_EVERY) + 1;
function domes(c: Ctx): { x: number; y: number }[] {
  const v = c.run.vars, out: { x: number; y: number }[] = [];
  for (let i = 0; v[`dx${i}`] !== undefined; i++) out.push({ x: v[`dx${i}`], y: v[`dy${i}`] });
  return out;
}
function sheltered(c: Ctx, u: Unit): boolean {
  if (domes(c).some(d => tileDist(u, d.x, d.y) < DOME_R)) return true;
  if (c.buildingsOf(PLAYER).some(b => { const p = buildingCenter(b); return Math.hypot(p.x - u.x, p.y - u.y) < (Math.max(b.def.w, b.def.h) / 2 + 1.6) * 32; })) return true;
  const tx = Math.floor(u.x / 32), ty = Math.floor(u.y / 32);   // the lee of rock, with the sun in the north-west
  return [[-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => inBounds(tx + dx, ty + dy) && terrain[idx(tx + dx, ty + dy)] === 1);
}
const flareSeason: MissionDef = {
  id: 'act3-flare', act: 3, code: 'III-11', title: 'Flare Season', tagline: 'Get Lind\'s rig to the Lantern shaft between flares',
  briefing: [
    'Lantern, Varga. Helios has started throwing flares. Every minute or so the open ground burns. Anything caught outside cover cooks.',
    'Lind has to reach the Lantern shaft with his rig. It drives itself from shield dome to shield dome; your job is to clear the road ahead and keep it alive. Shelter under the domes, in the lee of rock, or right by your buildings.',
  ],
  goals: ['Escort Lind\'s drill rig to the Lantern shaft', 'Take cover when the flare warning sounds', 'Keep the rig alive'],
  seed: 71933, enemies: 1, size: 64, credits: 6000,
  allowed: ACT3_TECH,
  onInstall(c) {
    mission.drawGround = (g, t) => {
      for (const d of domes(c)) {
        const x = (d.x + 0.5) * 32, y = (d.y + 0.5) * 32, r = DOME_R * 32;
        const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r);
        grd.addColorStop(0, 'rgba(95,224,240,0.16)'); grd.addColorStop(1, 'rgba(95,224,240,0.04)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a2e38'; g.fillRect(x - 6, y - 6, 12, 12);
        g.fillStyle = `rgba(95,224,240,${0.6 + Math.sin(t * 3) * 0.3})`; g.beginPath(); g.arc(x, y - 2, 3, 0, Math.PI * 2); g.fill();
      }
    };
    mission.drawOver = (g, t) => {
      const ph = flarePhase(c.run.t);
      for (const d of domes(c)) {
        const x = (d.x + 0.5) * 32, y = (d.y + 0.5) * 32, r = DOME_R * 32;
        g.strokeStyle = `rgba(150,240,250,${0.35 + ph.warn * 0.45})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = `rgba(150,240,250,${0.12 + ph.warn * 0.2})`; g.lineWidth = 1;
        for (const k of [0.45, 0.75]) { g.beginPath(); g.ellipse(x, y - r * (1 - k) * 0.2, r * k, r * k * 0.5, 0, Math.PI, 0); g.stroke(); }
      }
      const rig = byId.get(c.run.vars.rig) as Unit | undefined, next = domes(c)[c.run.vars.next ?? 0];
      if (rig && next) {
        g.setLineDash([6, 8]); g.lineDashOffset = -t * 12; g.strokeStyle = 'rgba(232,198,106,0.55)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(rig.x, rig.y); g.lineTo((next.x + 0.5) * 32, (next.y + 0.5) * 32); g.stroke(); g.setLineDash([]);
      }
    };
  },
  setup(c) {
    act2Base(c, ['fab', 'lab']);
    const b = c.base(PLAYER), k = c.base(KESSLER);
    c.spawn(['hovertank', 'hovertank', 'hovertank', 'rocketeer', 'rocketeer', 'rocketeer', 'trooper', 'trooper', 'trooper', 'warden'], PLAYER, b.tx + 1, b.ty + 5);
    const shaft = c.place('lanternshaft', PLAYER, k.tx, k.ty);
    if (shaft) { c.run.vars.shaft = shaft.id; c.run.vars.sx = shaft.tx + 1; c.run.vars.sy = shaft.ty + 1; }
    const route: [number, number][] = [[0.18, 3], [0.34, -4], [0.5, 3], [0.66, -3], [0.82, 2]];
    route.forEach(([t, side], i) => { const p = along(b, k, t, side); c.run.vars[`dx${i}`] = p.x; c.run.vars[`dy${i}`] = p.y; });
    const n = domes(c).length;
    c.run.vars[`dx${n}`] = c.run.vars.sx; c.run.vars[`dy${n}`] = c.run.vars.sy + 2;   // the last "dome" is the shaft head
    const rig = c.spawn(['drillrig'], PLAYER, b.tx + 2, b.ty + 4)[0];
    if (rig) c.run.vars.rig = rig.id;
  },
  intro(c) {
    c.say('lind', 'Rig\'s fuelled. I\'ll drive it dome to dome. Each dome throws a shield up when the warning sounds. Clear the road ahead of me, please. I\'m not built for shooting.');
    c.say('okoye', 'When the siren goes you have twelve seconds. Domes, rock on the sunward side, or hug a building. Anything standing in the open after that burns, theirs and ours.');
    for (const d of domes(c)) c.reveal(d.x, d.y, 3);
  },
  update(c) {
    const dt = realDt(c);
    const v = c.run.vars, ph = flarePhase(c.t), ds = domes(c);
    mission.glare = ph.burn ? 0.85 + Math.sin(c.t * 9) * 0.1 : ph.warn * 0.3;
    // the siren, once per flare
    const flareNo = Math.floor((c.t - (FLARE_FIRST - FLARE_WARN)) / FLARE_EVERY);
    if (ph.warn > 0 && !ph.burn && v.siren !== flareNo) {
      v.siren = flareNo; sfx('siren');
      if (flareNo === 0) c.say('okoye', 'Flare warning! Twelve seconds. Everyone into cover!');
    }
    // the burn: everything in the open cooks, a little every quarter second
    if (ph.burn && dt > 0) {
      for (const u of [...units]) {
        if (u.def.air || sheltered(c, u)) continue;
        damage(u, (u.def.id === 'drillrig' ? 70 : 28) * dt);   // per second in the open: a trooper lasts about four
      }
    }
    // the rig: dome to dome between flares; under a warning it makes for the nearest cover
    const rig = byId.get(v.rig) as Unit | undefined;
    if (!rig) { v.rigLost = 1; return; }
    let next = v.next ?? 0;
    const target = ph.warn > 0
      ? [...ds.slice(Math.max(0, next - 1), next + 1)].sort((a, z) => tileDist(rig, a.x, a.y) - tileDist(rig, z.x, z.y))[0]
      : ds[next];
    if (!target) return;
    if (next === ds.length - 1 && tileDist(rig, ds[next].x, ds[next].y) < 1.6) { v.arrived = 1; return; }
    // under a dome it waits out the next flare, then makes its dash: that's the window to clear the road ahead
    if (v.waiting) {
      if (flaresDone(c.t) <= v.waitFrom || ph.warn) return;
      v.waiting = 0;
      if (next < ds.length - 1) c.say('lind', next === 1 ? 'All clear. Moving out!' : 'Clear. Next dome.');
    }
    if (!ph.warn && tileDist(rig, target.x, target.y) < 1.4) {
      next = v.next = next + 1;
      if (next >= ds.length) { v.arrived = 1; return; }
      v.waiting = 1; v.waitFrom = flaresDone(c.t);
      issueOrder(rig, { type: 'move', x: rig.x, y: rig.y }, true);
      const said = DOME_TALK[next];
      if (said) for (const [who, text] of said(c)) c.say(who, text);
      if (next === 2 || next === 4) {   // Kessler has a roadblock on the next leg: it waits there for the rig
        const d = ds[Math.min(ds.length - 1, next)];
        c.spawn(next === 2 ? ['hovertank', 'vanguard', 'vanguard', 'rocketeer', 'rocketeer'] : ['dominator', 'hovertank', 'hovertank', 'rocketeer', 'rocketeer', 'artillery'], KESSLER, d.x + 3, d.y - 2, 'ambush');
        c.ping(d.x + 3, d.y - 2, '#e58a3a'); c.reveal(d.x + 3, d.y - 2, 4);
        c.say('okoye', 'Kessler roadblock at the next dome, marked. Clear it while Lind waits out the flare.');
      }
      if (next === 3 && c.flag('meridian') === 'sold') {
        const d = ds[3];
        c.ambush(d.x - 2, d.y + 2, ['shardkin', 'shardkin', 'shardkin', 'burrower', 'choir'], 'hollow', rig.id);
        c.say('seren', 'Root-taker. You sold her walls. We remember.');
      }
    }
    // re-route only when it has stopped or the destination changed: re-issuing a live route
    // every second resets it, and the rig ends up rocking in place behind anyone in its way
    const tx = (target.x + 0.5) * 32, ty = (target.y + 0.5) * 32, o = rig.order;
    v.drive = (v.drive ?? 0) - dt;
    if (o.type === 'idle' || (o.type === 'move' && Math.hypot((o.x ?? 0) - tx, (o.y ?? 0) - ty) > 4) || (v.drive <= 0 && !rig.path)) {
      v.drive = 1.5; issueOrder(rig, { type: 'move', x: tx, y: ty }, true);
    }
  },
  objectives: [
    { id: 'rig', text: c => `Escort the rig to the Lantern shaft: shelter ${Math.min(c.run.vars.next ?? 0, domes(c).length - 1)} / ${domes(c).length - 1}`, check: c => !!c.run.vars.arrived },
    { id: 'flare', text: c => { const ph = flarePhase(c.t); return ph.burn ? 'FLARE: stay in cover' : ph.warn ? `Flare in ${Math.ceil(ph.next)} s: take cover!` : `Next flare in ${fmt(ph.next)}`; }, check: () => false },
  ],
  triggers: [],
  onEvent: harvesterWarning,
  win: c => !!c.run.vars.arrived,
  lose: c => !!c.run.vars.rigLost,
  endWin: { title: 'The shaft head', text: 'Lind climbs down from the rig and looks into the Lantern shaft for a long time. "Six years," he says to nobody. "Right. Let\'s finish it." Behind the ridge, Kessler\'s wall is lit up like a city.' },
  endLose: { title: 'The rig burns', text: 'Lind\'s rig dies in the open between two flares. Project Lantern keeps drawing on the Vey\'s heart, and the sun keeps dying.' },
  endEliminated: { title: 'The base falls', text: 'With nothing left to come home to, Lind\'s rig stops on the open flats and waits for the next flare.' },
};
// what Lind and Okoye say on the road, as the rig reaches each shelter
const DOME_TALK: Record<number, (c: Ctx) => [Speaker, string][]> = {
  1: () => [['lind', 'First dome. Mara, do you remember the night Depot Six burned? I watched it from the tether station. I knew what was in the archive. I didn\'t say anything.'],
            ['okoye', 'I remember. I was the one they sent to put it out.']],
  2: () => [['lind', 'I named it Lantern because it was supposed to light the way home. That was the pitch. Flux enough for every ship we\'d ever build.'],
            ['okoye', 'And the commander\'s callsign?'], ['lind', 'Someone on the board thought it was funny. I didn\'t. I still don\'t.']],
  3: () => [['okoye', 'Teo. When we get there, you don\'t have to be the one who goes down.'],
            ['lind', 'I do, though. Nobody else knows where the off switch is. I made sure of that, six years ago, because I was proud of it.']],
  4: () => [['lind', 'Last stretch. Lantern, if I don\'t get a chance later: thank you for getting me this far. It\'s more than I earned.'],
            ['okoye', 'Shut up and drive, Doc.']],
};

export const MISSIONS: MissionDef[] = [bootCamp, coldDrop, fluxLines, nightShift, ironWeather, sparks, greenTide, deadDrop, resonanceM, meridian, haulRoad, flareSeason, kesslersWall, zeroDay];
