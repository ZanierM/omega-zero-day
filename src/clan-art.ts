// The Ashen Clans: the first miners' grandchildren, left in the deep crust when
// Helion moved on. Everything they own is old, mended, or taken: timber and
// hide, rust and rope, colony scrap welded into something that still works.
// Same conventions as art.ts (footprint coordinates, z up the screen); this
// module adds itself to art.ts's registries when the renderer imports it.

import {
  OUT, shade, edgeOf, poly, chamfer, prism, cylinder, dome, glow, spill, quad, rot, at, box, deckPlate, wheel, barrels, detailWalls,
  soldierArt, VEHICLE_ART, BUILDING_ART, TURRET_ART,
} from './art';
import type { Pt, Ctx, SoldierSpec, Limb } from './art';

const WOOD = '#6e5238', WOOD_TOP = '#94724e', WOOD_DK = '#4a3624';
const HIDE = '#9c8160', HIDE_DK = '#6e5a42';
const RUST = '#8a4f30', RUST_TOP = '#a8673e', IRON = '#4e4a46', IRON_TOP = '#6e6862';
const STONE = '#6a6258', STONE_TOP = '#8a8276';
const FIRE = 'rgba(255,150,60,0.75)';

// ---------------- helpers ----------------

// a gable roof over a rectangle, ridge running east–west at height zr
function gable(g: Ctx, x0: number, y0: number, x1: number, y1: number, z: number, zr: number, col: string, ribs = 0) {
  const ym = (y0 + y1) / 2;
  quad(g, [x0, ym - zr], [x1, ym - zr], [x1, y0 - z], [x0, y0 - z], shade(col, 0.78));
  quad(g, [x0, y1 - z], [x1, y1 - z], [x1, ym - zr], [x0, ym - zr], col);
  if (ribs) {
    g.strokeStyle = 'rgba(30,20,12,0.45)'; g.lineWidth = 0.8;
    for (let x = x0 + ribs; x < x1; x += ribs) { g.beginPath(); g.moveTo(x, y1 - z); g.lineTo(x, ym - zr); g.stroke(); }
  }
  g.strokeStyle = edgeOf(col); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0, ym - zr); g.lineTo(x1, ym - zr); g.stroke();
}
// trampled earth under a camp: no slab, just ground worn bare
function yard(g: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  gr.addColorStop(0, 'rgba(70,52,34,0.5)'); gr.addColorStop(0.7, 'rgba(70,52,34,0.28)'); gr.addColorStop(1, 'rgba(70,52,34,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
}
// a cone tent on a ground point
function tent(g: Ctx, x: number, y: number, r: number, h: number, col: string, team: string) {
  poly(g, [[x - r, y], [x, y - h], [x + r, y], [x + r * 0.6, y + r * 0.35], [x - r * 0.6, y + r * 0.35]], col);
  poly(g, [[x - r * 0.25, y + r * 0.28], [x, y - h * 0.45], [x + r * 0.25, y + r * 0.28]], '#1c140c', false);   // the flap, open
  poly(g, [[x - r * 0.72, y - h * 0.28], [x + r * 0.72, y - h * 0.28], [x + r * 0.62, y - h * 0.18], [x - r * 0.62, y - h * 0.18]], team, false);
  g.strokeStyle = WOOD_DK; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 1.5, y - h - 3); g.lineTo(x, y - h); g.lineTo(x + 2, y - h - 4); g.stroke();
}
// a tattered pennant on a crooked pole
function banner(g: Ctx, x: number, y: number, h: number, team: string) {
  g.strokeStyle = OUT; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y - h); g.stroke();
  g.strokeStyle = WOOD_TOP; g.lineWidth = 1; g.stroke();
  poly(g, [[x + 1, y - h], [x + 9, y - h + 2], [x + 6, y - h + 4.5], [x + 10, y - h + 7], [x + 1, y - h + 9]], team);
  g.fillStyle = 'rgba(30,18,10,0.5)'; g.fillRect(x + 3, y - h + 3, 2, 2);   // a painted sigil
}
function fireGlow(g: Ctx, x: number, y: number, r: number) {
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y, r, FIRE); g.restore();
  g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(x, y, Math.max(1, r * 0.18), 0, Math.PI * 2); g.fill();
}
function firePit(g: Ctx, x: number, y: number, r: number) {
  for (let k = 0; k < 7; k++) { const t = k / 7 * Math.PI * 2; g.fillStyle = k % 2 ? STONE : STONE_TOP; g.beginPath(); g.ellipse(x + Math.cos(t) * r, y + Math.sin(t) * r * 0.55, 1.6, 1.1, 0, 0, Math.PI * 2); g.fill(); }
  fireGlow(g, x, y - 1.5, r * 1.8);
}
// a heap of scrap: tilted plates and a wheel
function scrapPile(g: Ctx, x: number, y: number, s: number, seed: number) {
  const cols = [RUST, IRON, '#5d6170', RUST_TOP, '#7a7066'];
  for (let k = 0; k < 6; k++) {
    const dx = ((seed * 7 + k * 13) % 11 - 5) * s * 0.5, dy = ((seed * 3 + k * 5) % 5 - 2) * s * 0.4, w = (3 + (k * seed) % 3) * s, h = (2 + k % 3) * s;
    poly(g, [[x + dx - w, y + dy], [x + dx - w * 0.6, y + dy - h * 1.6], [x + dx + w * 0.8, y + dy - h], [x + dx + w, y + dy + 0.5]], cols[(k + seed) % cols.length]);
  }
}
// planked timber walls: a prism with board seams
function timber(g: Ctx, pts: Pt[], z0: number, z1: number, top: string | null = null) {
  prism(g, pts, z0, z1, top, WOOD);
  detailWalls(g, pts, z0, z1, 3.2, 0.3);
}
function sandbags(g: Ctx, x0: number, y: number, n: number, rows: number) {
  for (let row = 0; row < rows; row++) for (let i = 0; i < n - row; i++) {
    const x = x0 + i * 3.4 + row * 1.7, yy = y - row * 2.2;
    g.fillStyle = edgeOf('#8a7a5a'); g.beginPath(); g.ellipse(x, yy, 1.9, 1.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = row ? '#a08e68' : '#8a7a5a'; g.beginPath(); g.ellipse(x, yy - 0.3, 1.6, 1, 0, 0, Math.PI * 2); g.fill();
  }
}

// ---------------- infantry ----------------

const CLAN_LEGS: [string, string, string, string] = ['#5a4c3c', '#46392c', '#3a2e22', '#2a2018'];
const longRifle = (len: number, bob: number, y = 2.4): Limb[] => [
  { x0: 0.5, y0: y - 0.7, x1: 3.2, y1: y + 0.7, z0: 6.8 + bob + 3.4, z1: 6.8 + bob + 5, top: '#8a7458', side: '#6e5a44' },      // wrapped forearm
  { x0: -1.5, y0: y - 0.6, x1: 2, y1: y + 0.6, z0: 6.8 + bob + 3.6, z1: 6.8 + bob + 5.2, top: '#8a6038', side: '#5e3e22' },    // wooden stock
  { x0: 2, y0: y - 0.45, x1: len, y1: y + 0.45, z0: 6.8 + bob + 4.2, z1: 6.8 + bob + 5.2, top: '#5a5650', side: '#3a3632' },
];
const bedroll = (bob: number): Limb => ({ x0: -4.2, y0: -2.6, x1: -2.2, y1: 2.6, z0: 6.8 + bob + 4, z1: 6.8 + bob + 6.6, top: '#8a7a5a', side: '#6a5a40' });

const SCAV: SoldierSpec = {
  armour: '#6e5a44', armourTop: '#9a8060', build: 0.95, helmet: '#8a7458', visor: null, legs: CLAN_LEGS,
  extra: bob => [bedroll(bob), ...longRifle(9.5, bob)],
};
const HARPOONER: SoldierSpec = {
  armour: '#6a5848', armourTop: '#94806a', build: 1.05, helmet: '#7a6650', visor: null, legs: CLAN_LEGS,
  extra: bob => [
    { x0: -4.4, y0: -2.4, x1: -2.2, y1: 2.4, z0: 6.8 + bob + 1, z1: 6.8 + bob + 5.5, top: '#b09868', side: '#7a6646' },          // coiled line
    { x0: -3, y0: 1.9, x1: 8, y1: 3.7, z0: 6.8 + bob + 5.5, z1: 6.8 + bob + 7.6, top: IRON_TOP, side: IRON },                     // the gun
    { x0: 8, y0: 2.3, x1: 10.5, y1: 3.3, z0: 6.8 + bob + 6, z1: 6.8 + bob + 7.1, top: '#c8c0b0', side: '#8a8478' },               // the barb
  ],
};
const FIREBRAND: SoldierSpec = {
  armour: '#7a5a40', armourTop: '#a07a58', build: 1, helmet: '#6a5040', visor: null, legs: CLAN_LEGS,
  extra: bob => [
    { x0: -2.6, y0: -3.6, x1: 2.4, y1: -2.6, z0: 6.8 + bob + 2, z1: 6.8 + bob + 5.2, top: '#4a7a5a', side: '#2e5a40' },            // a bandolier of bottles
    { x0: 2, y0: 2.6, x1: 3.4, y1: 4, z0: 6.8 + bob + 6, z1: 6.8 + bob + 9.5, top: '#5a8a6a', side: '#3a6a4a' },                   // one in hand
  ],
  glow: (g, a, bob) => { const [x, y] = at(2.7, 3.3, a); fireGlow(g, x, y - 6.8 - bob - 10.5, 4); },
};
const LONGSHOT: SoldierSpec = {
  armour: '#5e5440', armourTop: '#80745a', build: 0.92, helmet: '#5a4e3a', visor: null, legs: CLAN_LEGS,
  extra: bob => [
    { x0: -3.8, y0: -3.8, x1: 1, y1: 3.8, z0: 6.8 + bob + 0.3, z1: 6.8 + bob + 6.8, top: '#6a5e46', side: '#4a4030' },             // ragged cloak
    ...longRifle(14, bob),
    { x0: 3.5, y0: 1.9, x1: 6.5, y1: 2.9, z0: 6.8 + bob + 5.2, z1: 6.8 + bob + 6.3, top: '#3a3632', side: '#24201c' },               // brass scope
  ],
  glow: (g, a, bob) => { const [x, y] = at(6.6, 2.4, a); g.fillStyle = 'rgba(255,220,140,0.9)'; g.fillRect(x - 0.4, y - 6.8 - bob - 5.8, 0.8, 0.8); },
};

// ---------------- the pack beast ----------------
// A shaggy, horned hauler native to the crust. Drawn facing +x at offset x0.
function beast(g: Ctx, a: number, x0: number, y0: number, phase: number, team: string) {
  const t = phase * Math.PI * 2;
  const legs: [number, number, number][] = [[x0 + 4, y0 - 2.6, 0], [x0 + 4, y0 + 2.6, Math.PI], [x0 - 3, y0 - 2.6, Math.PI], [x0 - 3, y0 + 2.6, 0]];
  const back = legs.filter(l => Math.sin(a) * (l[1] - y0) < 0 || (Math.abs(Math.sin(a)) < 0.2 && l[1] < y0));
  const front = legs.filter(l => !back.includes(l));
  const leg = ([x, y, ph]: [number, number, number]) => { const sw = Math.sin(t + ph) * 1.6, lift = Math.max(0, Math.cos(t + ph)) * 0.8; box(g, a, x + sw - 0.8, y - 0.8, x + sw + 0.8, y + 0.8, lift, 6.5, '#4a3a2a', '#3a2a1c'); };
  back.forEach(leg);
  box(g, a, x0 - 5.5, y0 - 3.2, x0 + 6, y0 + 3.2, 5.5, 10, '#8a6e4e', '#6a5038');                 // shaggy body
  const [hx, hy] = at(x0 + 1.5, y0, a); dome(g, hx, hy, 3.8, 9.5, '#94785a');                      // hump
  deckPlate(g, a, 10.2, x0 - 4, y0 - 3.3, x0 - 1, y0 + 3.3, team);                                   // a clan blanket
  box(g, a, x0 + 6, y0 - 1.8, x0 + 9.5, y0 + 1.8, 6, 9.5, '#7a5e42', '#5a4430');                    // head
  for (const s of [-1, 1]) {                                                                        // horns
    const [p0x, p0y] = at(x0 + 7, y0 + s * 1.8, a), [p1x, p1y] = at(x0 + 5.5, y0 + s * 4, a);
    g.strokeStyle = '#d8ccb0'; g.lineWidth = 1.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(p0x, p0y - 9.5); g.quadraticCurveTo(p1x, p1y - 12, p1x + Math.cos(a) * 2, p1y - 13); g.stroke();
  }
  front.forEach(leg);
}
// the traces from a beast's shoulders back to the cart
function traces(g: Ctx, a: number, xb: number, xc: number, z: number) {
  g.strokeStyle = '#3a2a1a'; g.lineWidth = 0.9;
  for (const y of [-2, 2]) { const [p0x, p0y] = at(xb, y, a), [p1x, p1y] = at(xc, y * 1.5, a); g.beginPath(); g.moveTo(p0x, p0y - 8); g.lineTo(p1x, p1y - z); g.stroke(); }
}
function cartWheels(g: Ctx, a: number, x: number, half: number) {
  for (const y of [-half, half]) { box(g, a, x - 3, y - 0.7, x + 3, y + 0.7, 0, 6, '#6e5238', WOOD_DK); const [cx, cy] = at(x, y, a); g.fillStyle = IRON; g.beginPath(); g.arc(cx, cy - 3, 0.9, 0, Math.PI * 2); g.fill(); }
}

// ---------------- vehicles ----------------

function drawTechnicalHull(g: Ctx, a: number, team: string) {
  for (const [x, y] of [[-6, -5.6], [6, -5.6], [-6, 5.6], [6, 5.6]] as Pt[]) wheel(g, a, x, y, 3, 2.6);
  box(g, a, -9, -4.8, 10, 4.8, 2.5, 5, '#5a5048', '#3a332c');                                  // chassis
  box(g, a, -9, -4.6, 2, 4.6, 5, 7.5, null, RUST);                                              // the bed, rusted through
  deckPlate(g, a, 7.5, -8.5, -4.2, 1.5, 4.2, '#2a2420', true);
  box(g, a, 2, -4.6, 9.5, 4.6, 5, 11, '#a8a090', '#7a7266');                                    // cab, sun-bleached
  deckPlate(g, a, 11, 6.5, -4, 9.5, 4, '#1c2228', true);                                        // windscreen
  for (const y of [-4.65, 4.65]) deckPlate(g, a, 8.2, 2.5, y - 0.4, 9, y + 0.4, team);          // a door stripe in clan paint
  box(g, a, 9.5, -4.8, 11, 4.8, 3, 6.5, IRON_TOP, IRON);                                        // welded ram plate
  for (const y of [-3, 3]) { const [ex, ey] = at(-9.5, y, a); cylinder(g, ex, ey, 1.1, 5, 7.5, '#3a3632', '#5a5650'); }   // jerrycans
}
function drawTechnicalTurret(g: Ctx, a: number, team: string) {
  // a pintle gun bolted into the bed
  cylinder(g, 0, 0, 1.2, 7.5, 10, IRON_TOP, IRON);
  barrels(g, a, [0], 0, 9, 10, 11.4, 1.1);
  box(g, a, -2, -1.4, 1.5, 1.4, 9.6, 12, '#5a5650', '#3a3632');
  deckPlate(g, a, 12, -1.8, -1.2, -0.4, 1.2, team);
}

function drawRustbucketHull(g: Ctx, a: number, team: string) {
  for (const y of [-7.5, 7.5]) {                                                                // tracks
    box(g, a, -13, y - 2.4, 13, y + 2.4, 0, 5.5, '#3a3632', '#26221e');
    for (let x = -12; x < 13; x += 2.4) deckPlate(g, a, 5.5, x, y - 2.4, x + 1, y + 2.4, 'rgba(0,0,0,0.4)');
  }
  const hull: Pt[] = [[-12, -6], [9, -6], [13, -3], [13, 3], [9, 6], [-12, 6]];
  prism(g, rot(hull, a), 4, 10, RUST_TOP, RUST);
  // mismatched armour plates, bolted on wherever there was a hole
  deckPlate(g, a, 10, -10, -5, -3, 0, '#7a7a74', true);
  deckPlate(g, a, 10, 2, 0.5, 8, 5, '#6a5a48', true);
  deckPlate(g, a, 10, -2, -5.5, 4, -2, IRON_TOP, true);
  for (const y of [-6.1, 6.1]) deckPlate(g, a, 7, -11, y - 0.5, 8, y + 0.5, team);
  for (const y of [-2, 2]) { const [ex, ey] = at(-11, y, a); cylinder(g, ex, ey, 1, 10, 15, '#2a2624', '#5a5650'); }   // smokestacks
}
function drawRustbucketTurret(g: Ctx, a: number, team: string) {
  const away = Math.sin(a) < 0;
  const gun = () => { barrels(g, a, [0], 5, 19, 12.2, 14, 1.8); box(g, a, 17.5, -1.4, 20, 1.4, 11.8, 14.4, IRON, '#2a2624'); };
  if (away) gun();
  prism(g, rot([[-6, -5], [4, -5], [7, -2], [7, 2], [4, 5], [-6, 5]], a), 10, 15, '#7a6a5a', '#5a4a3a');
  deckPlate(g, a, 15, -5, -3.5, -2.5, 3.5, team);
  deckPlate(g, a, 15, 0, -2, 3.5, 1, '#3a3632', true);                                          // hatch
  if (!away) gun();
}

function drawMortarHull(g: Ctx, a: number, team: string, phase = 0) {
  cartWheels(g, a, -5, 5.5);
  box(g, a, -10, -4.5, 0, 4.5, 4, 6.5, WOOD_TOP, WOOD);                                         // the cart bed
  for (const x of [-8, -5, -2]) deckPlate(g, a, 6.5, x, -4.4, x + 0.6, 4.4, 'rgba(30,20,10,0.4)');
  box(g, a, -9.5, 2.2, -6.5, 4.2, 6.5, 9, '#5a5040', '#3a3428');                                // shell crate
  // a stubby tube on a baseplate, cocked up over the beast's back
  const [bx, by] = at(-5, -1, a), [tx, ty] = at(-1.5, -1, a);
  cylinder(g, bx, by, 2.4, 6.5, 7.5, IRON_TOP, IRON);
  g.strokeStyle = OUT; g.lineWidth = 4.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, by - 8); g.lineTo(tx, ty - 15); g.stroke();
  g.strokeStyle = '#5a5650'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#14110e'; g.beginPath(); g.arc(tx, ty - 15, 1.3, 0, Math.PI * 2); g.fill();
  traces(g, a, 4, 0, 6);
  beast(g, a, 7.5, 0, phase, team);
}
function drawHaulerHull(g: Ctx, a: number, team: string, phase = 0) {
  cartWheels(g, a, -7, 6.5);
  cartWheels(g, a, -1, 6.5);
  box(g, a, -12, -5.5, 2, 5.5, 4, 10, null, WOOD);                                              // the ore wagon
  detailWalls(g, rot([[-12, -5.5], [2, -5.5], [2, 5.5], [-12, 5.5]], a), 4, 10, 3, 0.25);
  deckPlate(g, a, 10, -12, -5.5, 2, 5.5, '#1a1612', true);
  for (const [x, y, r] of [[-9, -2.5, 2.2], [-5, 2, 2.6], [-2, -2, 2], [-8, 3, 1.8], [-4, -3.5, 1.6]] as [number, number, number][]) {
    const [cx, cy] = at(x, y, a);
    poly(g, [[cx, cy - 10 - r * 1.6], [cx + r, cy - 10], [cx, cy - 10 + r * 0.6], [cx - r, cy - 10]], '#43f3ec');
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(cx - 0.4, cy - 10 - r * 1.2, 0.8, r * 0.8);
  }
  for (const y of [-5.6, 5.6]) deckPlate(g, a, 8, -11, y - 0.4, 1, y + 0.4, team);
  // picks and shovels lashed along the side
  const [s0x, s0y] = at(-11, 5.8, a), [s1x, s1y] = at(1, 5.8, a);
  g.strokeStyle = '#8a6a48'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(s0x, s0y - 9); g.lineTo(s1x, s1y - 7); g.stroke();
  traces(g, a, 6.5, 2, 6);
  beast(g, a, 9.5, 0, phase, team);
}

