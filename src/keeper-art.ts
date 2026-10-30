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
  const z = 5 + Math.sin(phase * Math.PI * 2) * 0.8;
  hoverPool(g, 6, 3.5, team);
  robed(g, a, z, 3.6, 13, team);
  // the rifle: a long gold rod, a ring of light at the muzzle
  const [r0x, r0y] = rotP(1, 3, a), [r1x, r1y] = rotP(11, 3, a);
  g.strokeStyle = GOLD.dk; g.lineWidth = 1.9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(r0x, r0y - z - 9); g.lineTo(r1x, r1y - z - 9); g.stroke();
  g.strokeStyle = GOLD.lt; g.lineWidth = 0.7; g.stroke();
  const [mx, my] = rotP(8, 3, a); jewel(g, mx, my - z - 9.4, 0.8);
  g.strokeStyle = 'rgba(255,240,190,0.8)'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(r1x, r1y - z - 9, 1.4, 2, a, 0, Math.PI * 2); g.stroke();
  glowAt(g, r1x, r1y - z - 9, 3.5, 'rgba(255,240,190,0.8)');
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


// a robed Keeper figure (shared by Seraph and Oracle): an ivory under-robe, a gold mantle with pauldrons,
// a tabard trimmed in team light, filigree down the front, and an elongated crested head
function robed(g: Ctx, a: number, z: number, wide: number, tall: number, team: string, hood = false) {
  const [cx, cy] = rotP(0, 0, a);
  // the under-robe, flaring at the hem, with two fold shadows
  poly(g, [[cx - wide - 1, cy - z + 1], [cx + wide + 1, cy - z + 1], [cx + wide * 0.62, cy - z - tall], [cx - wide * 0.62, cy - z - tall]], sheen(g, cx, cy - z, cx, cy - z - tall, IVORY));
  g.strokeStyle = 'rgba(90,80,60,0.35)'; g.lineWidth = 0.6;
  for (const f of [-0.45, 0.4]) { g.beginPath(); g.moveTo(cx + wide * f * 1.4, cy - z + 1); g.lineTo(cx + wide * f * 0.8, cy - z - tall * 0.7); g.stroke(); }
  // the tabard down the front, edged in team light, a gold filigree seam
  poly(g, [[cx - wide * 0.38, cy - z + 0.5], [cx + wide * 0.38, cy - z + 0.5], [cx + wide * 0.3, cy - z - tall + 2], [cx - wide * 0.3, cy - z - tall + 2]], sheen(g, cx, cy - z, cx, cy - z - tall, GOLD), 'rgba(60,40,10,0.5)');
  g.strokeStyle = team; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(cx - wide * 0.38, cy - z + 0.5); g.lineTo(cx - wide * 0.3, cy - z - tall + 2); g.moveTo(cx + wide * 0.38, cy - z + 0.5); g.lineTo(cx + wide * 0.3, cy - z - tall + 2); g.stroke();
  g.strokeStyle = GOLD.hi; g.lineWidth = 0.4;
  for (let k = 1; k < 4; k++) { const y = cy - z - tall * k / 4; g.beginPath(); g.arc(cx, y, 0.9, 0, Math.PI); g.stroke(); }
  // the mantle and two curved pauldrons
  poly(g, [[cx - wide - 1.4, cy - z - tall + 2], [cx + wide + 1.4, cy - z - tall + 2], [cx + wide * 0.75, cy - z - tall - 2.2], [cx - wide * 0.75, cy - z - tall - 2.2]], sheen(g, cx, cy - z - tall + 2, cx, cy - z - tall - 2, GOLD));
  for (const sd of [-1, 1]) {
    const px = cx + sd * (wide + 0.6), py = cy - z - tall + 0.5;
    g.fillStyle = sheen(g, px, py + 2, px, py - 3, GOLD); g.beginPath(); g.ellipse(px, py - 0.6, 2.2, 1.7, sd * 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,40,10,0.5)'; g.lineWidth = 0.5; g.stroke();
    jewel(g, px, py - 0.8, 0.6);
  }
  // the head: a hood with a lit face beneath, or a bare crested head
  const hy = cy - z - tall - 5;
  if (hood) {
    poly(g, [[cx - 3.2, hy + 3.4], [cx - 2.4, hy - 2.6], [cx, hy - 4.6], [cx + 2.4, hy - 2.6], [cx + 3.2, hy + 3.4]], sheen(g, cx, hy + 3, cx, hy - 4, IVORY));
    g.fillStyle = '#1a1408'; g.beginPath(); g.ellipse(cx + Math.cos(a) * 0.5, hy + 0.6, 1.7, 2.2, 0, 0, Math.PI * 2); g.fill();
    glowAt(g, cx + Math.cos(a) * 0.8, hy, 2.2, 'rgba(160,255,250,0.9)');
  } else {
    g.fillStyle = sheen(g, cx, hy + 3, cx, hy - 3.5, IVORY);
    g.beginPath(); g.ellipse(cx, hy, 2.2, 3.4, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90,80,60,0.45)'; g.lineWidth = 0.5; g.stroke();
    jewel(g, cx - 0.6, hy - 3.6, 1.3);
    const [ex, ey] = rotP(1.6, 0, a);
    g.fillStyle = '#9ffcf6'; g.fillRect(cx + ex - 0.5, hy + ey * 0.3 - 0.5, 1.6, 0.9);
  }
  return { cx, cy, hy };
}

