// The Kessler Collective: the colony's old security corps, broken away under its
// marshal. Where Helion hovers and gleams, Kessler is heavy: tracks and wheels,
// slab armour in olive and gunmetal, sandbags and poured concrete, searchlights
// and war banners. Units share Helion's unit types, so these are registered as
// 'k:<id>' and the renderer picks them for Kessler (render.ts vArt/bArt/tArt);
// anything not drawn here falls back to Helion's art with Kessler's paint-over.

import {
  OUT, shade, edgeOf, poly, chamfer, prism, cylinder, dome, glow, spill, quad, flag, lamp, rot, at, box, deckPlate, wheel, barrels, detailWalls,
  soldierArt, VEHICLE_ART, BUILDING_ART, TURRET_ART,
} from './art';
import type { Pt, Ctx, SoldierSpec, Limb } from './art';

const OLIVE = '#566034', OLIVE_TOP = '#737f48', OLIVE_DK = '#383f22';
const GUN = '#4a4c52', GUN_TOP = '#6a6d74', GUN_DK = '#2c2e33';
const CONC = '#5e5a52', CONC_TOP = '#7a766c', CONC_DK = '#413e38';
const SAND = '#9a8a62', SAND_TOP = '#b8a87c';
const RUST = '#8a4f30';

// ---------------- helpers ----------------