function drawCaravanHull(g: Ctx, a: number, team: string, phase = 0) {
  cartWheels(g, a, -9, 6.5);
  cartWheels(g, a, -1, 6.5);
  box(g, a, -13, -5.5, 3, 5.5, 4, 7, WOOD_TOP, WOOD);
  // a canvas cover over hoops, striped in clan colours
  const hoop = (x: number) => { const pts: Pt[] = []; for (let k = 0; k <= 8; k++) { const t = Math.PI * k / 8; const [px, py] = at(x, -Math.cos(t) * 5.5, a); pts.push([px, py - 7 - Math.sin(t) * 6]); } return pts; };
  const h0 = hoop(-12.5), h1 = hoop(2.5);
  for (let k = 0; k < 8; k++) quad(g, h0[k], h0[k + 1], h1[k + 1], h1[k], k === 3 || k === 4 ? team : k % 2 ? '#c8b896' : '#b8a684');
  poly(g, Math.sin(a) * Math.cos(a) >= 0 || Math.cos(a) > 0 ? h1 : h0, '#a89670');
  traces(g, a, 6.5, 3, 6);
  beast(g, a, 9.5, -2.2, phase, team);
  beast(g, a, 9.5, 2.2, (phase + 0.5) % 1, team);
}

// ---------------- structures ----------------