function drawSeraph(g: Ctx, a: number, team: string, phase = 0) {
  const t = phase * Math.PI * 2, z = 5 + Math.sin(t) * 0.8;
  hoverPool(g, 8, 4.5, team);
  // its shield: a shell of hexagonal light around the whole figure
  g.save(); g.globalCompositeOperation = 'lighter';
  const sg = g.createRadialGradient(0, -z - 10, 4, 0, -z - 10, 13);
  sg.addColorStop(0, 'rgba(255,230,160,0)'); sg.addColorStop(0.85, 'rgba(255,230,160,0.12)'); sg.addColorStop(1, 'rgba(255,240,190,0.35)');
  g.fillStyle = sg; g.beginPath(); g.ellipse(0, -z - 10, 9.5, 13, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,235,180,0.22)'; g.lineWidth = 0.5;
  for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + t * 0.2; g.beginPath(); g.moveTo(Math.cos(ang) * 4, -z - 10 + Math.sin(ang) * 6); g.lineTo(Math.cos(ang) * 9, -z - 10 + Math.sin(ang) * 12.5); g.stroke(); }
  g.restore();
  // a halo behind the head
  g.strokeStyle = 'rgba(255,225,150,0.75)'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, -z - 19.5, 4.2, 1.6, 0, 0, Math.PI * 2); g.stroke();
  robed(g, a, z, 4.2, 13, team);
  // two long blades of light, held low and outward
  for (const sd of [-1, 1]) {
    const [h0x, h0y] = rotP(2, sd * 4.6, a), [h1x, h1y] = rotP(8.5, sd * 6.2, a);
    const bg = g.createLinearGradient(h0x, h0y - z - 8, h1x, h1y - z - 3);
    bg.addColorStop(0, 'rgba(255,240,200,1)'); bg.addColorStop(1, 'rgba(255,220,140,0.2)');
    g.strokeStyle = bg; g.lineWidth = 1.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(h0x, h0y - z - 8); g.lineTo(h1x, h1y - z - 4); g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,140,0.22)'; g.lineWidth = 2.4; g.stroke(); g.restore();
    g.fillStyle = GOLD.mid; g.beginPath(); g.arc(h0x, h0y - z - 8, 1, 0, Math.PI * 2); g.fill();   // the hilt
  }
  for (let k = 0; k < 3; k++) { const ang = t + k * 2.1; glowAt(g, Math.cos(ang) * 8, -z - 6 + Math.sin(ang) * 3, 1.6, 'rgba(255,240,190,0.8)'); }   // motes
}

function drawOracle(g: Ctx, a: number, team: string, phase = 0) {
  const t = phase * Math.PI * 2, z = 6 + Math.sin(t) * 0.6;
  hoverPool(g, 6.5, 3.8, team);
  const { hy } = robed(g, a, z, 3.4, 15, team, true);
  // a tall staff ending in a crescent that cradles the seeing-crystal
  const [s0x, s0y] = rotP(3.2, 2.8, a), top = s0y - z - 29;
  g.strokeStyle = GOLD.dk; g.lineWidth = 1.7; g.lineCap = 'round'; g.beginPath(); g.moveTo(s0x, s0y - z + 1); g.lineTo(s0x, top + 3); g.stroke();
  g.strokeStyle = GOLD.lt; g.lineWidth = 0.6; g.stroke();
  g.strokeStyle = sheen(g, s0x, top + 4, s0x, top - 4, GOLD); g.lineWidth = 1.4;
  g.beginPath(); g.arc(s0x, top, 3.6, 0.2, Math.PI - 0.2, true); g.stroke();
  jewel(g, s0x, top - 0.5, 2.4);
  // rings orbiting the crystal, and three glyph-shards turning about the figure
  g.strokeStyle = 'rgba(160,255,250,0.55)'; g.lineWidth = 0.6;
  g.beginPath(); g.ellipse(s0x, top - 0.6, 5.5, 1.8, t * 0.5, 0, Math.PI * 2); g.stroke();
  glowAt(g, s0x, top - 0.6, 9, 'rgba(160,255,250,0.55)');
  for (let k = 0; k < 3; k++) {
    const ang = t * 0.7 + k * 2.09, gx = Math.cos(ang) * 7, gy = hy - 2 + Math.sin(ang) * 2.4;
    poly(g, [[gx, gy - 2], [gx + 1.1, gy], [gx, gy + 1.4], [gx - 1.1, gy]], sheen(g, gx, gy + 1.4, gx, gy - 2, GOLD), 'rgba(60,40,10,0.5)');
  }
}

