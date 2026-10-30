// The Keepers: the race that planted the Vey. Their things are the opposite of
// the brood's: still, precise and lit — polished gold and ivory in long tapering
// curves, crystal set into them like jewels, nothing touching the ground that
// doesn't have to. Same conventions as art.ts (units around their ground point
// with heading `a`, screen y minus height; structures on their footprint).

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
interface Tone { dk: string; mid: string; lt: string; hi: string }

const GOLD: Tone = { dk: '#7a5820', mid: '#c49a4a', lt: '#f0d48a', hi: '#fff6dc' };
const IVORY: Tone = { dk: '#8c8678', mid: '#cdc6b4', lt: '#f2ecdf', hi: '#ffffff' };
const CRY = { lt: '#a8fbf6', mid: '#4fd2d6', dk: '#1c7c88' };

const rotP = (x: number, y: number, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
// a polished surface: a vertical sheen from dark base to bright top
function sheen(g: Ctx, x0: number, y0: number, x1: number, y1: number, t: Tone) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, t.dk); gr.addColorStop(0.45, t.mid); gr.addColorStop(0.8, t.lt); gr.addColorStop(1, t.hi);
  return gr;
}
function poly(g: Ctx, pts: Pt[], fill: string | CanvasGradient, edge = 'rgba(40,28,8,0.55)') {
  g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath(); g.fill();
  g.strokeStyle = edge; g.lineWidth = 0.6; g.stroke();
}
// an inset crystal: a small faceted lozenge with a glow
function jewel(g: Ctx, x: number, y: number, r: number) {
  poly(g, [[x, y - r * 1.3], [x + r, y], [x, y + r * 0.8], [x - r, y]], CRY.mid, 'rgba(8,40,44,0.6)');
  g.fillStyle = CRY.lt; g.beginPath(); g.moveTo(x, y - r * 1.3); g.lineTo(x + r * 0.5, y - r * 0.2); g.lineTo(x, y); g.closePath(); g.fill();
  glowAt(g, x, y - r * 0.3, r * 3, 'rgba(140,255,250,0.45)');
}
// the hover glow every Keeper unit floats on
function hoverPool(g: Ctx, rx: number, ry: number, team: string) {
  g.fillStyle = 'rgba(10,8,4,0.25)'; g.beginPath(); g.ellipse(2, 2, rx, ry, 0, 0, Math.PI * 2); g.fill();
  glowAt(g, 0, 0, rx * 1.1, team + '55');
}

// --------------------------------------------------------------------------
// units

function drawAcolyte(g: Ctx, a: number, team: string, phase = 0) {
  const bob = Math.sin(phase * Math.PI * 2) * 0.8, z = 5 + bob;
  hoverPool(g, 6, 3.5, team);
  // a tall tapering robe-body of ivory, gold mantle across the shoulders
  const [cx, cy] = rotP(0, 0, a);
  poly(g, [[cx - 3.6, cy - z], [cx + 3.6, cy - z], [cx + 2.2, cy - z - 13], [cx - 2.2, cy - z - 13]], sheen(g, cx, cy - z, cx, cy - z - 13, IVORY));
  poly(g, [[cx - 4.6, cy - z - 11], [cx + 4.6, cy - z - 11], [cx + 3, cy - z - 15], [cx - 3, cy - z - 15]], sheen(g, cx, cy - z - 11, cx, cy - z - 15, GOLD));
  // an elongated head with a crystal crest
  g.fillStyle = sheen(g, cx, cy - z - 15, cx, cy - z - 21, IVORY);
  g.beginPath(); g.ellipse(cx, cy - z - 18, 2.2, 3.3, 0, 0, Math.PI * 2); g.fill();
  jewel(g, cx - 0.6, cy - z - 21.5, 1.3);
  const [ex, ey] = rotP(1.6, 0, a);
  g.fillStyle = '#9ffcf6'; g.fillRect(ex - 0.5, ey - z - 18.5, 1.6, 0.9);    // eyes, on the way it faces
  // the rifle: a thin gold rod with a sun-bright tip
  const [r0x, r0y] = rotP(1, 2.6, a), [r1x, r1y] = rotP(10, 2.6, a);
  g.strokeStyle = GOLD.dk; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(r0x, r0y - z - 9); g.lineTo(r1x, r1y - z - 9); g.stroke();
  g.strokeStyle = GOLD.lt; g.lineWidth = 0.7; g.stroke();
  glowAt(g, r1x, r1y - z - 9, 3.5, 'rgba(255,240,190,0.8)');
  // team colour as a sash of light
  g.strokeStyle = team; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(cx - 3, cy - z - 4); g.lineTo(cx + 3, cy - z - 9); g.stroke();
}