function drawHall(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  yard(g, 4, 10, 92, 92);                            // a packed-earth yard
  // totems either side, taller as the hall grows
  for (const x of [12, 84]) {
    const top = 34 + level * 6;
    box(g, 0, x - 2.5, 78, x + 2.5, 82, 2, top, WOOD_TOP, WOOD_DK);
    for (let z = 10; z < top; z += 9) quad(g, [x - 2.5, 82 - z], [x + 2.5, 82 - z], [x + 2.5, 82 - z + 2], [x - 2.5, 82 - z + 2], z % 2 ? team : '#c8b896', false);
    dome(g, x, 80, 3, top, '#d8ccb0');                                                          // a beast skull on top
  }
  const body: Pt[] = [[14, 26], [82, 26], [82, 72], [14, 72]];
  timber(g, body, 2, 26);
  // roof: hide over timber, with a colony hull plate laid along the ridge
  gable(g, 10, 22, 86, 76, 26, 48, HIDE, 6);
  quad(g, [30, 49 - 48 - 1], [66, 49 - 48 - 1], [66, 49 - 48 + 5], [30, 49 - 48 + 5], '#8e8a80');
  g.fillStyle = 'rgba(40,50,70,0.5)'; g.font = '700 4px system-ui, sans-serif'; g.fillText('HDC-07', 40, 4);   // a company serial, painted over
  for (const x of [34, 62]) cylinder(g, x, 50, 1.6, 44, 52, '#3a3632', '#2a2624');               // smoke holes
  // the door: a firelit arch hung with a clan banner
  quad(g, [40, 72 - 20], [56, 72 - 20], [56, 72 - 2], [40, 72 - 2], '#1c140c');
  fireGlow(g, 48, 72 - 6, 9);
  quad(g, [38, 72 - 23], [58, 72 - 23], [58, 72 - 19], [38, 72 - 19], team);
  sandbags(g, 18, 84, 4, 2);
  if (level >= 2) banner(g, 76, 30, 34, team);
  if (level >= 3) { banner(g, 20, 30, 34, team); scrapPile(g, 86, 60, 1.1, 3); }
  g.restore();
}