// a track run: a long low box, road wheels showing along the side, links across the top
function track(g: Ctx, a: number, x0: number, x1: number, y: number, w: number, h: number, phase = 0) {
  box(g, a, x0, y - w / 2, x1, y + w / 2, 0, h, '#3a3c40', '#24262a');
  const step = 1.8, off = (phase * step * 2) % step;
  for (let x = x0 + off; x < x1; x += step) deckPlate(g, a, h, x, y - w / 2, x + 0.7, y + w / 2, 'rgba(0,0,0,0.45)');
  for (let x = x0 + 1.6; x < x1 - 1; x += 3.2) {
    const [cx, cy] = at(x, y + (Math.sin(a) > 0 ? w / 2 : -w / 2), a);
    g.fillStyle = '#56585e'; g.beginPath(); g.ellipse(cx, cy - h * 0.45, 1.2, 1.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(cx, cy - h * 0.45, 0.45, 0, Math.PI * 2); g.fill();
  }
}
// a slab of armour bolted on: a plate with rivets at its corners
function slab(g: Ctx, a: number, z: number, x0: number, y0: number, x1: number, y1: number, fill = OLIVE_TOP) {
  deckPlate(g, a, z, x0, y0, x1, y1, fill, true);
  for (const [x, y] of [[x0 + 0.6, y0 + 0.6], [x1 - 0.6, y0 + 0.6], [x0 + 0.6, y1 - 0.6], [x1 - 0.6, y1 - 0.6]] as Pt[]) {
    const [px, py] = at(x, y, a); g.fillStyle = 'rgba(20,20,16,0.7)'; g.fillRect(px - 0.35, py - z - 0.35, 0.7, 0.7);
  }
}
// a searchlight: a drum on a post, its beam a soft cone of light
function searchlight(g: Ctx, x: number, y: number, z: number, dir = 0.6) {
  cylinder(g, x, y, 1, 0, z, GUN_TOP, GUN);
  cylinder(g, x, y, 2, z, z + 2.4, '#c8c4b0', GUN_DK);
  g.save(); g.globalCompositeOperation = 'lighter';
  const ex = x + Math.cos(dir) * 26, ey = y - z + Math.sin(dir) * 14;
  const lg = g.createLinearGradient(x, y - z - 1, ex, ey);
  lg.addColorStop(0, 'rgba(255,245,210,0.45)'); lg.addColorStop(1, 'rgba(255,245,210,0)');
  g.fillStyle = lg; g.beginPath(); g.moveTo(x, y - z - 1.2); g.lineTo(ex - 6, ey - 4); g.lineTo(ex + 6, ey + 4); g.closePath(); g.fill();
  g.restore();
}
// a long war banner on a pole, the Collective's colour with a black stripe
function warBanner(g: Ctx, x: number, y: number, h: number, team: string) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - h, 2, h);
  g.fillStyle = '#b8bcc8'; g.fillRect(x - 0.4, y - h, 0.8, h);
  poly(g, [[x + 1, y - h + 1], [x + 9, y - h + 1], [x + 9, y - h + 15], [x + 5, y - h + 12], [x + 1, y - h + 15]], team);
  g.fillStyle = 'rgba(20,16,12,0.75)'; g.fillRect(x + 4, y - h + 1, 1.6, 12);
}
function sandbagRow(g: Ctx, x0: number, y: number, n: number, rows: number) {
  for (let row = 0; row < rows; row++) for (let i = 0; i < n - row; i++) {
    const x = x0 + i * 3.4 + row * 1.7, yy = y - row * 2.2;
    g.fillStyle = edgeOf(SAND); g.beginPath(); g.ellipse(x, yy, 1.9, 1.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = row ? SAND_TOP : SAND; g.beginPath(); g.ellipse(x, yy - 0.3, 1.6, 1, 0, 0, Math.PI * 2); g.fill();
  }
}
// stencilled unit numbers and a hazard chevron on a wall
function stencil(g: Ctx, x: number, y: number, text: string) { g.fillStyle = 'rgba(230,226,210,0.6)'; g.font = '700 3.6px system-ui, sans-serif'; g.fillText(text, x, y); }

// ---------------- infantry ----------------
// greatcoats to the knee, brimmed steel helmets, gas masks with red lenses

const K_LEGS: [string, string, string, string] = ['#4a4c3c', '#36382c', '#2a2a24', '#1c1c18'];
const coat = (bob: number, len = 4.6): Limb => ({ x0: -2.6, y0: -3.2, x1: 2.2, y1: 3.2, z0: 6.8 + bob - len, z1: 6.8 + bob + 1, top: '#6a6e54', side: '#4e5240' });
const heavyRifle = (len: number, bob: number, y = 2.5): Limb[] => [
  { x0: 0.5, y0: y - 0.75, x1: 3.2, y1: y + 0.75, z0: 6.8 + bob + 3.4, z1: 6.8 + bob + 5, top: OLIVE_TOP, side: OLIVE },
  { x0: -1, y0: y - 0.7, x1: len, y1: y + 0.7, z0: 6.8 + bob + 4, z1: 6.8 + bob + 5.6, top: GUN_TOP, side: GUN_DK },
  { x0: 2.4, y0: y - 0.5, x1: 3.6, y1: y + 0.5, z0: 6.8 + bob + 2.4, z1: 6.8 + bob + 4, top: GUN_TOP, side: GUN_DK },   // the magazine
];
// the helmet's brim and the gas mask's lenses, drawn flat over the head
function helmetMask(g: Ctx, a: number, bob: number) {
  const [hx, hy] = at(0.2, 0, a), z = 6.8 + bob + 9.2;
  g.fillStyle = '#3e4232'; g.beginPath(); g.ellipse(hx, hy - z, 3.8, 1.7, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.5; g.stroke();
  for (const sd of [-0.85, 0.85]) {
    const [lx, ly] = at(2.4, sd, a);
    g.fillStyle = '#1c1c18'; g.beginPath(); g.arc(lx, ly - z + 1.6, 0.85, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,80,60,0.9)'; g.beginPath(); g.arc(lx, ly - z + 1.6, 0.5, 0, Math.PI * 2); g.fill();
  }
  const [fx, fy] = at(2.9, 0, a);
  g.fillStyle = '#2a2a24'; g.beginPath(); g.arc(fx, fy - z + 3, 0.9, 0, Math.PI * 2); g.fill();   // the filter
}

const K_TROOPER: SoldierSpec = {
  armour: '#5e6248', armourTop: '#80856a', build: 1.05, helmet: '#5a5e48', visor: null, legs: K_LEGS,
  extra: bob => [coat(bob), { x0: -4.2, y0: -2.4, x1: -2.4, y1: 2.4, z0: 6.8 + bob + 1, z1: 6.8 + bob + 6, top: '#6a6250', side: '#4a4436' }, ...heavyRifle(9.5, bob)],
  glow: (g, a, bob) => helmetMask(g, a, bob),
};
const K_ROCKETEER: SoldierSpec = {
  armour: '#5e6248', armourTop: '#80856a', build: 1.05, helmet: '#5a5e48', visor: null, legs: K_LEGS,
  extra: bob => [coat(bob), { x0: -4.4, y0: -2.6, x1: -2.2, y1: 2.6, z0: 6.8 + bob + 1, z1: 6.8 + bob + 6.6, top: '#6a6250', side: '#4a4436' },
    { x0: -4, y0: 2, x1: 7.5, y1: 4.6, z0: 6.8 + bob + 6, z1: 6.8 + bob + 8.8, top: OLIVE_TOP, side: OLIVE_DK },     // a fat tube launcher
    { x0: 7.5, y0: 2.4, x1: 8.6, y1: 4.2, z0: 6.8 + bob + 6.2, z1: 6.8 + bob + 8.6, top: GUN_TOP, side: GUN_DK }],
  glow: (g, a, bob) => { helmetMask(g, a, bob); const [x, y] = at(8.4, 3.3, a); g.fillStyle = '#ff7a3a'; g.fillRect(x - 0.8, y - 6.8 - bob - 8.2, 1.6, 1.6); },
};
const K_VANGUARD: SoldierSpec = {
  armour: '#55594a', armourTop: '#7a7e6a', build: 1.28, helmet: '#4e5242', visor: null, legs: K_LEGS,
  extra: bob => [coat(bob, 3.6),
    { x0: -4.6, y0: -3, x1: -2.6, y1: 3, z0: 6.8 + bob + 1, z1: 6.8 + bob + 7.4, top: GUN_TOP, side: GUN },         // breathing pack
    ...heavyRifle(8, bob, 3),
    { x0: 2.8, y0: -5.4, x1: 4, y1: -0.4, z0: 1.6 + bob, z1: 6.8 + bob + 7, top: '#80856a', side: '#55594a' }],      // a riot slab of a shield
  glow: (g, a, bob) => { helmetMask(g, a, bob); const [x, y] = at(4.1, -3, a); g.fillStyle = 'rgba(255,200,120,0.85)'; g.fillRect(x - 0.6, y - 6.8 - bob - 4, 1.2, 3); },
};
const K_SNIPER: SoldierSpec = {
  armour: '#4e5444', armourTop: '#6e7460', build: 0.98, helmet: '#4a5040', visor: null, legs: K_LEGS,
  extra: bob => [{ x0: -3.8, y0: -3.8, x1: 1, y1: 3.8, z0: 6.8 + bob - 4, z1: 6.8 + bob + 6.6, top: '#5a6448', side: '#3e4632' },   // ghillie cape
    ...heavyRifle(13.5, bob),
    { x0: 3, y0: 1.9, x1: 6.4, y1: 3.1, z0: 6.8 + bob + 5.5, z1: 6.8 + bob + 6.8, top: '#2a2a24', side: '#1a1a16' }],
  glow: (g, a, bob) => { helmetMask(g, a, bob); const [x, y] = at(6.5, 2.5, a); g.fillStyle = 'rgba(255,80,60,0.9)'; g.fillRect(x - 0.4, y - 6.8 - bob - 6.2, 0.8, 0.8); },
};
const K_PYRO: SoldierSpec = {
  armour: '#6a5e48', armourTop: '#8e8066', build: 1.1, helmet: '#5a4e3c', visor: null, legs: K_LEGS,
  extra: bob => [coat(bob, 4),
    { x0: -4.8, y0: -2.8, x1: -2.4, y1: -0.2, z0: 6.8 + bob, z1: 6.8 + bob + 7.6, top: '#9a3a22', side: '#6a2614' },   // twin fuel tanks
    { x0: -4.8, y0: 0.2, x1: -2.4, y1: 2.8, z0: 6.8 + bob, z1: 6.8 + bob + 7.6, top: '#9a3a22', side: '#6a2614' },
    ...heavyRifle(7.5, bob)],
  glow: (g, a, bob) => { helmetMask(g, a, bob); const [x, y] = at(7.8, 2.5, a); g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y - 6.8 - bob - 4.8, 3, 'rgba(255,150,60,0.8)'); g.restore(); },
};
const K_JUGGERNAUT: SoldierSpec = {
  armour: '#4e5246', armourTop: '#72766a', build: 1.55, helmet: '#4a4e42', visor: null, legs: K_LEGS,
  extra: bob => [
    { x0: -5.4, y0: -3.6, x1: -3.4, y1: 3.6, z0: 6.8 + bob + 1, z1: 6.8 + bob + 8.6, top: GUN_TOP, side: GUN_DK },     // armoured back
    { x0: 0, y0: 3.6, x1: 4.2, y1: 6.4, z0: 6.8 + bob + 2.4, z1: 6.8 + bob + 6.2, top: OLIVE_TOP, side: OLIVE_DK },     // the gun housing
    { x0: 4, y0: 4.2, x1: 10, y1: 5.8, z0: 6.8 + bob + 3.2, z1: 6.8 + bob + 5.4, top: GUN_TOP, side: GUN_DK },
    { x0: -1, y0: 3.4, x1: -0.2, y1: 6.6, z0: 6.8 + bob, z1: 6.8 + bob + 4, top: '#b8a050', side: '#8a7638' }],          // an ammo belt
  glow: (g, a, bob) => helmetMask(g, a, bob + 1.5),
};

// ---------------- vehicles ----------------

// the Bulwark: a slab-sided tracked tank (Kessler's hover tank)
function drawBulwarkHull(g: Ctx, a: number, team: string) {
  for (const y of [-7.4, 7.4]) track(g, a, -13, 13, y, 4, 5.4);
  const hull: Pt[] = [[-12, -5.6], [9, -5.6], [13.5, -2.6], [13.5, 2.6], [9, 5.6], [-12, 5.6]];
  prism(g, rot(hull, a), 4, 9.6, OLIVE_TOP, OLIVE);
  // the sloped glacis plate at the front, side skirts, and slabs bolted over the engine deck
  box(g, a, 9, -5.4, 13.5, 5.4, 4, 7.6, OLIVE_TOP, OLIVE_DK);
  for (const y of [-9.8, 9.8]) box(g, a, -11, y - 0.6, 10, y + 0.6, 2.4, 6, OLIVE, OLIVE_DK);
  slab(g, a, 9.6, -11, -4.6, -5, 4.6, GUN_TOP);
  for (const x of [-10, -8, -6]) deckPlate(g, a, 9.7, x, -4, x + 0.8, 4, 'rgba(0,0,0,0.4)');   // engine grille
  for (const y of [-5.7, 5.7]) deckPlate(g, a, 7.4, -10, y - 0.5, 8, y + 0.5, team);
  const [sx, sy] = at(-11, -4.4, a); stencil(g, sx - 3, sy - 5, 'K-07');
  const [ex, ey] = at(-12.6, 3, a); cylinder(g, ex, ey, 0.9, 7, 11, GUN_DK, GUN);   // exhaust
}
function drawBulwarkTurret(g: Ctx, a: number, team: string) {
  const away = Math.sin(a) < 0;
  const gun = () => { barrels(g, a, [0], 6, 21, 12.6, 14.2, 1.6); box(g, a, 20, -1.2, 22, 1.2, 12.2, 14.6, GUN, GUN_DK); box(g, a, 5, -2.4, 8, 2.4, 11.4, 15, GUN_TOP, GUN); };
  if (away) gun();
  prism(g, rot([[-7, -5], [3, -5.4], [6, -3.4], [6, 3.4], [3, 5.4], [-7, 5]], a), 9.6, 15, OLIVE_TOP, OLIVE);
  slab(g, a, 15, -6, -4, -1, 4);
  const [cx, cy] = at(-3, 2.6, a); cylinder(g, cx, cy, 1.6, 15, 16.6, GUN_TOP, GUN);   // commander's hatch
  deckPlate(g, a, 15, 1, -4.6, 4, -2.6, team);
  const [mx, my] = at(-1, -3.2, a); cylinder(g, mx, my, 0.5, 15, 18, GUN_DK, GUN);   // the aerial
  if (!away) gun();
}

// a six-wheeled armoured car (Kessler's scout ranger)
function drawArmouredCarHull(g: Ctx, a: number, team: string) {
  for (const x of [-7, 0, 7]) for (const y of [-6.2, 6.2]) wheel(g, a, x, y, 2.8, 2.4);
  const hull: Pt[] = [[-10, -4.8], [7, -4.8], [11, -2.2], [11, 2.2], [7, 4.8], [-10, 4.8]];
  prism(g, rot(hull, a), 2.6, 8.4, OLIVE_TOP, OLIVE);
  slab(g, a, 8.4, 3, -3.6, 9, 3.6, GUN_TOP);
  deckPlate(g, a, 8.5, 7.4, -2.6, 9.6, 2.6, '#1c2228', true);                         // vision slits
  for (const y of [-4.9, 4.9]) deckPlate(g, a, 6.4, -9, y - 0.4, 6, y + 0.4, team);
  const [jx, jy] = at(-9.4, -3.6, a); box(g, 0, jx - 1, jy - 1.4, jx + 1, jy + 1.4, 8.4, 11, '#4a5236', '#30361f');   // a jerrycan rack
}
function drawArmouredCarTurret(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 2.8, 8.4, 11.6, OLIVE_TOP, OLIVE);
  barrels(g, a, [0], 2, 11, 10.2, 11.4, 1.1);
  deckPlate(g, a, 11.6, -2.2, -1.4, -0.6, 1.4, team);
}