function drawHerald(g: Ctx, a: number, team: string) {
  // a slim gold dart: layered swept wings with ivory leading edges, panel lines, a lit canopy, twin engines
  const P = (pts: Pt[]) => pts.map(([x, y]) => rotP(x, y, a));
  for (const sd of [-1, 1]) {
    const wing = P([[3, sd * 2], [-3, sd * 10.5], [-7, sd * 10], [-5, sd * 2.5]]);
    poly(g, wing, sheen(g, wing[0][0], wing[0][1], wing[2][0], wing[2][1], GOLD));
    const edge = P([[3, sd * 2], [-3, sd * 10.5]]);
    g.strokeStyle = IVORY.lt; g.lineWidth = 1.1; g.beginPath(); g.moveTo(edge[0][0], edge[0][1]); g.lineTo(edge[1][0], edge[1][1]); g.stroke();
    const panel = P([[-1, sd * 4], [-4.5, sd * 8]]);
    g.strokeStyle = 'rgba(70,46,10,0.55)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(panel[0][0], panel[0][1]); g.lineTo(panel[1][0], panel[1][1]); g.stroke();
    const [tx, ty] = rotP(-4, sd * 10.4, a); g.fillStyle = team; g.beginPath(); g.arc(tx, ty, 1.1, 0, Math.PI * 2); g.fill(); glowAt(g, tx, ty, 3, team + 'a0');
  }
  const hull = P([[14, 0], [6, -2.4], [-6, -2.6], [-9, -1.4], [-9, 1.4], [-6, 2.6], [6, 2.4]]);
  poly(g, hull, sheen(g, hull[3][0], hull[3][1], hull[0][0], hull[0][1], IVORY));
  const spine = P([[12, 0], [-8, 0]]);
  g.strokeStyle = GOLD.mid; g.lineWidth = 0.9; g.beginPath(); g.moveTo(spine[0][0], spine[0][1]); g.lineTo(spine[1][0], spine[1][1]); g.stroke();
  const canopy = P([[8, 0], [4.5, -1.3], [2, 0], [4.5, 1.3]]);
  poly(g, canopy, 'rgba(120,240,245,0.9)', 'rgba(10,40,44,0.6)');
  glowAt(g, (canopy[0][0] + canopy[2][0]) / 2, (canopy[0][1] + canopy[2][1]) / 2, 3.5, 'rgba(160,255,250,0.6)');
  for (const sd of [-1, 1]) { const [ex, ey] = rotP(-9.5, sd * 1.4, a); glowAt(g, ex, ey, 4.5, 'rgba(120,240,255,0.85)'); const [rx, ry] = rotP(-15, sd * 1.4, a); g.strokeStyle = 'rgba(120,240,255,0.25)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(ex, ey); g.lineTo(rx, ry); g.stroke(); }
}

function drawArbiter(g: Ctx, a: number, team: string, phase = 0) {
  // a floating lens array: four gold ring segments around a lens of gathered sunlight, three ivory vanes threaded to it
  const t = phase * Math.PI * 2, bob = Math.sin(t) * 1.4, z = 13 + bob, cy = -z - 12;
  hoverPool(g, 14, 7.5, team);
  for (let k = 0; k < 3; k++) {
    const ang = a + k * 2.094, [vx, vy] = rotP(10, 0, ang), [ix, iy] = rotP(3, 0, ang);
    poly(g, [[ix, iy - z + 3], [vx, vy - z + 7], [vx * 0.85, vy * 0.85 - z - 2], [ix * 1.2, iy * 1.2 - z - 1]], sheen(g, vx, vy - z + 7, vx, vy - z - 2, IVORY), 'rgba(80,70,50,0.5)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,235,170,0.45)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(vx * 0.9, vy * 0.9 - z); g.lineTo(0, cy); g.stroke(); g.restore();
  }
  // the emitter beneath the lens, where the judgment comes out
  poly(g, [[-2.6, -z - 1], [2.6, -z - 1], [0, -z + 4]], sheen(g, 0, -z + 4, 0, -z - 1, GOLD));
  glowAt(g, 0, -z + 3.5, 4, 'rgba(255,220,140,0.75)');
  // the lens: concentric light
  const lg = g.createRadialGradient(-2, cy - 2, 0.5, 0, cy, 9);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.35, 'rgba(255,244,205,0.95)'); lg.addColorStop(0.75, 'rgba(255,212,130,0.6)'); lg.addColorStop(1, 'rgba(255,190,90,0.2)');
  g.fillStyle = lg; g.beginPath(); g.ellipse(0, cy, 8.5, 9.5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.5;
  for (const r of [3, 5.8]) { g.beginPath(); g.ellipse(0, cy, r, r * 1.1, 0, 0, Math.PI * 2); g.stroke(); }
  // four floating ring segments, slowly turning
  for (let k = 0; k < 4; k++) {
    const a0 = t * 0.3 + k * Math.PI / 2 + 0.18, a1 = a0 + Math.PI / 2 - 0.36;
    g.strokeStyle = sheen(g, 0, cy + 11, 0, cy - 11, GOLD); g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, cy, 11, 12, 0, a0, a1); g.stroke();
    g.strokeStyle = GOLD.hi; g.lineWidth = 0.6; g.beginPath(); g.ellipse(0, cy, 11, 12, 0, a0 + 0.1, a1 - 0.1); g.stroke();
    jewel(g, Math.cos((a0 + a1) / 2) * 11, cy + Math.sin((a0 + a1) / 2) * 12, 0.9);
  }
  glowAt(g, 0, cy, 20, team + '50');
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
  // three stepped ivory tiers, each ringed in gold
  for (const [ry, rx, z, t] of [[13, 27, 0, IVORY], [10, 21, 4, IVORY], [7, 15, 8, GOLD]] as [number, number, number, Tone][]) {
    g.fillStyle = sheen(g, 32, 50 - z + ry, 32, 50 - z - ry, t); g.beginPath(); g.ellipse(32, 50 - z, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = GOLD.mid; g.lineWidth = 1; g.stroke();
  }
  // a pillar of light from the top tier up into the cube
  g.save(); g.globalCompositeOperation = 'lighter';
  const pg = g.createLinearGradient(32, 42, 32, 4); pg.addColorStop(0, 'rgba(255,240,200,0.55)'); pg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = pg; g.fillRect(28, 4, 8, 38); g.restore();
  // the cube of memory, turned on its point: three lit faces and a jewel at its heart
  const cx = 32, cy = 22;
  poly(g, [[cx, cy - 15], [cx + 12, cy - 7], [cx, cy + 1], [cx - 12, cy - 7]], 'rgba(255,250,232,0.85)', 'rgba(200,160,80,0.8)');
  poly(g, [[cx - 12, cy - 7], [cx, cy + 1], [cx, cy + 15], [cx - 12, cy + 7]], 'rgba(236,222,190,0.75)', 'rgba(200,160,80,0.8)');
  poly(g, [[cx + 12, cy - 7], [cx, cy + 1], [cx, cy + 15], [cx + 12, cy + 7]], 'rgba(205,186,150,0.75)', 'rgba(200,160,80,0.8)');
  g.strokeStyle = 'rgba(160,120,50,0.5)'; g.lineWidth = 0.5;
  for (const k of [-1, 1]) { g.beginPath(); g.moveTo(cx + k * 6, cy - 11); g.lineTo(cx + k * 6, cy + 3); g.stroke(); }
  jewel(g, cx, cy - 2, 3);
  glowAt(g, cx, cy, 24, 'rgba(255,240,200,0.45)');
  // tablets of gold orbiting the cube, each carved with a line of glyphs
  for (let k = 0; k < 5; k++) {
    const ang = k / 5 * Math.PI * 2 + 0.3, x = cx + Math.cos(ang) * 23, y = cy + 14 + Math.sin(ang) * 7;
    if (Math.sin(ang) < 0) { poly(g, [[x - 3, y - 8], [x + 3, y - 8], [x + 3, y], [x - 3, y]], sheen(g, x, y, x, y - 8, GOLD)); }
    else { poly(g, [[x - 3, y - 8], [x + 3, y - 8], [x + 3, y], [x - 3, y]], sheen(g, x, y, x, y - 8, GOLD)); }
    g.strokeStyle = 'rgba(80,50,10,0.6)'; g.lineWidth = 0.5;
    for (const yy of [y - 6, y - 4, y - 2]) { g.beginPath(); g.moveTo(x - 2, yy); g.lineTo(x + 2, yy); g.stroke(); }
  }
  glowAt(g, 32, 50, 30, team + '30');
  g.restore();
}

export const KEEPER_BUILDING_ART: Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void> = {
  beacon: drawBeacon, sanctum: drawSanctum, archive: drawArchive, shrine: drawShrine, obelisk: drawObelisk,
};