function drawCamp(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  yard(g, 4, 8, 60, 60);
  tent(g, 20, 34, 12, 22, HIDE, team);
  tent(g, 44, 28, 10, 18, '#b0987a', team);
  if (level >= 2) tent(g, 46, 50, 9, 16, HIDE_DK, team);
  firePit(g, 28, 50, 4);
  scrapPile(g, 12, 54, 0.8, 2);
  banner(g, 54, 44, level >= 3 ? 40 : 30, team);
  g.restore();
}

function drawSmelter(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  yard(g, 3, 6, 93, 61);
  // a stone furnace with a glowing mouth and a tall stack
  const furnace: Pt[] = [[12, 16], [50, 16], [50, 52], [12, 52]];
  prism(g, furnace, 2, 24, STONE_TOP, STONE);
  detailWalls(g, furnace, 2, 24, 5, 0.3);
  quad(g, [24, 52 - 14], [38, 52 - 14], [38, 52 - 3], [24, 52 - 3], '#24140a');
  fireGlow(g, 31, 52 - 8, 10);
  cylinder(g, 18, 22, 4, 24, 46, STONE_TOP, STONE);
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 18, 22 - 48, 5, 'rgba(255,120,40,0.4)'); g.restore();
  // the ore chute and the heap of crystal waiting for it
  box(g, 0, 50, 26, 70, 34, 10, 14, WOOD_TOP, WOOD);
  for (const [x, y, r] of [[74, 42, 4], [80, 48, 3.4], [70, 50, 3], [84, 40, 2.6]] as [number, number, number][])
    poly(g, [[x, y - r * 2], [x + r, y], [x, y + r * 0.6], [x - r, y]], '#43f3ec');
  spill(g, 76, 44, 12, 'rgba(67,243,236,0.25)');
  quad(g, [12, 52 - 26], [50, 52 - 26], [50, 52 - 24], [12, 52 - 24], team, false);
  banner(g, 88, 22, 26, team);
  g.restore();
}