// the tracked self-propelled gun (Kessler's Thumper)
function drawSPGHull(g: Ctx, a: number, team: string, phase = 0) {
  for (const y of [-7, 7]) track(g, a, -12, 11, y, 3.6, 5, phase);
  prism(g, rot([[-11, -5.2], [8, -5.2], [11, -2.4], [11, 2.4], [8, 5.2], [-11, 5.2]], a), 4, 8.6, OLIVE_TOP, OLIVE);
  box(g, a, -11, -5, -6, 5, 8.6, 10.6, OLIVE_TOP, OLIVE_DK);                           // the ammunition box at the back
  for (const y of [-5.3, 5.3]) deckPlate(g, a, 7, -9, y - 0.4, 7, y + 0.4, team);
  // spades folded up at the rear
  for (const y of [-3, 3]) box(g, a, -13.6, y - 1.4, -11.4, y + 1.4, 1, 6, GUN_TOP, GUN_DK);
}
function drawSPGTurret(g: Ctx, a: number, team: string) {
  const away = Math.sin(a) < 0;
  const gun = () => { barrels(g, a, [0], 4, 22, 13, 15.2, 2.2); box(g, a, 21, -1.6, 23.4, 1.6, 12.6, 15.6, GUN, GUN_DK); };   // a long howitzer with a muzzle brake
  if (away) gun();
  prism(g, rot([[-8, -5], [4, -5], [6, -2], [6, 2], [4, 5], [-8, 5]], a), 8.6, 14.4, OLIVE_TOP, OLIVE);
  slab(g, a, 14.4, -7, -4, -2, 4);
  deckPlate(g, a, 14.4, 1, -4.4, 4, -2.4, team);
  if (!away) gun();
}