function drawLancer(g: Ctx, a: number, team: string) {
  const z = 6;
  hoverPool(g, 13, 7, team);
  // a long blade-like skimmer, sharp at the nose, swept back at the tail
  const hull: Pt[] = [[17, 0], [6, -4.5], [-10, -6.5], [-13, -2.5], [-13, 2.5], [-10, 6.5], [6, 4.5]];
  const lower = hull.map(([x, y]) => { const p = rotP(x, y, a); return [p[0], p[1] - z + 1.5] as Pt; });
  const upper = hull.map(([x, y]) => { const p = rotP(x * 0.92, y * 0.78, a); return [p[0], p[1] - z - 2] as Pt; });
  poly(g, lower, IVORY.dk);
  poly(g, upper, sheen(g, upper[3][0], upper[3][1], upper[0][0], upper[0][1], GOLD));
  // an ivory canopy ridge and a jewel at its heart
  const ridge = [rotP(12, 0, a), rotP(-8, 0, a)];
  g.strokeStyle = IVORY.lt; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ridge[0][0], ridge[0][1] - z - 3); g.lineTo(ridge[1][0], ridge[1][1] - z - 3); g.stroke();
  const [jx, jy] = rotP(1, 0, a); jewel(g, jx, jy - z - 3.5, 1.6);
  // the lance: a spear of light along the nose
  const [l0x, l0y] = rotP(10, 0, a), [l1x, l1y] = rotP(24, 0, a);
  g.strokeStyle = 'rgba(255,245,210,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(l0x, l0y - z - 1); g.lineTo(l1x, l1y - z - 1); g.stroke();
  glowAt(g, l1x, l1y - z - 1, 4, 'rgba(255,235,170,0.7)');
  // twin engines of cyan light at the tail, team stripes on the wings
  for (const sd of [-1, 1]) {
    const [ex, ey] = rotP(-13, sd * 3.5, a);
    glowAt(g, ex, ey - z, 5, 'rgba(120,240,255,0.8)');
    const [w0x, w0y] = rotP(-6, sd * 5.5, a), [w1x, w1y] = rotP(2, sd * 4, a);
    g.strokeStyle = team; g.lineWidth = 1.2; g.beginPath(); g.moveTo(w0x, w0y - z - 2); g.lineTo(w1x, w1y - z - 2); g.stroke();
  }
}

function drawLuminar(g: Ctx, a: number, team: string, phase = 0) {
  // an orb inside slowly turning rings
  const spin = phase * Math.PI * 2;
  for (const [rx, ry, tilt, col] of [[11, 3.2, spin, GOLD.mid], [9, 4, -spin * 0.7 + 1, GOLD.lt]] as [number, number, number, string][]) {
    g.save(); g.rotate(tilt * 0.2);
    g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  const og = g.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 5.5);
  og.addColorStop(0, '#ffffff'); og.addColorStop(0.4, '#bffaf6'); og.addColorStop(1, '#2a9aa6');
  g.fillStyle = og; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
  glowAt(g, 0, 0, 14, team + '80');
  for (let k = 0; k < 3; k++) { const ang = spin + k * 2.094 + a; jewel(g, Math.cos(ang) * 10, Math.sin(ang) * 3, 1); }
}

