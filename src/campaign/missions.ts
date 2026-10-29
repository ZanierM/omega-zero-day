// Act I — Landfall. Each mission is data (map, tech, objectives) plus small
// script hooks the runner calls. Story: docs/campaign-plan.md.

import type { Ctx } from './runner';
import type { GameEvent } from '../game';
import { PLAYER } from '../config';
import { ventsHeld, neutrals, buildingCenter, issueOrder, units, burrowUnit } from '../game';

export interface Objective {
  id: string;
  text: string | ((c: Ctx) => string);
  check: (c: Ctx) => boolean;
  hidden?: boolean;     // stays off the tracker until a trigger shows it
  optional?: boolean;
}
export interface Trigger { id: string; when: (c: Ctx) => boolean; run: (c: Ctx) => void }
export interface MissionDef {
  id: string; code: string; title: string; tagline: string;
  briefing: string[]; goals: string[];
  seed: number; enemies: number; crystalMul?: number; credits: number;
  allowed: string[];
  aiOwners?: number[];                     // factions left to the skirmish AI (default: none, all scripted)
  setup(c: Ctx): void;
  intro(c: Ctx): void;
  update?(c: Ctx, dt: number): void;
  onEvent?(c: Ctx, ev: GameEvent): void;
  objectives: Objective[];
  triggers: Trigger[];
  win(c: Ctx): boolean;
  lose?(c: Ctx): boolean;
  endWin: { title: string; text: string };
  endLose: { title: string; text: string };
}

const KESSLER = 1, VERDANT = 2, HOLLOW = 4;
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
// I-1 · Cold Drop
const coldDrop: MissionDef = {
  id: 'act1-1', code: 'I-1', title: 'Cold Drop', tagline: 'Restart flux production at Depot Six',
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
    c.say('okoye', 'Sergeant Okoye, your ground lead. Power first: a Solar Array. Nothing else in this yard wakes up without it.');
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
      c.say('okoye', 'Movement on the ridge. Kessler colours. Three weeks ago they were guarding this depot.');
    } },
    { id: 'patrol1done', when: c => c.run.fired.includes('patrol1') && c.alive('p1').length === 0, run: c => c.say('okoye', 'Patrol\'s down. Nobody\'s calling them back, which means more are coming.') },
    { id: 'patrol2', when: c => c.t >= 270, run: c => {
      const k = c.base(KESSLER), p = hqPos(c);
      c.attackMove(c.spawn(['trooper', 'trooper', 'trooper', 'rocketeer'], KESSLER, k.tx + 2, k.ty + 5, 'p2'), p.x, p.y);
      c.say('okoye', 'Second patrol. Bigger. They know exactly where we are.');
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
  id: 'act1-2', code: 'I-2', title: 'Flux Lines', tagline: 'Take the vents from the Verdant Pact',
  briefing: [
    'Lantern, Varga. Your crystal yields are good, but not good enough. Dr. Lind says the real flux comes up through the vents, straight from the deep crust.',
    'The Verdant Pact sits on two of them. They\'re terraformers, and they didn\'t use to carry rifles. Take the vents and a watchtower, and hold them long enough for Lind\'s survey.',
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
    const v = c.base(VERDANT);
    c.place('barracks', VERDANT, v.tx, v.ty);
    c.place('solar', VERDANT, v.tx + 3, v.ty);
    c.place('turret', VERDANT, v.tx + 1, v.ty + 3);
    // Verdant pickets stand on the two vents nearest their camp (they capture them in seconds)
    const vents = c.vents().sort((a, z) => Math.hypot(a.tx - v.tx, a.ty - v.ty) - Math.hypot(z.tx - v.tx, z.ty - v.ty));
    for (const vent of vents.slice(0, 2)) {
      c.spawn(['pyro', 'pyro', 'trooper', 'trooper', 'vanguard'], VERDANT, vent.tx, vent.ty, 'pickets');
      c.place('turret', VERDANT, vent.tx + 2, vent.ty + 2);
    }
  },
  intro(c) {
    c.say('lind', 'Teodor Lind, flux engineering. Forget the crystal fields for a moment, Commander. The vents are where flux comes up from the deep crust. Hold one and you skim it at the source.');
    c.say('okoye', 'The Verdant Pact has pickets on two of them. Stand your troops on a vent and keep enemies off it to take it.');
  },
  update(c, dt) {
    if (!c.run.shown.includes('hold')) return;
    c.run.vars.hold = ventsHeld(PLAYER) >= 2 && towersHeld(PLAYER) >= 1 ? (c.run.vars.hold ?? 0) + dt : 0;
    // the Pact keeps throwing squads at the vents while the survey runs
    c.run.vars.raid = (c.run.vars.raid ?? 35) - dt;
    if (c.run.vars.raid <= 0) {
      c.run.vars.raid = 45;
      const v = c.base(VERDANT);
      const held = neutrals.filter(n => n.kind === 'vent' && n.owner === PLAYER);
      const n = held[Math.floor(Math.random() * held.length)];
      if (n) c.attackMove(c.spawn(['pyro', 'pyro', 'trooper', 'trooper', 'vanguard'], VERDANT, v.tx + 1, v.ty + 4), (n.tx + 0.5) * 32, (n.ty + 0.5) * 32);
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
      const v = c.base(VERDANT), target = c.vents().find(n => neutrals.some(x => x.tx === n.tx && x.ty === n.ty && x.owner === PLAYER)) ?? c.vents()[0];
      c.attackMove(c.spawn(['pyro', 'pyro', 'trooper', 'trooper'], VERDANT, v.tx + 1, v.ty + 4, 'v1'), (target.tx + 0.5) * 32, (target.ty + 0.5) * 32);
      c.say('okoye', 'Verdant squad moving on the vents. Pyros, so keep your infantry spread out.');
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
      const v = c.base(VERDANT), p = c.vents()[1] ?? c.vents()[0];
      c.attackMove(c.spawn(['pyro', 'trooper', 'trooper', 'vanguard', 'trooper'], VERDANT, v.tx + 1, v.ty + 4, 'v2'), (p.tx + 0.5) * 32, (p.ty + 0.5) * 32);
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
  id: 'act1-3', code: 'I-3', title: 'Iron Weather', tagline: 'Break the Kessler assault',
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
      if (i === 0) c.say('okoye', 'That\'s Kessler himself on an open channel. Ignore him. Watch the ridge.');
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

export const MISSIONS: MissionDef[] = [coldDrop, fluxLines, ironWeather];