// the Dominator: twin cannons on a long heavy tracked chassis
function drawHeavyHull(g: Ctx, a: number, team: string, phase = 0) {
  for (const y of [-9, 9]) track(g, a, -15, 15, y, 5, 6.6, phase);
  prism(g, rot([[-14, -7], [11, -7], [16, -3.2], [16, 3.2], [11, 7], [-14, 7]], a), 5, 12, GUN_TOP, GUN);
  box(g, a, 11, -6.6, 16, 6.6, 5, 9.6, GUN_TOP, GUN_DK);
  for (const [x0, x1] of [[-13, -6], [-4, 3]]) slab(g, a, 12, x0, -6, x1, 6, OLIVE_TOP);
  for (const y of [-12, 12]) box(g, a, -13, y - 0.7, 12, y + 0.7, 3, 8, OLIVE, OLIVE_DK);
  for (const y of [-7.1, 7.1]) deckPlate(g, a, 9, -12, y - 0.6, 10, y + 0.6, team);
  for (const y of [-3, 3]) { const [ex, ey] = at(-14.6, y, a); cylinder(g, ex, ey, 1.1, 10, 15, GUN_DK, GUN); }
}
function drawHeavyTurret(g: Ctx, a: number, team: string) {
  const away = Math.sin(a) < 0;
  const guns = () => { barrels(g, a, [-2.6, 2.6], 7, 23, 15.4, 17.6, 2); for (const y of [-2.6, 2.6]) box(g, a, 22, y - 1.4, 24.4, y + 1.4, 15, 18, GUN, GUN_DK); };
  if (away) guns();
  prism(g, rot([[-9, -7], [5, -7.4], [9, -4], [9, 4], [5, 7.4], [-9, 7]], a), 12, 19, OLIVE_TOP, OLIVE);
  slab(g, a, 19, -8, -5.6, -1, 5.6);
  deckPlate(g, a, 19, 2, -6, 6, -3.6, team);
  const [cx, cy] = at(-4, 4.2, a); cylinder(g, cx, cy, 2, 19, 21, GUN_TOP, GUN);
  if (!away) guns();
}