function drawMonolith(g: Ctx, a: number, team: string, phase = 0) {
  const bob = Math.sin(phase * Math.PI * 2) * 1.2, z = 8 + bob;
  hoverPool(g, 15, 8, team);
  // floating segments of a great tapering obelisk, a seam of light up its face
  const segs: [number, number, number][] = [[0, 10, 9], [11, 22, 7.5], [23, 34, 6], [35, 44, 4]];
  for (const [z0, z1, half] of segs) {
    const lo = [rotP(-half, -half * 0.7, a), rotP(half, -half * 0.7, a), rotP(half, half * 0.7, a), rotP(-half, half * 0.7, a)];
    const top = (z1 - z0) * 0.12;
    poly(g, [[lo[0][0], lo[0][1] - z - z0], [lo[1][0], lo[1][1] - z - z0], [lo[1][0] * 0.9, lo[1][1] * 0.9 - z - z1 + top], [lo[0][0] * 0.9, lo[0][1] * 0.9 - z - z1 + top]], sheen(g, 0, -z - z0, 0, -z - z1, IVORY));
    poly(g, [[lo[1][0], lo[1][1] - z - z0], [lo[2][0], lo[2][1] - z - z0], [lo[2][0] * 0.9, lo[2][1] * 0.9 - z - z1 + top], [lo[1][0] * 0.9, lo[1][1] * 0.9 - z - z1 + top]], sheen(g, 0, -z - z0, 0, -z - z1, GOLD));
    poly(g, [[lo[2][0], lo[2][1] - z - z0], [lo[3][0], lo[3][1] - z - z0], [lo[3][0] * 0.9, lo[3][1] * 0.9 - z - z1 + top], [lo[2][0] * 0.9, lo[2][1] * 0.9 - z - z1 + top]], sheen(g, 0, -z - z0, 0, -z - z1, GOLD));
  }
  const [fx, fy] = rotP(5, 0, a);
  g.strokeStyle = 'rgba(160,255,250,0.85)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(fx, fy - z - 2); g.lineTo(fx * 0.6, fy * 0.6 - z - 42); g.stroke();
  glowAt(g, fx * 0.8, fy * 0.8 - z - 22, 10, team + '70');
  jewel(g, 0, -z - 47, 2.6);
}


// a robed Keeper figure (shared by Seraph and Oracle): ivory body, gold mantle, crested head
function robed(g: Ctx, a: number, z: number, wide: number, tall: number) {
  const [cx, cy] = rotP(0, 0, a);
  poly(g, [[cx - wide, cy - z], [cx + wide, cy - z], [cx + wide * 0.6, cy - z - tall], [cx - wide * 0.6, cy - z - tall]], sheen(g, cx, cy - z, cx, cy - z - tall, IVORY));
  poly(g, [[cx - wide - 1, cy - z - tall + 2], [cx + wide + 1, cy - z - tall + 2], [cx + wide * 0.8, cy - z - tall - 2], [cx - wide * 0.8, cy - z - tall - 2]], sheen(g, cx, cy - z - tall + 2, cx, cy - z - tall - 2, GOLD));
  g.fillStyle = sheen(g, cx, cy - z - tall - 2, cx, cy - z - tall - 8, IVORY);
  g.beginPath(); g.ellipse(cx, cy - z - tall - 5, 2.2, 3.3, 0, 0, Math.PI * 2); g.fill();
  jewel(g, cx - 0.6, cy - z - tall - 8.5, 1.3);
  const [ex, ey] = rotP(1.6, 0, a);
  g.fillStyle = '#9ffcf6'; g.fillRect(ex - 0.5, ey - z - tall - 5.5, 1.6, 0.9);
  return { cx, cy };
}