function drawLonghouse(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  yard(g, 3, 8, 61, 61);
  const body: Pt[] = [[10, 22], [54, 22], [54, 50], [10, 50]];
  timber(g, body, 1.5, 16);
  gable(g, 7, 18, 57, 54, 16, 30, HIDE_DK, 5);
  quad(g, [26, 50 - 13], [36, 50 - 13], [36, 50 - 1.5], [26, 50 - 1.5], '#1c140c');
  fireGlow(g, 31, 50 - 5, 5);
  quad(g, [24, 50 - 15], [38, 50 - 15], [38, 50 - 13], [24, 50 - 13], team, false);
  // a weapon rack by the door
  for (let k = 0; k < 4; k++) { g.strokeStyle = k % 2 ? '#5a5650' : '#8a6038'; g.lineWidth = 1; g.beginPath(); g.moveTo(42 + k * 2.4, 56); g.lineTo(43 + k * 2.4, 44); g.stroke(); }
  box(g, 0, 41, 54, 52, 56, 0, 3, WOOD_TOP, WOOD);
  if (level >= 2) sandbags(g, 10, 58, 3, 2);
  if (level >= 3) banner(g, 14, 26, 30, team);
  g.restore();
}

function drawScrapyard(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  yard(g, 3, 8, 93, 93);
  scrapPile(g, 20, 40, 1.6, 1);
  scrapPile(g, 76, 30, 1.4, 4);
  // a timber gantry with a chain hoist over the work pit
  for (const x of [26, 70]) box(g, 0, x - 2, 50, x + 2, 54, 1.5, 40, WOOD_TOP, WOOD_DK);
  quad(g, [24, 52 - 42], [72, 52 - 42], [72, 52 - 38], [24, 52 - 38], WOOD);
  g.strokeStyle = '#3a3632'; g.lineWidth = 1; g.beginPath(); g.moveTo(48, 52 - 38); g.lineTo(48, 52 - 22); g.stroke();
  // a half-built truck under the hoist
  box(g, 0, 36, 56, 60, 72, 2, 10, RUST_TOP, RUST);
  box(g, 0, 50, 56, 60, 72, 10, 16, '#a8a090', '#7a7266');
  for (const x of [40, 56]) { g.fillStyle = '#26221e'; g.beginPath(); g.ellipse(x, 73, 3.5, 2, 0, 0, Math.PI * 2); g.fill(); }
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 44, 60 - 12, 5, 'rgba(160,210,255,0.8)'); g.restore();   // a welder's arc
  // a fence of sheet scrap along the front
  for (let x = 6; x < 90; x += 7) quad(g, [x, 90 - 12], [x + 6, 90 - 11], [x + 6, 90], [x, 90], x % 2 ? RUST : IRON);
  quad(g, [40, 90 - 14], [56, 90 - 14], [56, 90 - 10], [40, 90 - 10], team);
  if (level >= 2) banner(g, 88, 70, 30, team);
  if (level >= 3) scrapPile(g, 62, 18, 1.2, 6);
  g.restore();
}