// a tracked miner with a toothed drum on the front (Kessler's harvester)
function drawMinerHull(g: Ctx, a: number, team: string) {
  for (const y of [-7, 7]) track(g, a, -12, 10, y, 3.8, 5.2);
  prism(g, rot([[-12, -5], [8, -5], [10, -3], [10, 3], [8, 5], [-12, 5]], a), 4, 9, OLIVE_TOP, OLIVE);
  // the cutting drum, teeth glinting with crystal dust
  const [dx, dy] = at(12.5, 0, a);
  box(g, a, 10.4, -6.6, 14.6, 6.6, 1.6, 6.2, GUN_TOP, GUN_DK);
  for (const y of [-5, -2.5, 0, 2.5, 5]) { const [tx, ty] = at(14.8, y, a); g.fillStyle = '#c8ccd6'; g.fillRect(tx - 0.6, ty - 5, 1.2, 1.2); }
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, dx, dy - 3.6, 5, 'rgba(67,243,236,0.35)'); g.restore();
  // the hopper heaped with crystal
  box(g, a, -10, -4.4, 5, 4.4, 9, 12.6, null, RUST);
  deckPlate(g, a, 12.6, -10, -4.4, 5, 4.4, '#141818', true);
  for (const [x, y, r] of [[-7, -2, 2], [-3, 1.8, 2.4], [1, -1.6, 1.8], [-5, 2.6, 1.6]] as [number, number, number][]) {
    const [cx, cy] = at(x, y, a); poly(g, [[cx, cy - 12.6 - r * 1.6], [cx + r, cy - 12.6], [cx, cy - 12.6 + r * 0.6], [cx - r, cy - 12.6]], '#43f3ec');
  }
  for (const y of [-5.1, 5.1]) deckPlate(g, a, 7.4, -11, y - 0.5, 7, y + 0.5, team);
  const [cx, cy] = at(6.4, -2.6, a); box(g, 0, cx - 2, cy - 1.6, cx + 2, cy + 1.6, 9, 13, OLIVE_TOP, OLIVE_DK);   // the cab
  deckPlate(g, 0, 13, cx - 1.6, cy - 1.2, cx + 1.6, cy + 0.2, '#1c2228');
}