function drawSeraph(g: Ctx, a: number, team: string, phase = 0) {
  const z = 5 + Math.sin(phase * Math.PI * 2) * 0.8;
  hoverPool(g, 7, 4, team);
  // a shield of light around it, then the figure, a blade of light in each hand
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,230,160,0.35)'; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(0, -z - 9, 8, 12, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  const { cx, cy } = robed(g, a, z, 4, 13);
  for (const sd of [-1, 1]) {
    const [h0x, h0y] = rotP(2, sd * 4, a), [h1x, h1y] = rotP(8, sd * 6, a);
    g.strokeStyle = 'rgba(255,245,210,0.95)'; g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(h0x, h0y - z - 8); g.lineTo(h1x, h1y - z - 12); g.stroke();
    glowAt(g, h1x, h1y - z - 12, 3.5, 'rgba(255,230,160,0.8)');
  }
  g.strokeStyle = team; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 3, cy - z - 4); g.lineTo(cx + 3, cy - z - 9); g.stroke();
}

function drawOracle(g: Ctx, a: number, team: string, phase = 0) {
  const z = 6 + Math.sin(phase * Math.PI * 2) * 0.6;
  hoverPool(g, 6, 3.5, team);
  const { cx, cy } = robed(g, a, z, 3.2, 15);
  // a tall staff topped with a seeing-eye crystal, held out in front
  const [s0x, s0y] = rotP(3, 2.4, a);
  g.strokeStyle = GOLD.dk; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s0x, s0y - z); g.lineTo(s0x, s0y - z - 27); g.stroke();
  g.strokeStyle = GOLD.lt; g.lineWidth = 0.6; g.stroke();
  jewel(g, s0x, s0y - z - 28, 2.2);
  glowAt(g, s0x, s0y - z - 28, 7, 'rgba(160,255,250,0.6)');
  g.strokeStyle = team; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 3, cy - z - 4); g.lineTo(cx + 3, cy - z - 10); g.stroke();
}

function drawHerald(g: Ctx, a: number, team: string) {
  // a slim gold dart with swept wings and a cyan engine trail
  const hull: Pt[] = [[13, 0], [3, -2.5], [-4, -9], [-7, -8.5], [-4, -2], [-9, 0], [-4, 2], [-7, 8.5], [-4, 9], [3, 2.5]];
  const pts = hull.map(([x, y]) => rotP(x, y, a));
  poly(g, pts, sheen(g, pts[5][0], pts[5][1], pts[0][0], pts[0][1], GOLD));
  const [r0x, r0y] = rotP(11, 0, a), [r1x, r1y] = rotP(-6, 0, a);
  g.strokeStyle = IVORY.lt; g.lineWidth = 1.2; g.beginPath(); g.moveTo(r0x, r0y); g.lineTo(r1x, r1y); g.stroke();
  const [jx, jy] = rotP(3, 0, a); jewel(g, jx, jy, 1.3);
  for (const sd of [-1, 1]) { const [wx, wy] = rotP(-4, sd * 6, a); g.fillStyle = team; g.beginPath(); g.arc(wx, wy, 1.1, 0, Math.PI * 2); g.fill(); }
  const [ex, ey] = rotP(-10, 0, a); glowAt(g, ex, ey, 7, 'rgba(120,240,255,0.8)');
}

function drawArbiter(g: Ctx, a: number, team: string, phase = 0) {
  // a great floating lens in a gold ring, three ivory vanes under it
  const bob = Math.sin(phase * Math.PI * 2) * 1.4, z = 12 + bob;
  hoverPool(g, 13, 7, team);
  for (let k = 0; k < 3; k++) {
    const ang = a + k * 2.094, [vx, vy] = rotP(9, 0, ang);
    poly(g, [[vx * 0.3, vy * 0.3 - z + 2], [vx, vy - z + 6], [vx * 0.8, vy * 0.8 - z - 1]], sheen(g, vx, vy - z + 6, vx, vy - z - 1, IVORY));
  }
  g.strokeStyle = sheen(g, 0, -z - 22, 0, -z, GOLD); g.lineWidth = 3.4;
  g.beginPath(); g.ellipse(0, -z - 12, 10, 11, 0, 0, Math.PI * 2); g.stroke();
  const lg = g.createRadialGradient(-2, -z - 14, 1, 0, -z - 12, 9);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.5, 'rgba(255,240,190,0.85)'); lg.addColorStop(1, 'rgba(255,200,110,0.35)');
  g.fillStyle = lg; g.beginPath(); g.ellipse(0, -z - 12, 8.5, 9.5, 0, 0, Math.PI * 2); g.fill();
  glowAt(g, 0, -z - 12, 18, team + '60');
  jewel(g, 0, -z - 25, 1.8);
}

