// The Hollow, as a faction: the Meridian's grandchildren, grown through with
// the Vey's crystal. Pale quartz and cyan light, with scraps of the old colony
// ship (hull plate, cable, a faded stencil) built into everything. Same
// conventions as art.ts; this module adds itself to art.ts's registries.

import { VEHICLE_ART, BUILDING_ART, TURRET_ART } from './art';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

const QUARTZ = { dk: '#6f8c92', mid: '#a6bcc0', lt: '#e2f2f2' };
const CRY = { hi: '#e8fffd', lt: '#8ef4f0', mid: '#46c4c8', dk: '#1d7682' };
const ROCK = { dk: '#2c2a30', mid: '#4a4650', lt: '#6e6874' };
const HULL = '#8e8a80';

const rotP = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
function blob(g: Ctx, x: number, y: number, rx: number, ry: number, rot: number, t: { dk: string; mid: string; lt: string }) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const gr = g.createRadialGradient(-rx * 0.35, -ry * 0.45, Math.min(rx, ry) * 0.1, 0, 0, Math.max(rx, ry));
  gr.addColorStop(0, t.lt); gr.addColorStop(0.6, t.mid); gr.addColorStop(1, t.dk);
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(10,20,24,0.5)'; g.lineWidth = 0.7; g.stroke();
  g.restore();
}
function shard(g: Ctx, x: number, y: number, h: number, w: number, lean = 0) {
  const tx = x + lean * h, ty = y - h;
  g.fillStyle = CRY.dk; g.beginPath(); g.moveTo(x - w, y); g.lineTo(tx, ty); g.lineTo(x, y + w * 0.35); g.closePath(); g.fill();
  g.fillStyle = CRY.mid; g.beginPath(); g.moveTo(x, y + w * 0.35); g.lineTo(tx, ty); g.lineTo(x + w, y); g.closePath(); g.fill();
  g.strokeStyle = CRY.hi; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + w * 0.2, y); g.lineTo(tx, ty); g.stroke();
}
function shadow(g: Ctx, rx: number, ry: number) {
  g.fillStyle = 'rgba(6,10,12,0.32)'; g.beginPath(); g.ellipse(1.5, 1.5, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

// ---------------- units ----------------

function drawDelver(g: Ctx, a: number, team: string, phase = 0) {
  // a long, low runner on all fours, a ridge of crystal down its spine
  const t = phase * Math.PI * 2, z = 5 + Math.abs(Math.sin(t)) * 0.8;
  shadow(g, 11, 5);
  const limb = (x: number, side: number, ph: number) => {
    const sw = Math.sin(t + ph) * 2.4, [hx, hy] = rotP(x, side * 2.5, a), [fx, fy] = rotP(x + sw, side * 5, a);
    g.strokeStyle = QUARTZ.dk; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy - z); g.lineTo((hx + fx) / 2, (hy + fy) / 2 - z * 0.4); g.lineTo(fx, fy); g.stroke();
  };
  const near = (side: number) => rotP(0, side, a)[1] > 0;
  for (const [x, sd, ph] of [[5, -1, 0], [5, 1, Math.PI], [-5, -1, Math.PI], [-5, 1, 0]] as number[][]) if (!near(sd)) limb(x, sd, ph);
  const [bx, by] = rotP(-1, 0, a);
  blob(g, bx, by - z, 10, 3.6, a, QUARTZ);
  for (const x of [-6, -3, 0, 3]) { const [sx, sy] = rotP(x, 0, a); shard(g, sx, sy - z - 2, 4 + (x + 6) * 0.3, 1.2, -0.2 * Math.cos(a)); }
  const [hx, hy] = rotP(9, 0, a); blob(g, hx, hy - z, 3, 2.4, a, QUARTZ);
  glowAt(g, hx + Math.cos(a) * 1.5, hy - z - 0.5, 2.5, 'rgba(150,255,245,0.8)');
  const [cx, cy] = rotP(-4, 0, a); g.strokeStyle = team; g.lineWidth = 1.1; g.beginPath(); g.moveTo(cx - 2, cy - z - 1); g.lineTo(cx + 2, cy - z - 1.5); g.stroke();   // a strip of old colony cloth
  for (const [x, sd, ph] of [[5, -1, 0], [5, 1, Math.PI], [-5, -1, Math.PI], [-5, 1, 0]] as number[][]) if (near(sd)) limb(x, sd, ph);
}

function drawCairn(g: Ctx, a: number, team: string, phase = 0) {
  // a walking pile of stones bound in crystal, a scrap of hull plate for a shield
  const t = phase * Math.PI * 2, z = 4 + Math.abs(Math.sin(t)) * 1;
  shadow(g, 15, 8);
  for (const sd of [-1, 1]) {
    const sw = Math.sin(t + (sd > 0 ? 0 : Math.PI)) * 3, [fx, fy] = rotP(sw, sd * 7, a);
    blob(g, fx, fy - 3, 4, 3, 0, ROCK);
  }
  const [bx, by] = rotP(0, 0, a);
  blob(g, bx, by - z - 10, 11, 10, 0, ROCK);
  blob(g, bx - 2, by - z - 22, 7, 6, 0.4, ROCK);
  for (const [x, y, h, lean] of [[-6, -14, 12, -0.3], [4, -16, 15, 0.1], [0, -26, 10, 0], [7, -10, 8, 0.4]] as number[][]) shard(g, bx + x, by - z + y, h, 2.4, lean);
  glowAt(g, bx, by - z - 14, 14, 'rgba(140,255,245,0.35)');
  const [px, py] = rotP(8, -4, a);
  g.fillStyle = HULL; g.beginPath(); g.moveTo(px - 4, py - z - 18); g.lineTo(px + 4, py - z - 20); g.lineTo(px + 4, py - z - 6); g.lineTo(px - 4, py - z - 4); g.closePath(); g.fill();
  g.fillStyle = team; g.fillRect(px - 3, py - z - 14, 6, 1.6);
}

// ---------------- structures ----------------

function drawHearthstone(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  // a crystal-lit cave mouth in a mound of rock, colony hull plates for a lintel
  blob(g, 48, 58, 44, 26, 0, ROCK);
  blob(g, 48, 46, 34, 22, 0, { dk: ROCK.mid, mid: ROCK.lt, lt: '#8a8490' });
  g.fillStyle = '#0c1416'; g.beginPath(); g.ellipse(48, 60, 16, 12, 0, Math.PI, 0); g.lineTo(64, 70); g.lineTo(32, 70); g.closePath(); g.fill();
  glowAt(g, 48, 62, 22, 'rgba(140,255,245,0.55)');
  g.fillStyle = HULL; g.beginPath(); g.moveTo(28, 46); g.lineTo(68, 44); g.lineTo(68, 50); g.lineTo(28, 52); g.closePath(); g.fill();
  g.fillStyle = 'rgba(30,40,60,0.55)'; g.font = '700 4px system-ui, sans-serif'; g.fillText('MERIDIAN', 38, 50);
  for (const [x, y, h, lean] of [[14, 56, 18, -0.3], [82, 54, 20, 0.3], [30, 34, 14, -0.1], [66, 32, 16, 0.15], [48, 26, 22, 0]] as number[][]) shard(g, x, y, h, 3.4, lean);
  glowAt(g, 48, 30, 30, team + '50');
  if (level >= 2) shard(g, 22, 70, 12, 3, -0.2);
  if (level >= 3) shard(g, 74, 72, 14, 3, 0.2);
  g.restore();
}

function drawTunnelMouth(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  blob(g, 32, 42, 26, 14, 0, ROCK);
  g.fillStyle = '#081012'; g.beginPath(); g.ellipse(32, 42, 15, 8, 0, 0, Math.PI * 2); g.fill();
  glowAt(g, 32, 42, 14, 'rgba(120,240,235,0.5)');
  for (let k = 0; k < 7; k++) { const t = k / 7 * Math.PI * 2; shard(g, 32 + Math.cos(t) * 17, 42 + Math.sin(t) * 9, 6 + (k % 3) * 2, 1.8, Math.cos(t) * 0.3); }
  g.strokeStyle = '#3a3c44'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(12, 30); g.quadraticCurveTo(32, 20, 52, 30); g.stroke();   // salvaged cable for a handhold
  g.fillStyle = team; g.fillRect(29, 22, 6, 2);
  g.restore();
}

function drawGeode(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  // a stone split open, a cavity of crystal singing inside it
  blob(g, 22, 40, 14, 12, -0.3, ROCK);
  blob(g, 42, 40, 14, 12, 0.3, ROCK);
  g.fillStyle = '#0e2226'; g.beginPath(); g.ellipse(32, 38, 9, 10, 0, 0, Math.PI * 2); g.fill();
  for (const [x, y, h, lean] of [[28, 44, 14, -0.2], [32, 46, 20, 0], [36, 44, 15, 0.2], [30, 40, 9, -0.4], [35, 41, 10, 0.4]] as number[][]) shard(g, x, y, h, 2.4, lean);
  glowAt(g, 32, 34, 20, 'rgba(150,255,245,0.6)');
  glowAt(g, 32, 34, 26, team + '40');
  g.restore();
}

function drawGrotto(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  // a low arch of rock over a lit hollow; stacked colony data-slates and a lamp inside
  blob(g, 32, 40, 28, 18, 0, ROCK);
  g.fillStyle = '#10181a'; g.beginPath(); g.ellipse(32, 46, 14, 9, 0, Math.PI, 0); g.lineTo(46, 52); g.lineTo(18, 52); g.closePath(); g.fill();
  glowAt(g, 32, 46, 14, 'rgba(255,220,150,0.5)');
  for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? HULL : '#6e6a62'; g.fillRect(24 + k * 4, 46 - k * 1.5, 3, 5 + k * 1.5); }
  for (const [x, y, h] of [[10, 40, 12], [54, 38, 14], [32, 22, 10]] as number[][]) shard(g, x, y, h, 2.6, 0);
  g.fillStyle = team; g.fillRect(28, 28, 8, 2);
  g.restore();
}