// ---------------- structures ----------------

// the command bunker (Kessler's Nexus): poured concrete under sloped armour, searchlights, a radio mast, the war banner
function drawBunkerHQ(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  prism(g, chamfer(4, 10, 92, 92, 10), 0, 3, CONC_TOP, CONC_DK);
  detailWalls(g, chamfer(4, 10, 92, 92, 10), 0, 3);
  // the bunker: low thick walls with a sloped armour band, firing slits
  const body = chamfer(14, 22, 82, 74, 8);
  prism(g, body, 3, 22, null, CONC);
  detailWalls(g, body, 3, 22, 8);
  quad(g, [16, 74 - 22], [80, 74 - 22], [86, 80 - 12], [10, 80 - 12], OLIVE);                 // sloped armour skirt
  for (const x of [22, 40, 56, 70]) quad(g, [x, 74 - 18], [x + 6, 74 - 18], [x + 6, 74 - 16], [x, 74 - 16], '#14140f');   // firing slits
  prism(g, body, 22, 25, CONC_TOP, CONC);
  // a raised command block with the war room's window, and the blast door
  prism(g, chamfer(32, 30, 66, 58, 4), 25, 34, OLIVE_TOP, OLIVE);
  quad(g, [36, 58 - 31], [62, 58 - 31], [62, 58 - 28], [36, 58 - 28], '#1c2228');
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 49, 58 - 29.5, 10, 'rgba(255,200,120,0.35)'); g.restore();
  quad(g, [40, 80 - 12], [56, 80 - 12], [56, 80 - 3], [40, 80 - 3], GUN_DK);
  for (let x = 41; x < 56; x += 3) quad(g, [x, 80 - 11], [x + 1.4, 80 - 11], [x + 1.4, 80 - 4], [x, 80 - 4], 'rgba(0,0,0,0.35)', false);
  quad(g, [38, 80 - 14], [58, 80 - 14], [58, 80 - 12], [38, 80 - 12], team, false);
  stencil(g, 22, 80 - 8, 'KC-1');
  sandbagRow(g, 12, 88, 6, 2); sandbagRow(g, 64, 88, 6, 2);
  // the radio mast, searchlights at the corners, the banner
  g.fillStyle = OUT; g.fillRect(70, 30 - 46, 1.6, 40); g.fillStyle = '#b8bcc8'; g.fillRect(70.4, 30 - 46, 0.6, 40);
  for (const y of [-12, -4, 4]) { g.strokeStyle = '#b8bcc8'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(66, 30 + y); g.lineTo(75, 30 + y); g.stroke(); }
  lamp(g, 70.8, 30 - 46, 'rgba(255,80,60,0.9)');
  searchlight(g, 18, 26, 24, 2.4); searchlight(g, 80, 26, 24, 0.6);
  warBanner(g, 28, 30, level >= 3 ? 54 : 44, team);
  if (level >= 2) warBanner(g, 60, 30, 40, team);
  g.restore();
}

// the barracks: a sandbagged concrete bunker with a drill yard
function drawKBarracks(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 6, 61, 61, 6), 0, 3, CONC_TOP, CONC_DK);
  const body = chamfer(8, 14, 56, 46, 5);
  prism(g, body, 3, 18, null, CONC);
  detailWalls(g, body, 3, 18, 8);
  prism(g, body, 18, 20, OLIVE_TOP, OLIVE);
  for (const x of [12, 44]) quad(g, [x, 46 - 14], [x + 8, 46 - 14], [x + 8, 46 - 12], [x, 46 - 12], '#14140f');
  quad(g, [26, 46 - 14], [38, 46 - 14], [38, 46 - 3], [26, 46 - 3], GUN_DK);
  quad(g, [24, 46 - 16], [40, 46 - 16], [40, 46 - 14], [24, 46 - 14], team, false);
  sandbagRow(g, 6, 56, 5, 3); sandbagRow(g, 40, 56, 5, 3);
  stencil(g, 12, 46 - 6, 'BKS');
  if (level >= 2) searchlight(g, 52, 18, 20, 0.5);
  warBanner(g, 10, 18, level >= 3 ? 40 : 30, team);
  g.restore();
}