function drawForge(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  yard(g, 3, 8, 61, 61);
  const hearth: Pt[] = [[10, 18], [40, 18], [40, 44], [10, 44]];
  prism(g, hearth, 1.5, 18, STONE_TOP, STONE);
  detailWalls(g, hearth, 1.5, 18, 4, 0.3);
  quad(g, [16, 44 - 12], [34, 44 - 12], [34, 44 - 3], [16, 44 - 3], '#2a1206');
  fireGlow(g, 25, 44 - 7, 9);
  cylinder(g, 32, 22, 3.5, 18, 40, STONE_TOP, STONE);
  // the anvil, the quench barrel, a bellows of stitched hide
  box(g, 0, 44, 46, 54, 50, 1.5, 7, IRON_TOP, IRON);
  cylinder(g, 50, 32, 4, 1.5, 9, '#3a5a6a', WOOD);
  poly(g, [[6, 46], [14, 44], [14, 52], [6, 52]], HIDE);
  quad(g, [10, 44 - 20], [40, 44 - 20], [40, 44 - 18], [10, 44 - 18], team, false);
  g.restore();
}

function drawLookout(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  for (const [x, y] of [[9, 24], [23, 24], [16, 18]] as Pt[]) { g.strokeStyle = OUT; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y); g.lineTo(16, 24 - 40); g.stroke(); g.strokeStyle = WOOD_TOP; g.lineWidth = 1.4; g.stroke(); }
  g.strokeStyle = WOOD; g.lineWidth = 0.8;
  for (const z of [10, 22]) { g.beginPath(); g.moveTo(10, 24 - z); g.lineTo(22, 24 - z); g.stroke(); }
  prism(g, [[9, 18], [23, 18], [23, 28], [9, 28]], 36, 39, WOOD_TOP, WOOD);
  poly(g, [[8, 28 - 44], [16, 22 - 52], [24, 28 - 44]], HIDE);
  banner(g, 22, 22, 52, team);
  g.restore();
}