export interface KeeperUnitArt { hull: (g: Ctx, a: number, team: string, phase?: number) => void; reach: number; height: number; frames?: number; turn?: number }
export const KEEPER_UNIT_ART: Record<string, KeeperUnitArt> = {
  acolyte:  { hull: drawAcolyte,  reach: 11, height: 30, frames: 4, turn: 8 },
  lancer:   { hull: drawLancer,   reach: 24, height: 14, turn: 6 },
  luminar:  { hull: drawLuminar,  reach: 14, height: 8, frames: 4, turn: 4 },
  monolith: { hull: drawMonolith, reach: 18, height: 62, frames: 4, turn: 2 },
  seraph:   { hull: drawSeraph,   reach: 12, height: 30, frames: 4, turn: 8 },
  oracle:   { hull: drawOracle,   reach: 11, height: 36, frames: 4, turn: 8 },
  herald:   { hull: drawHerald,   reach: 14, height: 8, turn: 7 },
  arbiter:  { hull: drawArbiter,  reach: 14, height: 40, frames: 4, turn: 2.5 },
};

// --------------------------------------------------------------------------
// structures

function petals(g: Ctx, cx: number, cy: number, r: number, n: number) {
  // a base like an opening flower in gold, laid flat on the ground
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
    poly(g, [[cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r * 0.55], [cx + Math.cos(a1) * r * 1.12, cy + Math.sin(a1) * r * 0.62], [cx + Math.cos(a0 + 2 * Math.PI / n) * r, cy + Math.sin(a0 + 2 * Math.PI / n) * r * 0.55]],
      k % 2 ? GOLD.mid : GOLD.dk, 'rgba(40,28,8,0.4)');
  }
}

