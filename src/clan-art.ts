// The Ashen Clans: the first miners' grandchildren, left in the deep crust when
// Helion moved on. Everything they own is old, mended, or taken: timber and
// hide, rust and rope, colony scrap welded into something that still works.
// Same conventions as art.ts (footprint coordinates, z up the screen); this
// module adds itself to art.ts's registries when the renderer imports it.

import {
  OUT, shade, edgeOf, poly, chamfer, prism, cylinder, dome, glow, spill, quad, rot, at, box, deckPlate, wheel, barrels, detailWalls,
  VEHICLE_ART, BUILDING_ART, TURRET_ART,
} from './art';
import type { Pt, Ctx } from './art';
import { drawRig, stride, shadow } from './rig';
import type { Tone, V3, Part } from './rig';

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
// a roof that reads as made: the same gable, then the front slope worked over
// in thatch rows (with a ragged fringe), patched hides (stitched), or
// corrugated scrap tin (rust-streaked); a shadow under the eave and crossed
// ridge poles at both ends
type RoofKind = 'thatch' | 'hide' | 'tin';
const THATCH = ['#6e5a32', '#8e7444', '#b09456', '#c8ac6a'];
function roof(g: Ctx, x0: number, y0: number, x1: number, y1: number, z: number, zr: number, kind: RoofKind, team: string) {
  const ym = (y0 + y1) / 2, base = kind === 'thatch' ? '#9a8048' : kind === 'hide' ? HIDE : '#7a7268';
  gable(g, x0, y0, x1, y1, z, zr, base);
  const top = ym - zr, eave = y1 - z;
  // the wall in shadow under the eave
  const sg = g.createLinearGradient(0, eave, 0, eave + 5); sg.addColorStop(0, 'rgba(20,12,6,0.55)'); sg.addColorStop(1, 'rgba(20,12,6,0)');
  g.fillStyle = sg; g.fillRect(x0 + 2, eave, x1 - x0 - 4, 5);
  g.save(); g.beginPath(); g.moveTo(x0, top); g.lineTo(x1, top); g.lineTo(x1, eave); g.lineTo(x0, eave); g.closePath(); g.clip();
  let r = (x0 * 31 + y0 * 17) | 0; const rnd = () => (r = (r * 16807 + 11) % 2147483647) / 2147483647;
  if (kind === 'thatch') {
    for (let y = top + 1; y < eave; y += 2.6) for (let x = x0; x < x1; x += 1.1) {
      g.strokeStyle = THATCH[Math.floor(rnd() * 4)]; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 0.8, y + 2.6 + rnd()); g.stroke();
    }
    for (let y = top + 2.6; y < eave; y += 5.2) { g.fillStyle = 'rgba(40,26,10,0.28)'; g.fillRect(x0, y, x1 - x0, 0.7); }   // the courses
  } else if (kind === 'hide') {
    const tones = [HIDE, HIDE_DK, '#b09470', '#8a6e50'];
    for (let y = top; y < eave; y += 7) for (let x = x0 - 3; x < x1; x += 9) {
      const w = 8 + rnd() * 4, h = 6 + rnd() * 3, ox = rnd() * 3;
      poly(g, [[x + ox, y], [x + ox + w, y + rnd()], [x + ox + w - 1, y + h], [x + ox + 1, y + h - rnd()]], tones[Math.floor(rnd() * 4)], false);
      g.strokeStyle = 'rgba(40,24,12,0.55)'; g.lineWidth = 0.5; g.setLineDash([0.8, 0.9]);
      g.beginPath(); g.moveTo(x + ox, y + 0.5); g.lineTo(x + ox + w, y + 0.5); g.moveTo(x + ox + w - 0.5, y); g.lineTo(x + ox + w - 1.5, y + h); g.stroke(); g.setLineDash([]);
    }
  } else {
    for (let x = x0; x < x1; x += 2) { g.fillStyle = (x - x0) % 4 < 2 ? 'rgba(255,240,220,0.14)' : 'rgba(10,8,6,0.22)'; g.fillRect(x, top, 1, eave - top); }
    for (let k = 0; k < (x1 - x0) / 8; k++) {
      const x = x0 + rnd() * (x1 - x0), y = top + rnd() * (eave - top) * 0.6, l = 4 + rnd() * 10;
      const rg = g.createLinearGradient(0, y, 0, y + l); rg.addColorStop(0, 'rgba(150,72,30,0.55)'); rg.addColorStop(1, 'rgba(150,72,30,0)');
      g.fillStyle = rg; g.fillRect(x, y, 1.6 + rnd() * 2, l);
    }
    // two sheets that don't match, nailed over holes
    for (let k = 0; k < 2; k++) { const x = x0 + 6 + rnd() * (x1 - x0 - 20), y = top + 3 + rnd() * (eave - top - 12); poly(g, [[x, y], [x + 10, y + 1], [x + 9, y + 8], [x, y + 7]], k ? RUST : '#8a8a84'); }
  }
  g.restore();
  // a ragged fringe along the eave for thatch and hide
  if (kind !== 'tin') for (let x = x0; x < x1; x += 1.6) { g.fillStyle = kind === 'thatch' ? THATCH[(x * 7 | 0) % 3] : HIDE_DK; g.fillRect(x, eave - 0.4, 1.1, 1 + ((x * 13 | 0) % 3) * 0.6); }
  // crossed poles over each end of the ridge, and the ridge pole itself
  g.strokeStyle = WOOD_DK; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0 + 1, top + 1); g.lineTo(x1 - 1, top + 1); g.stroke();
  for (const x of [x0 + 2, x1 - 2]) {
    g.strokeStyle = WOOD_DK; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - 3, top + 4); g.lineTo(x + 3, top - 5); g.moveTo(x + 3, top + 4); g.lineTo(x - 3, top - 5); g.stroke();
    g.strokeStyle = WOOD_TOP; g.lineWidth = 0.7; g.stroke();
  }
  g.fillStyle = team; g.beginPath(); g.moveTo(x1 - 2, top - 5); g.lineTo(x1 + 4, top - 3.5); g.lineTo(x1 - 2, top - 2); g.fill();   // a rag of clan colour tied on
}
// a wall of stacked logs on the south face, round log-ends at the corners, on a course of fieldstone
function logWall(g: Ctx, x0: number, x1: number, y: number, z0: number, z1: number) {
  quad(g, [x0, y - z1], [x1, y - z1], [x1, y - z0], [x0, y - z0], WOOD);
  for (let z = z0 + 3; z < z1; z += 2.8) {
    g.fillStyle = 'rgba(20,12,6,0.45)'; g.fillRect(x0, y - z, x1 - x0, 0.7);
    g.fillStyle = 'rgba(255,220,170,0.14)'; g.fillRect(x0, y - z - 1.6, x1 - x0, 0.6);
    for (const x of [x0 - 0.6, x1 + 0.6]) { g.fillStyle = WOOD_DK; g.beginPath(); g.ellipse(x, y - z + 1.2, 1.3, 1.3, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#b08a5c'; g.beginPath(); g.ellipse(x, y - z + 1.2, 0.7, 0.7, 0, 0, Math.PI * 2); g.fill(); }
  }
  for (let x = x0 - 1; x < x1 + 1; x += 3.2) { g.fillStyle = (x | 0) % 2 ? STONE : STONE_TOP; g.beginPath(); g.ellipse(x + 1.4, y - z0 - 0.6, 1.7, 1.2, 0, 0, Math.PI * 2); g.fill(); }
}
// trampled earth under a camp: no slab, just ground worn bare
function yard(g: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  gr.addColorStop(0, 'rgba(70,52,34,0.5)'); gr.addColorStop(0.7, 'rgba(70,52,34,0.28)'); gr.addColorStop(1, 'rgba(70,52,34,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
}
// a cone tent on a ground point: hide panels with seams, a team band, the poles crossing out of the top, the flap open
function tent(g: Ctx, x: number, y: number, r: number, h: number, col: string, team: string) {
  g.fillStyle = 'rgba(20,12,6,0.35)'; g.beginPath(); g.ellipse(x + 2, y + 1, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); g.fill();
  const tg = g.createLinearGradient(x - r, 0, x + r, 0); tg.addColorStop(0, shade(col, 1.18)); tg.addColorStop(0.5, col); tg.addColorStop(1, shade(col, 0.7));
  poly(g, [[x - r, y], [x, y - h], [x + r, y], [x + r * 0.6, y + r * 0.35], [x - r * 0.6, y + r * 0.35]], tg);
  g.strokeStyle = 'rgba(40,24,12,0.45)'; g.lineWidth = 0.5;
  for (const f of [-0.6, -0.2, 0.25, 0.65]) { g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + r * f, y + r * 0.3 * (1 - Math.abs(f))); g.stroke(); }   // panel seams
  poly(g, [[x - r * 0.25, y + r * 0.28], [x, y - h * 0.45], [x + r * 0.25, y + r * 0.28]], '#1c140c', false);   // the flap, open
  fireGlow(g, x, y + r * 0.1, r * 0.5);
  poly(g, [[x - r * 0.72, y - h * 0.28], [x + r * 0.72, y - h * 0.28], [x + r * 0.62, y - h * 0.18], [x - r * 0.62, y - h * 0.18]], team, false);
  g.strokeStyle = WOOD_DK; g.lineWidth = 1.2; g.lineCap = 'round';
  for (const [dx, dy] of [[-3, -5], [0, -6], [3, -4.5]]) { g.beginPath(); g.moveTo(x, y - h + 1); g.lineTo(x + dx, y - h + dy); g.stroke(); }
  smoke(g, x + 1, y - h - 4, 2);
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
// Built on the creature rig like the aliens, so they move and dress like people
// rather than machined troopers: a cloth poncho or cloak over a tunic, a face
// wrap, a hat or hood, old guns held at the hip.

const TROUSER: Tone = { dk: '#3e3424', mid: '#6a5a40', lt: '#8e7c5a', hi: '#b0a080' };
const BOOT: Tone = { dk: '#1e160e', mid: '#3a2c1e', lt: '#5a4430', hi: '#7a6048' };
const SKIN: Tone = { dk: '#5a3a28', mid: '#8a5e44', lt: '#b8866a', hi: '#dcb090' };
const TUNIC: Tone = { dk: '#4a3c2a', mid: '#7a6446', lt: '#a08a66', hi: '#c8b48c' };
const CLOTH: Tone = { dk: '#4e4232', mid: '#86745a', lt: '#ac9a7a', hi: '#d0c0a0' };
const FUR: Tone = { dk: '#3a2c1e', mid: '#6a5236', lt: '#94784e', hi: '#bca070' };
const HAT: Tone = { dk: '#3e2c1a', mid: '#6e5234', lt: '#94744a', hi: '#b89a6a' };
const WOODT: Tone = { dk: '#4a3018', mid: '#7a5028', lt: '#a8743e', hi: '#c89a62' };
const IRONT: Tone = { dk: '#24201c', mid: '#46423c', lt: '#6e6a62', hi: '#9a968e' };

interface Kit { cloak: Tone; cloakTo: number; cloakW: number; head: (P: Part[], z: number) => void; gun: (P: Part[], z: number) => void; bulk?: number; back?: (P: Part[], z: number) => void }
// a walking figure: legs and boots, a tunic, a cloak hanging from the shoulders, arms forward to the gun
function clansman(g: Ctx, a: number, team: string, phase: number, k: Kit) {
  const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.5, b = k.bulk ?? 1, P: Part[] = [];
  shadow(g, 1, 1.5, 6.5 * b, 3);
  for (const sd of [-1, 1]) {
    const [sw, lift] = stride(phase, sd, 1.8, 1);
    const hip: V3 = [0, sd * 1.2 * b, 7 + bob], knee: V3 = [0.6 + sw * 0.5, sd * 1.3 * b, 3.8 + lift], foot: V3 = [sw, sd * 1.3 * b, 0.8 + lift];
    P.push({ k: 'limb', a: hip, b: knee, w: 1.9 * b, w2: 1.5 * b, t: TROUSER }, { k: 'limb', a: knee, b: foot, w: 1.5 * b, w2: 1.2 * b, t: TROUSER });
    P.push({ k: 'blob', c: [foot[0] + 0.5, foot[1], foot[2] - 0.2], rx: 1.2, ry: 0.8, t: BOOT });
  }
  const z = 7 + bob;
  P.push({ k: 'blob', c: [0, 0, z + 3.2], rx: 2.3 * b, ry: 3 * b, t: TUNIC });
  P.push({ k: 'band', a: [0.9, -1.9 * b, z + 5], b: [1.1, 1.9 * b, z + 1.2], w: 0.7, col: '#3a2a1a' });     // a strap across the chest
  P.push({ k: 'cloth', c: [-0.2, 0, z + 5.6], r0: 2.2 * b, z1: z + 5.6 - k.cloakTo, r1: k.cloakW * b, t: k.cloak, trim: team });
  k.back?.(P, z);
  // arms reach forward to the weapon, held at the hip
  for (const sd of [-1, 1]) {
    const sh: V3 = [0.2, sd * 2.3 * b, z + 5], el: V3 = [1.5, sd * 2.4 * b, z + 3], hand: V3 = [sd > 0 ? 3 : 4.8, 1.1, z + 3.4];
    P.push({ k: 'limb', a: sh, b: el, w: 1.4 * b, w2: 1.2 * b, t: k.cloak }, { k: 'limb', a: el, b: hand, w: 1.2 * b, w2: 1, t: SKIN });
  }
  k.gun(P, z);
  P.push({ k: 'blob', c: [0.3, 0, z + 7.6], rx: 1.5, ry: 1.7, t: SKIN });
  P.push({ k: 'band', a: [1.2, -1.1, z + 7.2], b: [1.3, 1.1, z + 7.2], w: 1.2, col: '#8a7a5e' });     // a face wrap over nose and mouth
  k.head(P, z);
  drawRig(g, a, P);
}
// an old long gun: a wooden stock and a dark barrel, lying forward from the hip
const rifle = (len: number, scope = false) => (P: Part[], z: number) => {
  P.push({ k: 'limb', a: [0.6, 1.1, z + 3], b: [3.4, 1.1, z + 3.5], w: 1.3, w2: 1.1, t: WOODT });
  P.push({ k: 'limb', a: [3.4, 1.1, z + 3.5], b: [3.4 + len, 1.1, z + 4.2], w: 0.75, w2: 0.6, t: IRONT });
  if (scope) P.push({ k: 'limb', a: [3.2, 1.1, z + 4.5], b: [6.4, 1.1, z + 4.9], w: 0.8, w2: 0.8, t: { dk: '#6a4a1a', mid: '#a87a32', lt: '#d8aa52', hi: '#ffe090' } });
};
const goggles = (col: string) => (P: Part[], z: number) => { for (const sd of [-0.6, 0.6]) P.push({ k: 'glow', c: [1.6, sd, z + 8], r: 1, col }); };
const brimHat = (P: Part[], z: number) => { P.push({ k: 'plate', c: [0.2, 0, z + 8.8], rx: 3.6, ry: 3.6, h: 0.7, t: HAT }, { k: 'blob', c: [0.1, 0, z + 9.8], rx: 1.7, ry: 1.2, t: HAT }); };
const hood = (t: Tone) => (P: Part[], z: number) => { P.push({ k: 'blob', c: [-0.3, 0, z + 8.4], rx: 2, ry: 2.2, t }); };

const SCAV: Kit = {
  cloak: CLOTH, cloakTo: 4.6, cloakW: 3.8, gun: rifle(7),
  head: (P, z) => { goggles('rgba(255,190,90,0.95)')(P, z); brimHat(P, z); },
  back: (P, z) => P.push({ k: 'limb', a: [-2.6, -2.4, z + 5.6], b: [-2.6, 2.4, z + 5.6], w: 2.2, w2: 2.2, t: { dk: '#5a4a32', mid: '#8a7656', lt: '#b0a080', hi: '#d0c4a4' } }),   // a bedroll
};
const HARPOONER: Kit = {
  cloak: FUR, cloakTo: 3, cloakW: 3.6, bulk: 1.15,
  gun: (P, z) => {   // a harpoon gun on the shoulder, its barb out front, a coil of line on the back
    P.push({ k: 'limb', a: [-2.4, 1.8, z + 6.4], b: [3, 1.8, z + 6.8], w: 2.2, w2: 2, t: IRONT });
    P.push({ k: 'limb', a: [3, 1.8, z + 6.8], b: [6.8, 1.8, z + 7], w: 0.8, w2: 0.5, t: { dk: '#8a8478', mid: '#c0b8a8', lt: '#e0d8c8', hi: '#fff' } });
    for (const sd of [-1, 1]) P.push({ k: 'limb', a: [6.4, 1.8, z + 7], b: [5.4, 1.8 + sd * 1.3, z + 7.3], w: 0.5, w2: 0.3, t: { dk: '#8a8478', mid: '#c0b8a8', lt: '#e0d8c8', hi: '#fff' } });
    P.push({ k: 'blob', c: [-2.8, -0.6, z + 4.6], rx: 1.8, ry: 1.8, t: { dk: '#7a6a44', mid: '#b09a68', lt: '#d8c290', hi: '#f0e0b0' } });
  },
  head: (P, z) => { P.push({ k: 'blob', c: [0.2, 0, z + 8.9], rx: 1.7, ry: 1.1, t: FUR }); goggles('rgba(255,190,90,0.9)')(P, z); },
};
const FIREBRAND: Kit = {
  cloak: { dk: '#4a3018', mid: '#7e5430', lt: '#a8784a', hi: '#c89a6a' }, cloakTo: 4, cloakW: 3.4,
  gun: (P, z) => {   // a bottle bandolier, and one bottle lit in hand
    P.push({ k: 'band', a: [1, 1.9, z + 5.4], b: [1.2, -1.9, z + 1.6], w: 0.9, col: '#4a3a24' });
    for (const t of [0.2, 0.45, 0.7]) P.push({ k: 'glow', c: [1.25, 1.9 - t * 3.8, z + 5.4 - t * 3.8], r: 0.7, col: 'rgba(110,200,130,0.8)' });
    P.push({ k: 'limb', a: [3.2, 2.6, z + 3.6], b: [3.4, 2.6, z + 6.2], w: 1.1, w2: 0.7, t: { dk: '#2a5a3a', mid: '#4a8a5a', lt: '#7ac08a', hi: '#c0f0c8' } });
    P.push({ k: 'glow', c: [3.4, 2.6, z + 6.8], r: 3.2, col: 'rgba(255,150,60,0.9)' });
  },
  head: (P, z) => { hood({ dk: '#3a2414', mid: '#664228', lt: '#8e6440', hi: '#b08660' })(P, z); goggles('rgba(255,140,60,0.95)')(P, z); },
};
const LONGSHOT: Kit = {
  cloak: { dk: '#3a3628', mid: '#625c44', lt: '#86805e', hi: '#a8a07a' }, cloakTo: 9.5, cloakW: 4.4, gun: rifle(10.5, true),
  head: (P, z) => { hood({ dk: '#2a2618', mid: '#4a4430', lt: '#6a6248', hi: '#8a8262' })(P, z); P.push({ k: 'glow', c: [6.6, 1.1, z + 4.9], r: 0.8, col: 'rgba(255,220,140,0.9)' }); },
};
const drawScav = (g: Ctx, a: number, team: string, phase = 0) => clansman(g, a, team, phase, SCAV);
const drawHarpooner = (g: Ctx, a: number, team: string, phase = 0) => clansman(g, a, team, phase, HARPOONER);
const drawFirebrand = (g: Ctx, a: number, team: string, phase = 0) => clansman(g, a, team, phase, FIREBRAND);
const drawLongshot = (g: Ctx, a: number, team: string, phase = 0) => clansman(g, a, team, phase, LONGSHOT);

// ---------------- the pack beast ----------------
// A shaggy, horned hauler native to the crust, on the rig: four thick legs in a
// walking gait, a long-haired body and hump, a clan blanket, a low horned head.
const SHAG: Tone = { dk: '#3e2c1c', mid: '#6e5236', lt: '#9a7a52', hi: '#c0a074' };
function beast(g: Ctx, a: number, x0: number, y0: number, phase: number, team: string) {
  const P: Part[] = [];
  for (const [i, x] of [x0 + 4, x0 - 3].entries()) for (const sd of [-1, 1]) {
    const [sw, lift] = stride(phase, (i + (sd > 0 ? 0 : 1)) % 2 ? 1 : -1, 1.6, 0.9);
    const top: V3 = [x, y0 + sd * 2.2, 6.6], knee: V3 = [x + sw * 0.5 + 0.4, y0 + sd * 2.3, 3.2 + lift], hoof: V3 = [x + sw, y0 + sd * 2.3, 0.4 + lift];
    P.push({ k: 'limb', a: top, b: knee, w: 2.2, w2: 1.6, t: SHAG }, { k: 'limb', a: knee, b: hoof, w: 1.5, w2: 1.2, t: SHAG });
    P.push({ k: 'blob', c: [hoof[0] + 0.2, hoof[1], hoof[2] - 0.1], rx: 1, ry: 0.7, t: BOOT });
  }
  P.push({ k: 'blob', c: [x0, y0, 8], rx: 6.4, ry: 3.6, t: SHAG });
  P.push({ k: 'blob', c: [x0 + 2, y0, 10.4], rx: 3.4, ry: 2.4, t: SHAG });                                          // the hump
  P.push({ k: 'plate', c: [x0 - 2.2, y0, 10.2], rx: 2.4, ry: 3.4, h: 0.8, t: { dk: shade(team, 0.45), mid: shade(team, 0.7), lt: team, hi: shade(team, 1.3) } });   // a clan blanket
  P.push({ k: 'cloth', c: [x0, y0, 7.4], r0: 3.6, z1: 4.6, r1: 4.2, t: SHAG, trim: 'rgba(0,0,0,0)' });               // long hair hanging down the flanks
  P.push({ k: 'limb', a: [x0 + 5.4, y0, 8.6], b: [x0 + 8, y0, 7.4], w: 2.6, w2: 2.2, t: SHAG });                    // the neck, carried low
  P.push({ k: 'blob', c: [x0 + 8.6, y0, 7.2], rx: 2, ry: 1.8, t: { dk: '#2e2216', mid: '#5a4230', lt: '#7e5e42', hi: '#a07e5c' } });
  for (const sd of [-1, 1]) {
    const h0: V3 = [x0 + 8.4, y0 + sd * 1.2, 8.4], h1: V3 = [x0 + 7.2, y0 + sd * 3.2, 9.6], h2: V3 = [x0 + 8.6, y0 + sd * 3.6, 11.2];
    P.push({ k: 'limb', a: h0, b: h1, w: 1, w2: 0.8, t: { dk: '#8a7e66', mid: '#c0b498', lt: '#e0d6bc', hi: '#fff8e8' } }, { k: 'limb', a: h1, b: h2, w: 0.8, w2: 0.3, t: { dk: '#8a7e66', mid: '#c0b498', lt: '#e0d6bc', hi: '#fff8e8' } });
  }
  drawRig(g, a, P);
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

// lived-in clutter round a clan building: crates, barrels, a woodpile, a hanging lantern, hides on a rack
function crate(g: Ctx, x: number, y: number, s = 1) { box(g, 0, x - 2.5 * s, y - 2 * s, x + 2.5 * s, y + 2 * s, 0, 3.6 * s, '#a8824e', '#7a5a34'); g.strokeStyle = 'rgba(40,24,10,0.6)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x - 2.5 * s, y + 2 * s - 3.6 * s); g.lineTo(x + 2.5 * s, y + 2 * s); g.stroke(); }
function barrel(g: Ctx, x: number, y: number, col = RUST) { cylinder(g, x, y, 2, 0, 5, shade(col, 1.25), col); g.strokeStyle = 'rgba(30,20,12,0.6)'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(x, y - 2.5, 2, 0.8, 0, 0, Math.PI); g.stroke(); }
function woodpile(g: Ctx, x: number, y: number) { for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) { const cx = x + k * 2.6 + r * 1.3, cy = y - r * 2; g.fillStyle = '#6a4a2c'; g.beginPath(); g.ellipse(cx, cy, 1.4, 1.2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c09a6a'; g.beginPath(); g.ellipse(cx, cy, 0.8, 0.7, 0, 0, Math.PI * 2); g.fill(); } }
function lantern(g: Ctx, x: number, y: number) { g.strokeStyle = '#2a241c'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y - 1.6); g.stroke(); g.fillStyle = '#3a3228'; g.fillRect(x - 1, y - 1.6, 2, 2.6); fireGlow(g, x, y - 0.3, 4); }
function hideRack(g: Ctx, x: number, y: number, team: string) {
  g.strokeStyle = WOOD_DK; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 10); g.moveTo(x + 10, y); g.lineTo(x + 10, y - 10); g.moveTo(x - 0.5, y - 9.5); g.lineTo(x + 10.5, y - 9.5); g.stroke();
  poly(g, [[x + 1, y - 9], [x + 4.5, y - 9], [x + 5, y - 3], [x + 3, y - 1.5], [x + 1.5, y - 3]], HIDE);
  poly(g, [[x + 5.5, y - 9], [x + 9, y - 9], [x + 8.5, y - 4], [x + 6, y - 2.5]], team);
}
function smoke(g: Ctx, x: number, y: number, n = 3) { for (let k = 0; k < n; k++) { g.fillStyle = `rgba(90,84,80,${0.28 - k * 0.07})`; g.beginPath(); g.ellipse(x + k * 2.2, y - k * 5, 2.6 + k * 1.4, 2 + k, 0, 0, Math.PI * 2); g.fill(); } }

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
  logWall(g, 14, 82, 72, 2, 26);
  // roof: thatch over timber, with a colony hull plate laid along the ridge
  roof(g, 10, 22, 86, 76, 26, 48, 'thatch', team);
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
  // the yard: firewood, crates, barrels, hides drying, lanterns either side of the door, smoke from the roof
  woodpile(g, 62, 86); crate(g, 22, 88); crate(g, 27, 90, 0.8); barrel(g, 72, 84); barrel(g, 76, 87, IRON);
  hideRack(g, 82, 80, team);
  lantern(g, 36, 50); lantern(g, 60, 50);
  smoke(g, 34, 40); smoke(g, 62, 40);
  // patched hide and plank seams across the front wall
  poly(g, [[18, 48], [28, 47], [29, 58], [18, 59]], HIDE_DK); poly(g, [[68, 50], [78, 50], [78, 60], [68, 61]], HIDE);
  g.fillStyle = 'rgba(30,18,10,0.6)'; for (const x of [19, 27, 69, 77]) for (const y of [49, 57]) g.fillRect(x, y, 0.8, 0.8);
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
  roof(g, 10, 12, 52, 56, 24, 34, 'tin', team);
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
  // slag cooling in a heap, a bucket of ore, sparks from the mouth, smoke from the stack, blocks marked in the stone
  for (const [x, y, r] of [[56, 54, 4], [61, 56, 3], [52, 57, 2.5]] as number[][]) { g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,120,40,0.6)'; g.fillRect(x - 0.6, y - 0.6, 1.2, 0.8); }
  barrel(g, 8, 56, IRON); crate(g, 6, 48, 0.8);
  for (const [x, y] of [[29, 36], [33, 33], [36, 37], [27, 32]] as Pt[]) { g.fillStyle = '#ffd080'; g.fillRect(x, y, 1, 1); }
  smoke(g, 18, -28, 4);
  g.strokeStyle = 'rgba(30,26,22,0.4)'; g.lineWidth = 0.5;
  for (let y = 30; y < 52; y += 6) { g.beginPath(); g.moveTo(12, y); g.lineTo(24, y); g.moveTo(38, y); g.lineTo(50, y); g.stroke(); }
  g.restore();
}

function drawLonghouse(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  yard(g, 3, 8, 61, 61);
  const body: Pt[] = [[10, 22], [54, 22], [54, 50], [10, 50]];
  timber(g, body, 1.5, 16);
  logWall(g, 10, 54, 50, 1.5, 16);
  roof(g, 7, 18, 57, 54, 16, 30, 'hide', team);
  quad(g, [26, 50 - 13], [36, 50 - 13], [36, 50 - 1.5], [26, 50 - 1.5], '#1c140c');
  fireGlow(g, 31, 50 - 5, 5);
  quad(g, [24, 50 - 15], [38, 50 - 15], [38, 50 - 13], [24, 50 - 13], team, false);
  // a weapon rack by the door
  for (let k = 0; k < 4; k++) { g.strokeStyle = k % 2 ? '#5a5650' : '#8a6038'; g.lineWidth = 1; g.beginPath(); g.moveTo(42 + k * 2.4, 56); g.lineTo(43 + k * 2.4, 44); g.stroke(); }
  box(g, 0, 41, 54, 52, 56, 0, 3, WOOD_TOP, WOOD);
  if (level >= 2) sandbags(g, 10, 58, 3, 2);
  if (level >= 3) banner(g, 14, 26, 30, team);
  // firewood stacked by the wall, a hide drying, a lantern, smoke from the roof
  woodpile(g, 12, 58); hideRack(g, 48, 46, team); lantern(g, 24, 34); smoke(g, 30, 4);
  crate(g, 56, 56, 0.8);
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
  roof(g, 8, 14, 42, 48, 18, 26, 'tin', team);
  quad(g, [16, 44 - 12], [34, 44 - 12], [34, 44 - 3], [16, 44 - 3], '#2a1206');
  fireGlow(g, 25, 44 - 7, 9);
  cylinder(g, 32, 22, 3.5, 18, 40, STONE_TOP, STONE);
  // the anvil, the quench barrel, a bellows of stitched hide
  box(g, 0, 44, 46, 54, 50, 1.5, 7, IRON_TOP, IRON);
  cylinder(g, 50, 32, 4, 1.5, 9, '#3a5a6a', WOOD);
  poly(g, [[6, 46], [14, 44], [14, 52], [6, 52]], HIDE);
  quad(g, [10, 44 - 20], [40, 44 - 20], [40, 44 - 18], [10, 44 - 18], team, false);
  // hammers and tongs on the wall, a bucket of quench water, sparks off the anvil, smoke from the chimney
  g.strokeStyle = '#3a3632'; g.lineWidth = 0.9;
  for (const x of [14, 18, 22]) { g.beginPath(); g.moveTo(x, 44 - 16); g.lineTo(x, 44 - 9); g.stroke(); g.fillStyle = '#5a5650'; g.fillRect(x - 1.5, 44 - 17, 3, 1.6); }
  for (const [x, y] of [[48, 40], [51, 37], [46, 36], [53, 41], [49, 34]] as Pt[]) { g.fillStyle = '#ffd890'; g.fillRect(x, y, 0.9, 0.9); }
  smoke(g, 32, -22, 3); crate(g, 56, 52, 0.7);
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
  // a painted stripe and a hand-stitched mark on the canvas, a crate of supplies, a water barrel, a lantern by the flap
  quad(g, [20, 48 - 16], [26, 48 - 16], [26, 48 - 10], [20, 48 - 10], '#eee2c8', false);
  g.fillStyle = team; g.fillRect(22, 48 - 15, 2, 4); g.fillRect(21, 48 - 14, 4, 2);
  crate(g, 50, 56, 0.9); barrel(g, 56, 50, '#5a6a72'); lantern(g, 26, 36);
  g.strokeStyle = 'rgba(90,80,60,0.5)'; g.lineWidth = 0.5;
  for (const x of [16, 30, 44]) { g.beginPath(); g.moveTo(x, 48 - 10); g.lineTo(x + 1, 48 - 24); g.stroke(); }   // canvas seams
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
  scav:       { hull: drawScav,      reach: 12, height: 20, frames: 4, turn: 10 },
  harpooner:  { hull: drawHarpooner, reach: 12, height: 20, frames: 4, turn: 10 },
  firebrand:  { hull: drawFirebrand, reach: 10, height: 20, frames: 4, turn: 10 },
  longshot:   { hull: drawLongshot,  reach: 16, height: 20, frames: 4, turn: 10 },
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