function drawMender(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  yard(g, 3, 8, 61, 61);
  // a long pale tent on poles, a lantern at the flap
  const body: Pt[] = [[10, 22], [54, 22], [54, 48], [10, 48]];
  prism(g, body, 1.5, 10, null, '#c8bca0');
  gable(g, 8, 20, 56, 50, 10, 26, '#d8ccb0', 0);
  quad(g, [8, 35 - 26], [56, 35 - 26], [56, 35 - 23], [8, 35 - 23], team, false);
  quad(g, [27, 48 - 9], [37, 48 - 9], [37, 48 - 1.5], [27, 48 - 1.5], '#3a2e22');
  fireGlow(g, 40, 48 - 10, 5);
  box(g, 0, 14, 52, 26, 57, 1.5, 4, '#9a8e78', '#6e6452');                                      // a cot outside
  g.restore();
}

function drawPalisade(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  for (let k = 0; k < 6; k++) {
    const x = 3 + k * 5.2, h = 14 + (k * 7) % 4;
    poly(g, [[x - 2.2, 24], [x - 2.2, 24 - h], [x, 24 - h - 4], [x + 2.2, 24 - h], [x + 2.2, 24]], k % 2 ? WOOD : WOOD_TOP);
  }
  quad(g, [2, 24 - 9], [30, 24 - 8], [30, 24 - 4], [2, 24 - 5], RUST);                         // a scrap sheet lashed across
  quad(g, [2, 24 - 11], [30, 24 - 10], [30, 24 - 9], [2, 24 - 10], team, false);
  g.restore();
}

function drawGunNest(g: Ctx, w: number, _h: number, _level: number, _team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  yard(g, 3, 5, 29, 29);
  sandbags(g, 4, 28, 7, 3);
  sandbags(g, 6, 12, 6, 2);
  g.restore();
}
function drawGunNestHead(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 1.4, 4, 7, IRON_TOP, IRON);
  const away = Math.sin(a) < 0;
  const gun = () => { barrels(g, a, [0], 1, 11, 7.6, 9, 1.2); box(g, a, 9.5, -0.9, 11.5, 0.9, 7.4, 9.2, '#3a3632', '#24201c'); };
  if (away) gun();
  box(g, a, -3, -1.8, 2, 1.8, 7, 10, '#5a5650', '#3a3632');
  box(g, a, 1, -2.6, 2.2, 2.6, 7, 11, IRON_TOP, IRON);                                         // a shield plate
  deckPlate(g, a, 10, -3, -1.2, -1, 1.2, team);
  if (!away) gun();
}