function drawBeacon(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  petals(g, 48, 70, 40, 10);
  // the spire: three long tapering blades leaning into one another
  for (const [dx, lean, tall, tone] of [[-12, 0.18, 66, GOLD], [12, -0.18, 66, GOLD], [0, 0, 84 + level * 6, IVORY]] as [number, number, number, Tone][]) {
    const bx = 48 + dx, tx = 48 + dx * 0.1 + lean * 6;
    poly(g, [[bx - 7, 70], [bx + 7, 70], [tx + 1.5, 70 - tall], [tx - 1.5, 70 - tall]], sheen(g, bx, 70, tx, 70 - tall, tone));
  }
  // rings of gold hanging in the air around it
  for (const [y, r] of [[40, 22], [18, 15], [-2, 10]]) {
    g.strokeStyle = GOLD.lt; g.lineWidth = 2; g.beginPath(); g.ellipse(48, y, r, r * 0.3, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(120,80,20,0.6)'; g.lineWidth = 0.6; g.stroke();
  }
  jewel(g, 48, 54, 4); jewel(g, 48, 26, 3);
  // its light going up into the sky
  const lg = g.createLinearGradient(48, -14, 48, -60);
  lg.addColorStop(0, 'rgba(255,240,190,0.7)'); lg.addColorStop(1, 'rgba(255,240,190,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = lg; g.fillRect(44, -60, 8, 46); g.restore();
  glowAt(g, 48, -14, 16, team + 'a0');
  g.restore();
}

function drawSanctum(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  g.fillStyle = sheen(g, 32, 52, 32, 40, IVORY); g.beginPath(); g.ellipse(32, 46, 26, 12, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = GOLD.mid; g.lineWidth = 1.6; g.stroke();
  // a held breath of light, and stones circling it
  glowAt(g, 32, 24, 18, 'rgba(255,245,210,0.75)');
  const og = g.createRadialGradient(30, 22, 1, 32, 24, 8);
  og.addColorStop(0, '#ffffff'); og.addColorStop(0.5, '#fff0c8'); og.addColorStop(1, 'rgba(255,220,150,0.2)');
  g.fillStyle = og; g.beginPath(); g.arc(32, 24, 7, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 6; k++) {
    const ang = k / 6 * Math.PI * 2, x = 32 + Math.cos(ang) * 20, y = 30 + Math.sin(ang) * 8 - 6;
    poly(g, [[x, y - 6], [x + 3, y], [x, y + 3], [x - 3, y]], sheen(g, x, y + 3, x, y - 6, k % 2 ? GOLD : IVORY));
  }
  glowAt(g, 32, 24, 26, team + '50');
  g.restore();
}

function drawShrine(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  petals(g, 32, 50, 22, 8);
  // an arch of gold with a crystal hanging inside it, threads of light down to the ground
  g.strokeStyle = sheen(g, 32, 50, 32, 6, GOLD); g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(14, 50); g.quadraticCurveTo(14, 8, 32, 6); g.quadraticCurveTo(50, 8, 50, 50); g.stroke();
  g.strokeStyle = GOLD.hi; g.lineWidth = 1.2; g.stroke();
  poly(g, [[32, 14], [38, 28], [32, 40], [26, 28]], CRY.mid, 'rgba(8,40,44,0.6)');
  g.fillStyle = CRY.lt; g.beginPath(); g.moveTo(32, 14); g.lineTo(35, 26); g.lineTo(32, 30); g.closePath(); g.fill();
  glowAt(g, 32, 28, 16, 'rgba(140,255,250,0.55)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(160,255,250,0.45)'; g.lineWidth = 0.8;
  for (const x of [26, 32, 38]) { g.beginPath(); g.moveTo(32, 40); g.lineTo(x, 52); g.stroke(); }
  g.restore();
  glowAt(g, 32, 6, 6, team + 'a0');
  g.restore();
}

function drawObelisk(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 32; g.scale(s, s);
  g.fillStyle = sheen(g, 16, 28, 16, 22, IVORY); g.beginPath(); g.ellipse(16, 26, 9, 4, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = GOLD.mid; g.lineWidth = 1; g.stroke();
  // a floating blade of gold above the pedestal, its edge lit
  poly(g, [[16, -14], [20, 2], [16, 16], [12, 2]], sheen(g, 16, 16, 16, -14, GOLD));
  g.strokeStyle = 'rgba(255,248,220,0.9)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(16, -14); g.lineTo(16, 16); g.stroke();
  jewel(g, 16, 4, 1.8);
  glowAt(g, 16, 20, 7, team + '70');
  g.restore();
}


function drawArchive(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 64; g.scale(s, s);
  petals(g, 32, 50, 20, 6);
  // a cube of light turned on its point, ringed by floating gold tablets
  const cx = 32, cy = 26;
  poly(g, [[cx, cy - 18], [cx + 14, cy - 4], [cx, cy + 10], [cx - 14, cy - 4]], 'rgba(255,248,225,0.55)', 'rgba(200,160,80,0.7)');
  poly(g, [[cx, cy - 18], [cx + 14, cy - 4], [cx, cy + 2], [cx - 14, cy - 4]], 'rgba(255,255,255,0.35)', 'rgba(0,0,0,0)');
  glowAt(g, cx, cy - 4, 22, 'rgba(255,240,200,0.6)');
  for (let k = 0; k < 5; k++) {
    const ang = k / 5 * Math.PI * 2, x = cx + Math.cos(ang) * 22, y = cy + 10 + Math.sin(ang) * 7;
    poly(g, [[x - 3, y - 7], [x + 3, y - 7], [x + 3, y], [x - 3, y]], sheen(g, x, y, x, y - 7, GOLD));
  }
  jewel(g, cx, cy - 4, 3);
  glowAt(g, cx, cy - 4, 30, team + '40');
  g.restore();
}

export const KEEPER_BUILDING_ART: Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void> = {
  beacon: drawBeacon, sanctum: drawSanctum, archive: drawArchive, shrine: drawShrine, obelisk: drawObelisk,
};