// the vehicle depot: a hangar with ribbed blast doors and a gantry crane (Kessler's Fabricator)
function drawDepot(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  prism(g, chamfer(3, 8, 93, 93, 8), 0, 3, CONC_TOP, CONC_DK);
  const hangar: Pt[] = [[10, 18], [86, 18], [86, 78], [10, 78]];
  prism(g, hangar, 3, 26, null, OLIVE);
  detailWalls(g, hangar, 3, 26, 9);
  // a barrel roof in corrugated steel
  for (let k = 0; k < 10; k++) { const y = 18 + k * 6; quad(g, [10, y - 26 - Math.sin(k / 9 * Math.PI) * 8], [86, y - 26 - Math.sin(k / 9 * Math.PI) * 8], [86, y + 6 - 26 - Math.sin((k + 1) / 9 * Math.PI) * 8], [10, y + 6 - 26 - Math.sin((k + 1) / 9 * Math.PI) * 8], k % 2 ? OLIVE_TOP : shade(OLIVE_TOP, 0.9)); }
  // the blast doors, ribbed, half open with a lit bay inside
  quad(g, [28, 78 - 22], [68, 78 - 22], [68, 78 - 3], [28, 78 - 3], '#0e0f0c');
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 48, 78 - 10, 16, 'rgba(255,200,120,0.3)'); g.restore();
  for (const [x0, x1] of [[28, 38], [58, 68]]) { quad(g, [x0, 78 - 22], [x1, 78 - 22], [x1, 78 - 3], [x0, 78 - 3], GUN); for (let x = x0 + 1.5; x < x1; x += 2.5) quad(g, [x, 78 - 21], [x + 0.8, 78 - 21], [x + 0.8, 78 - 4], [x, 78 - 4], 'rgba(0,0,0,0.3)', false); }
  for (let x = 28; x < 68; x += 4) quad(g, [x, 78 - 24], [x + 2, 78 - 24], [x + 2, 78 - 22.6], [x, 78 - 22.6], x % 8 ? team : '#141410', false);   // hazard lintel
  stencil(g, 14, 78 - 8, 'DEPOT 3');
  // the gantry crane on the roof
  g.fillStyle = OUT; g.fillRect(20, 30 - 44, 2, 22); g.fillRect(76, 30 - 44, 2, 22);
  g.fillStyle = '#c8a040'; g.fillRect(19, 30 - 46, 60, 3);
  g.strokeStyle = '#2a2a24'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(50, 30 - 43); g.lineTo(50, 30 - 30); g.stroke();
  if (level >= 2) searchlight(g, 88, 20, 26, 0.5);
  warBanner(g, 6, 30, level >= 3 ? 44 : 34, team);
  g.restore();
}

// the generator yard (Kessler's power): squat diesel generators under exhaust stacks
function drawGenerators(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 6, 61, 61, 6), 0, 2.5, CONC_TOP, CONC_DK);
  for (const [x0, y0] of [[8, 14], [34, 14]] as Pt[]) {
    const gen: Pt[] = [[x0, y0], [x0 + 22, y0], [x0 + 22, y0 + 30], [x0, y0 + 30]];
    prism(g, gen, 2.5, 13, OLIVE_TOP, OLIVE);
    detailWalls(g, gen, 2.5, 13, 5);
    for (let y = y0 + 4; y < y0 + 28; y += 3) quad(g, [x0 + 3, y - 13], [x0 + 19, y - 13], [x0 + 19, y + 1 - 13], [x0 + 3, y + 1 - 13], 'rgba(0,0,0,0.35)', false);   // radiator fins
    cylinder(g, x0 + 18, y0 + 6, 2, 13, 26, GUN_DK, GUN);
    g.fillStyle = 'rgba(80,76,72,0.35)'; g.beginPath(); g.ellipse(x0 + 19, y0 + 6 - 30, 4, 3, 0, 0, Math.PI * 2); g.fill();   // exhaust
  }
  for (const x of [18, 44]) { g.fillStyle = '#ffb02e'; g.fillRect(x, 44 - 15, 1.4, 1.4); spill(g, x, 44 - 14, 3, 'rgba(255,176,46,0.5)'); }
  quad(g, [8, 44 - 13], [56, 44 - 13], [56, 44 - 11.6], [8, 44 - 11.6], team, false);
  sandbagRow(g, 6, 58, 4, 2); sandbagRow(g, 42, 58, 4, 2);
  g.restore();
}

// the armoured refinery (Kessler's Extractor)
function drawRefinery(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  prism(g, chamfer(3, 6, 93, 61, 6), 0, 3, CONC_TOP, CONC_DK);
  const hall: Pt[] = [[8, 14], [58, 14], [58, 52], [8, 52]];
  prism(g, hall, 3, 22, null, CONC);
  detailWalls(g, hall, 3, 22, 8);
  prism(g, hall, 22, 24, OLIVE_TOP, OLIVE);
  // two refining towers banded in steel, a pipe bridge to the unloading pad
  for (const x of [66, 80]) { cylinder(g, x, 24, 6, 3, 34, GUN_TOP, GUN); for (const z of [12, 22]) { g.strokeStyle = OLIVE_DK; g.lineWidth = 1.4; g.beginPath(); g.arc(x, 24 - z, 6, 0, Math.PI); g.stroke(); } }
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 73, 24 - 34, 8, 'rgba(67,243,236,0.4)'); g.restore();
  box(g, 0, 58, 22, 66, 26, 18, 21, GUN_TOP, GUN);
  quad(g, [18, 52 - 16], [48, 52 - 16], [48, 52 - 3], [18, 52 - 3], GUN_DK);
  quad(g, [16, 52 - 18], [50, 52 - 18], [50, 52 - 16], [16, 52 - 16], team, false);
  stencil(g, 22, 52 - 7, 'FLUX REF');
  searchlight(g, 88, 50, 18, 0.4);
  g.restore();
}