function drawBombard(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  prism(g, chamfer(4, 8, 60, 60, 10), 0, 6, STONE_TOP, STONE);                                  // a dry-stone platform
  detailWalls(g, chamfer(4, 8, 60, 60, 10), 0, 6, 5, 0.3);
  for (const [x, y] of [[12, 52], [52, 52]] as Pt[]) cylinder(g, x, y, 3.5, 6, 10, '#4a4440', '#2a2624');   // shot piled ready
  quad(g, [14, 60 - 6], [50, 60 - 6], [50, 60 - 4], [14, 60 - 4], team, false);
  g.restore();
}
function drawBombardHead(g: Ctx, a: number, team: string) {
  const away = Math.sin(a) < 0;
  const gun = () => {
    box(g, a, 2, -3.2, 22, 3.2, 10, 16, '#5e5248', '#3e342c');                                 // a fat cast barrel
    for (const x of [6, 13, 20]) box(g, a, x, -3.6, x + 1.4, 3.6, 9.6, 16.4, '#8a6a3a', '#5a4422');   // bronze hoops
    const [mx, my] = at(22.2, 0, a); g.fillStyle = '#100c08'; g.beginPath(); g.ellipse(mx, my - 13, 2, 2.4, 0, 0, Math.PI * 2); g.fill();
  };
  if (away) gun();
  box(g, a, -8, -6, 4, 6, 6, 11, WOOD_TOP, WOOD);                                             // the timber carriage
  for (const y of [-6.5, 6.5]) { const [cx, cy] = at(-2, y, a); g.fillStyle = WOOD_DK; g.beginPath(); g.ellipse(cx, cy - 6, 4, 4.4, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = IRON; g.lineWidth = 1; g.stroke(); }
  deckPlate(g, a, 11, -7.5, -2, -4.5, 2, team);
  if (!away) gun();
}

// traps: only their owner ever sees them, so they're drawn to be readable, not hidden
function drawSnare(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  g.fillStyle = 'rgba(40,30,20,0.4)'; g.beginPath(); g.ellipse(16, 20, 9, 5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b8b0a0'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(16, 19, 7, 3.6, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#d8d0c0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(12, 19); g.lineTo(16, 14); g.lineTo(20, 19); g.stroke();
  g.fillStyle = team; g.fillRect(22, 10, 3, 2); g.fillStyle = WOOD_TOP; g.fillRect(22, 10, 0.8, 10);
  g.restore();
}
function drawMine(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  g.fillStyle = 'rgba(40,30,20,0.45)'; g.beginPath(); g.ellipse(16, 20, 9, 5, 0, 0, Math.PI * 2); g.fill();
  box(g, 0, 11, 16, 21, 23, 0, 3, '#5a5040', '#3a3428');
  for (const [x, y] of [[13, 18], [16, 19], [19, 18], [14.5, 21], [17.5, 21]] as Pt[]) { g.fillStyle = '#9a948a'; g.fillRect(x - 0.5, y - 3.6, 1, 1); }
  g.fillStyle = team; g.fillRect(22, 9, 3, 2); g.fillStyle = WOOD_TOP; g.fillRect(22, 9, 0.8, 11);
  g.restore();
}

// ---------------- registration ----------------

Object.assign(VEHICLE_ART, {
  scav:       soldierArt(SCAV, 13, 20),
  harpooner:  soldierArt(HARPOONER, 12, 22),
  firebrand:  soldierArt(FIREBRAND, 10, 22),
  longshot:   soldierArt(LONGSHOT, 15, 20),
  technical:  { hull: drawTechnicalHull,  turret: drawTechnicalTurret,  reach: 16, height: 16 },
  rustbucket: { hull: drawRustbucketHull, turret: drawRustbucketTurret, reach: 22, height: 20 },
  mortar:     { hull: drawMortarHull,     reach: 18, height: 20, frames: 4 },
  hauler:     { hull: drawHaulerHull,     reach: 20, height: 20, frames: 4 },
  caravan:    { hull: drawCaravanHull,    reach: 20, height: 22, frames: 4 },
});
Object.assign(BUILDING_ART, {
  hall: drawHall, camp: drawCamp, smelter: drawSmelter, longhouse: drawLonghouse, scrapyard: drawScrapyard,
  forge: drawForge, lookout: drawLookout, mender: drawMender, palisade: drawPalisade,
  gunnest: drawGunNest, bombard: drawBombard, snare: drawSnare, mine: drawMine,
});
Object.assign(TURRET_ART, {
  gunnest: { head: drawGunNestHead, pivot: [16, 18], reach: 12, height: 12 },
  bombard: { head: drawBombardHead, pivot: [32, 34], reach: 24, height: 18 },
});