function drawEcho(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  blob(g, 16, 25, 9, 5, 0, ROCK);
  shard(g, 16, 24, 14, 3.4, 0);
  glowAt(g, 16, 14, 8, team + '50');
  g.restore();
}
function drawEchoHead(g: Ctx, a: number, _team: string) {
  // a ring of crystal tines around a singing point of light, turned toward its target
  const z = 18;
  for (let k = 0; k < 5; k++) {
    const ang = a + (k - 2) * 0.45, [x, y] = rotP(4, 0, ang);
    shard(g, x, y - z + 2, 6, 1.1, Math.cos(ang) * 0.4);
  }
  glowAt(g, 0, -z - 2, 6, 'rgba(170,255,250,0.85)');
  g.fillStyle = CRY.hi; g.beginPath(); g.arc(0, -z - 2, 1.4, 0, Math.PI * 2); g.fill();
}

Object.assign(VEHICLE_ART, {
  delver: { hull: drawDelver, reach: 13, height: 14, frames: 4, turn: 8 },
  cairn:  { hull: drawCairn,  reach: 17, height: 42, frames: 4, turn: 2.5 },
});
Object.assign(BUILDING_ART, {
  hearthstone: drawHearthstone, tunnelmouth: drawTunnelMouth, geode: drawGeode, grotto: drawGrotto, echo: drawEcho,
});
Object.assign(TURRET_ART, {
  echo: { head: drawEchoHead, pivot: [16, 14], reach: 8, height: 24 },
});