// the gun emplacement (Kessler's turret): a sandbagged concrete pit
function drawEmplacement(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  prism(g, chamfer(2, 4, 30, 30, 6), 0, 3, CONC_TOP, CONC_DK);
  sandbagRow(g, 4, 28, 7, 2);
  quad(g, [6, 28 - 4], [26, 28 - 4], [26, 28 - 3], [6, 28 - 3], team, false);
  g.restore();
}
function drawEmplacementHead(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 4.4, 4, 6, GUN_TOP, GUN);
  const away = Math.sin(a) < 0;
  const guns = () => { barrels(g, a, [-1.2, 1.2], 3, 13, 8, 9.4, 1.2); box(g, a, 2.6, -3.6, 3.6, 3.6, 6, 11, OLIVE_TOP, OLIVE_DK); };   // a gun shield
  if (away) guns();
  prism(g, rot([[-4, -3], [2, -3], [3, -1.6], [3, 1.6], [2, 3], [-4, 3]], a), 6, 10, OLIVE_TOP, OLIVE);
  deckPlate(g, a, 10, -3.6, -2.4, -2, 2.4, team);
  if (!away) guns();
}

// the wall: dragon's teeth in front of a concrete barrier
function drawKWall(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  const body: Pt[] = [[1, 14], [31, 14], [31, 24], [1, 24]];
  prism(g, body, 0, 12, CONC_TOP, CONC);
  detailWalls(g, body, 0, 12, 10);
  quad(g, [1, 24 - 10], [31, 24 - 10], [31, 24 - 9], [1, 24 - 9], team, false);
  for (const x of [6, 16, 26]) { poly(g, [[x - 3, 29], [x, 29 - 7], [x + 3, 29]], CONC_TOP); poly(g, [[x, 29 - 7], [x + 3, 29], [x + 1.5, 30]], CONC_DK); }   // dragon's teeth
  g.restore();
}
function drawKHeavyWall(g: Ctx, w: number, h: number, level: number, team: string) {
  drawKWall(g, w, h, level, team);
  g.save(); const s = w / 32; g.scale(s, s);
  for (const x of [4, 14, 24]) quad(g, [x, 24 - 13], [x + 4, 24 - 13], [x + 4, 24 - 1], [x, 24 - 1], GUN, false);   // steel I-beams set in the face
  g.restore();
}

// ---------------- registration ----------------

Object.assign(VEHICLE_ART, {
  'k:trooper':    soldierArt(K_TROOPER, 11, 22),
  'k:rocketeer':  soldierArt(K_ROCKETEER, 11, 22),
  'k:vanguard':   soldierArt(K_VANGUARD, 12, 24),
  'k:sniper':     soldierArt(K_SNIPER, 14, 22),
  'k:pyro':       soldierArt(K_PYRO, 11, 22),
  'k:juggernaut': soldierArt(K_JUGGERNAUT, 13, 26),
  'k:hovertank':  { hull: drawBulwarkHull, turret: drawBulwarkTurret, reach: 24, height: 18 },
  'k:ranger':     { hull: drawArmouredCarHull, turret: drawArmouredCarTurret, reach: 16, height: 14 },
  'k:artillery':  { hull: drawSPGHull, turret: drawSPGTurret, reach: 24, height: 18, frames: 4 },
  'k:dominator':  { hull: drawHeavyHull, turret: drawHeavyTurret, reach: 26, height: 22, frames: 4 },
  'k:harvester':  { hull: drawMinerHull, reach: 18, height: 16 },
});
Object.assign(BUILDING_ART, {
  'k:nexus': drawBunkerHQ, 'k:outpost': drawBunkerHQ, 'k:barracks': drawKBarracks, 'k:fab': drawDepot,
  'k:solar': drawGenerators, 'k:extractor': drawRefinery, 'k:turret': drawEmplacement, 'k:wall': drawKWall, 'k:heavywall': drawKHeavyWall,
});
Object.assign(TURRET_ART, {
  'k:turret': { head: drawEmplacementHead, pivot: [16, 17], reach: 14, height: 13 },
});
