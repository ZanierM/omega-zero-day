// Hand-built structure art, drawn in code in the same chunky 3/4 top-down style
// as the terrain: flat-lit roofs, shaded walls facing the viewer, hard outlines.
// The renderer adds the pad, cast shadow, outline and pixelation around it.
//
// Coordinates: (0,0) is the footprint's top-left corner on the ground; x runs
// east, y runs south, and a height z lifts a point straight up the screen.

type Pt = [number, number];
type Ctx = CanvasRenderingContext2D;

const OUT = '#1a120c';

// refined style (the default; ?style=classic / V for the original): thin edges tinted from each
// surface instead of the heavy black outline, plus extra surface detail where
// an art function adds it
let fine = false;
export function setFineArt(v: boolean) { fine = v; }

// edge colour for a fill: the black outline, or in the refined style the same
// colour pushed much darker
function edgeOf(col: string): string {
  if (!fine) return OUT;
  let r: number, gr: number, b: number;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = n >> 16; gr = (n >> 8) & 255; b = n & 255; }
  else {
    const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return 'rgba(26,18,12,0.6)';
    r = +m[1]; gr = +m[2]; b = +m[3];
  }
  return `rgb(${Math.round(r * 0.4)},${Math.round(gr * 0.4)},${Math.round(b * 0.44)})`;
}
const edgeW = () => fine ? 1 : 2;

// multiply a #rrggbb colour by k (k > 1 lightens)
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function poly(g: Ctx, pts: Pt[], fill: string | CanvasGradient, stroke = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = typeof fill === 'string' ? edgeOf(fill) : OUT; g.lineWidth = edgeW(); g.lineJoin = 'round'; g.stroke(); }
}

// rectangle with chamfered corners, clockwise, on the ground plane
function chamfer(x0: number, y0: number, x1: number, y1: number, c: number): Pt[] {
  return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
}

// a vertical prism over a clockwise ground polygon, from height z0 to z1.
// Only the walls facing the viewer are drawn; west-facing walls catch the
// north-west sun, east-facing ones fall into shade.
function prism(g: Ctx, pts: Pt[], z0: number, z1: number, top: string | null, side: string) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (by - ay) / len, ny = -(bx - ax) / len;   // outward normal
    if (ny <= 0.01) continue;
    poly(g, [[ax, ay - z1], [bx, by - z1], [bx, by - z0], [ax, ay - z0]], shade(side, 1 - nx * 0.22));
    // refined: walls catch light along the top and darken toward the ground
    if (fine && z1 - z0 > 1.5) onWall(g, [ax, ay], [bx, by], z0, () => {
      const h = z1 - z0, tg = g.createLinearGradient(0, 0, 0, h);
      tg.addColorStop(0, 'rgba(0,0,0,0.2)'); tg.addColorStop(0.55, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(255,240,215,0.1)');
      g.fillStyle = tg; g.fillRect(0, 0, 1, h);
    });
  }
  if (top) {
    const roof = pts.map(([x, y]) => [x, y - z1] as Pt);
    poly(g, roof, top);
    if (fine) {
      // sunlit north-west corner fading to a dimmer south-east
      const xs = roof.map(p => p[0]), ys = roof.map(p => p[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      const rg = g.createLinearGradient(x0, y0, x1, y1);
      rg.addColorStop(0, 'rgba(255,240,215,0.14)'); rg.addColorStop(0.5, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.14)');
      poly(g, roof, rg, false);
    }
  }
}

// upright cylinder centred on a ground point
function cylinder(g: Ctx, cx: number, cy: number, r: number, z0: number, z1: number, top: string, side: string) {
  g.beginPath();
  g.moveTo(cx - r, cy - z1);
  g.lineTo(cx - r, cy - z0);
  g.arc(cx, cy - z0, r, Math.PI, 0, true);
  g.lineTo(cx + r, cy - z1);
  g.closePath();
  const sg = g.createLinearGradient(cx - r, 0, cx + r, 0);
  if (fine) {
    // four tones: a lit rim, the lit face, the body, the core shadow
    sg.addColorStop(0, shade(side, 1.12)); sg.addColorStop(0.18, shade(side, 1.32));
    sg.addColorStop(0.5, side); sg.addColorStop(0.82, shade(side, 0.62)); sg.addColorStop(1, shade(side, 0.76));
  } else {
    sg.addColorStop(0, shade(side, 1.18)); sg.addColorStop(0.45, side); sg.addColorStop(1, shade(side, 0.7));
  }
  g.fillStyle = sg; g.fill();
  g.strokeStyle = edgeOf(side); g.lineWidth = edgeW(); g.stroke();
  g.beginPath(); g.arc(cx, cy - z1, r, 0, Math.PI * 2);
  g.fillStyle = top; g.fill(); g.strokeStyle = edgeOf(top); g.stroke();
}

// dome sitting on a ground circle at height z
function dome(g: Ctx, cx: number, cy: number, r: number, z: number, col: string) {
  const by = cy - z;
  g.beginPath();
  g.ellipse(cx, by, r, r * 0.95, 0, Math.PI, 0);
  g.arc(cx, by, r, 0, Math.PI);
  g.closePath();
  const dg = g.createRadialGradient(cx - r * 0.4, by - r * 0.55, r * 0.1, cx, by, r * 1.1);
  dg.addColorStop(0, shade(col, 1.55)); dg.addColorStop(0.45, col); dg.addColorStop(1, shade(col, 0.55));
  g.fillStyle = dg; g.fill();
  if (fine) {
    // bounce light from the ground along the lower rim
    const bg = g.createLinearGradient(0, by - r * 0.2, 0, by + r);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(255,200,150,0.16)');
    g.fillStyle = bg; g.fill();
  }
  g.strokeStyle = edgeOf(col); g.lineWidth = edgeW(); g.stroke();
}

function glow(g: Ctx, x: number, y: number, r: number, col: string) {
  const gg = g.createRadialGradient(x, y, 0, x, y, r);
  gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gg;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

// ---------------- refined-style surface detail ----------------

// paint in a wall's own frame: x runs 0..1 along the ground edge a→b and y runs
// up from height z0, so bands and seams follow slanted walls too
function onWall(g: Ctx, a: Pt, b: Pt, z0: number, paint: (len: number) => void) {
  g.save();
  g.transform(b[0] - a[0], b[1] - a[1], 0, -1, a[0], a[1] - z0);
  paint(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
  g.restore();
}

// darkening where a wall meets the surface below it
function wallAO(g: Ctx, a: Pt, b: Pt, z0: number, h: number, alpha: number) {
  onWall(g, a, b, z0, () => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, `rgba(0,0,0,${alpha})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 1, h);
  });
}

// thin light lip along the top of a wall, where the sun catches the edge
function wallRim(g: Ctx, a: Pt, b: Pt, z: number, alpha: number) {
  onWall(g, a, b, z - 0.8, () => { g.fillStyle = `rgba(255,240,215,${alpha})`; g.fillRect(0, 0, 1, 0.8); });
}

// vertical panel seams every `step` world units between heights z0 and z1
function wallSeams(g: Ctx, a: Pt, b: Pt, z0: number, z1: number, step: number) {
  onWall(g, a, b, z0, len => {
    for (let x = step; x < len - 1; x += step) {
      g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x / len, 0, 0.6 / len, z1 - z0);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect((x + 0.6) / len, 0, 0.5 / len, z1 - z0);
    }
  });
}

// deterministic speckle (weathering, grit) over a screen rectangle
function speckle(g: Ctx, x0: number, y0: number, x1: number, y1: number, n: number, seed: number) {
  let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,240,215,0.08)';
    g.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 0.5 + rnd() * 0.7, 0.5);
  }
}

// refined-style weathering for a prism's visible walls: shade where they meet
// the surface below, a lit top lip, and panel seams every `seams` units
function detailWalls(g: Ctx, pts: Pt[], z0: number, z1: number, seams = 0, ao = 0.36) {
  if (!fine) return;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (-(b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) <= 0.01) continue;   // faces away
    if (seams) wallSeams(g, a, b, z0, z1, seams);
    wallAO(g, a, b, z0, Math.min(6, (z1 - z0) * 0.45), ao);
    wallRim(g, a, b, z1, 0.28);
  }
}

// additive light spill around a lit window or lamp (refined style only)
function spill(g: Ctx, x: number, y: number, r: number, col: string) {
  if (!fine) return;
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y, r, col); g.restore();
}

// a thin cable or pipe run with a lit upper edge
function cable(g: Ctx, pts: Pt[], wid: number, col = '#3a3c44') {
  for (const [c, w] of [[edgeOf(col), wid + 0.8], [col, wid]] as [string, number][]) {
    g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
  }
}

// ---------------- Nexus HQ ----------------

const HULL_TOP = '#858893', HULL = '#5a5d69', PLINTH_TOP = '#6e6a63', PLINTH = '#4a4640';
const DOME = '#8d93a3', GOLD = '#e8c66a', GLASS = '#5fe0f0', GLASS_DK = '#16303a';

// beacon at the tip of the mast, relative to the footprint's top-left (world px)
export function nexusBeacon(w: number, level: number, refined = false): { x: number, y: number } {
  const s = w / 96, dz = refined ? 47 : 44;
  return { x: 48 * s, y: (46 - dz - 15 - (level >= 3 ? 30 : 22)) * s };
}

export function drawNexus(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save();
  const s = w / 96;
  g.scale(s, s);

  // armoured plinth with a front ramp
  prism(g, chamfer(4, 8, 92, 92, 14), 0, 8, PLINTH_TOP, PLINTH);
  poly(g, [[38, 92 - 8], [58, 92 - 8], [62, 95], [34, 95]], shade(PLINTH_TOP, 0.9));
  // plinth vents
  for (const x of [14, 22, 70, 78]) poly(g, [[x, 92 - 6], [x + 5, 92 - 6], [x + 5, 92 - 3], [x, 92 - 3]], '#26221e', false);
  const plinthFront: [Pt, Pt][] = [[[4, 78], [18, 92]], [[18, 92], [78, 92]], [[78, 92], [92, 78]]];
  if (fine) {
    speckle(g, 8, 8 - 8, 88, 92 - 8, 90, 7);
    for (const [a, b] of plinthFront) { wallAO(g, a, b, 0, 3, 0.35); wallRim(g, a, b, 8, 0.3); }
  }

  // rear corner towers with dishes (LV2+)
  if (level >= 2) {
    for (const tx of [14, 82]) {
      cylinder(g, tx, 20, 8, 8, 34, HULL_TOP, HULL);
      poly(g, chamfer(tx - 5, 20 - 34 - 4, tx + 5, 20 - 34 + 4, 2), team);
      // tilted dish
      g.save(); g.translate(tx, 20 - 40); g.rotate(tx < 48 ? -0.5 : 0.5);
      g.beginPath(); g.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
      g.fillStyle = '#c4c8d2'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#7a7f8c'; g.beginPath(); g.ellipse(1, 1, 5, 2.2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  // main hall: hull, team band, cap
  const hall = chamfer(16, 18, 80, 78, 12);
  prism(g, hall, 8, 30, null, HULL);
  prism(g, hall, 30, 34, null, level >= 3 ? GOLD : team);
  prism(g, hall, 34, 38, HULL_TOP, HULL);
  if (fine) {
    const faces: [Pt, Pt][] = [[[16, 66], [28, 78]], [[28, 78], [68, 78]], [[68, 78], [80, 66]]];
    for (const [a, b] of faces) {
      wallSeams(g, a, b, 8, 30, 9);
      wallAO(g, a, b, 8, 7, 0.42);
      wallRim(g, a, b, 38, 0.32);
      wallAO(g, a, b, 30, 1.2, 0.3);              // shadow line under the band
    }
    for (let x = 31; x < 67; x += 6) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 0.4, 78 - 32 + 0.4, 1.3, 1.3);
      g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(x, 78 - 32, 1, 1);
    }
    // roof plates
    for (const [col, d] of [['rgba(0,0,0,0.28)', 0], ['rgba(255,240,215,0.1)', 0.6]] as [string, number][]) {
      g.strokeStyle = col; g.lineWidth = 0.6;
      g.beginPath();
      for (const y of [32, 46, 60]) { g.moveTo(20, y - 38 + d); g.lineTo(76, y - 38 + d); }
      for (const x of [32, 48, 64]) { g.moveTo(x + d, 20 - 38); g.lineTo(x + d, 76 - 38); }
      g.stroke();
    }
    speckle(g, 20, 20 - 38, 76, 76 - 38, 60, 11);
    // the drum's shadow pooled on the roof
    const ds = g.createRadialGradient(50, 46 - 38, 14, 50, 46 - 38, 24);
    ds.addColorStop(0, 'rgba(0,0,0,0.3)'); ds.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ds; g.beginPath(); g.arc(50, 46 - 38, 24, 0, Math.PI * 2); g.fill();
  }

  // front windows: dark frames with a lit lower pane
  for (let x = 30; x <= 62; x += 8) {
    poly(g, [[x, 78 - 26], [x + 5, 78 - 26], [x + 5, 78 - 16], [x, 78 - 16]], GLASS_DK);
    poly(g, [[x + 1, 78 - 21], [x + 4, 78 - 21], [x + 4, 78 - 17], [x + 1, 78 - 17]], GLASS, false);
  }
  // side windows on the chamfers
  poly(g, [[19, 75 - 24], [24, 78 - 24], [24, 78 - 18], [19, 75 - 18]], GLASS_DK);
  poly(g, [[72, 78 - 24], [77, 75 - 24], [77, 75 - 18], [72, 78 - 18]], GLASS_DK);
  if (fine) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let x = 30; x <= 62; x += 8) glow(g, x + 2.5, 78 - 19, 5, 'rgba(95,224,240,0.22)');
    g.restore();
    // a glint on each pane's upper corner
    g.fillStyle = 'rgba(220,250,255,0.55)';
    for (let x = 30; x <= 62; x += 8) g.fillRect(x + 1, 78 - 25, 1.2, 0.8);
  }

  // hangar door with hazard chevrons on the plinth face
  poly(g, [[40, 92 - 8], [56, 92 - 8], [56, 92 - 1], [40, 92 - 1]], '#2a2622');
  g.fillStyle = GOLD;
  for (let x = 41; x < 55; x += 4) poly(g, [[x, 92 - 7], [x + 2, 92 - 7], [x + 3, 92 - 5], [x + 1, 92 - 5]], GOLD, false);
  if (fine) {
    // team-coloured light strips either side of the door
    for (const x of [30, 59]) {
      quad(g, [x, 92 - 6], [x + 7, 92 - 6], [x + 7, 92 - 4.5], [x, 92 - 4.5], team, false);
      g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x + 3.5, 92 - 5.2, 6, team); g.restore();
    }
  }

  // roof furniture: vents, hatch, and solar tiles on LV3
  const roofY = (y: number) => y - 38;
  for (const [vx, vy] of [[22, 26], [66, 26], [22, 64], [66, 64]] as Pt[]) {
    prism(g, [[vx, vy], [vx + 8, vy], [vx + 8, vy + 6], [vx, vy + 6]], 38, 41, '#3a3c44', HULL);
    g.fillStyle = '#1e1f24'; g.fillRect(vx + 1.5, roofY(vy) - 3 + 1.5, 5, 1.2); g.fillRect(vx + 1.5, roofY(vy) - 3 + 3.5, 5, 1.2);
  }
  if (level >= 3) {
    for (const [px, py] of [[30, 22], [56, 22]] as Pt[])
      poly(g, [[px, roofY(py)], [px + 10, roofY(py)], [px + 10, roofY(py + 8)], [px, roofY(py + 8)]], '#24406a');
  }

  // refined: a taller drum lifts the dome and gives the HQ a stronger crown
  const dz = fine ? 47 : 44;
  if (fine) {
    // exhaust stack to the left of the drum, cables running out to the roof edge
    cylinder(g, 25, 44, 3, 38, 54, '#2a2c32', '#6a6d78');
    quad(g, [22, 44 - 50], [28, 44 - 50], [28, 44 - 48.5], [22, 44 - 48.5], team, false);
    g.fillStyle = '#14110e'; g.beginPath(); g.arc(25, 44 - 54, 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,14,10,0.75)'; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(34, 58 - 38); g.quadraticCurveTo(28, 64 - 38, 22, 72 - 38);
    g.moveTo(62, 58 - 38); g.quadraticCurveTo(68, 64 - 38, 74, 72 - 38);
    g.stroke();
  }
  // command drum + dome with a team-coloured glass band
  if (fine) {
    cylinder(g, 48, 46, 18, 38, 40.5, HULL_TOP, HULL);
    cylinder(g, 48, 46, 18, 40.5, 42, team, team);           // team ring round the drum
    cylinder(g, 48, 46, 18, 42, dz, HULL_TOP, HULL);
  } else {
    cylinder(g, 48, 46, 18, 38, dz, HULL_TOP, HULL);
  }
  dome(g, 48, 46, 16, dz, DOME);
  g.save();
  g.beginPath(); g.ellipse(48, 46 - dz, 16, 15.2, 0, Math.PI, 0); g.arc(48, 46 - dz, 16, 0, Math.PI); g.clip();
  g.fillStyle = team;
  g.fillRect(30, 46 - dz - 7, 36, 4);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(30, 46 - dz - 7, 36, 1.2);
  if (fine) {
    // specular highlight and a soft horizon reflection
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(42, 46 - dz - 10, 4, 2.2, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.ellipse(48, 46 - dz - 1, 14, 2.5, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // antenna mast with cross-spars, beacon housing at the tip
  const mastH = level >= 3 ? 30 : 22;
  const baseY = 46 - dz - 15;
  g.fillStyle = OUT; g.fillRect(46, baseY - mastH, 4, mastH + 1);
  g.fillStyle = '#b8bcc8'; g.fillRect(47, baseY - mastH, 2, mastH);
  for (let k = 1; k <= (level >= 3 ? 3 : 2); k++) {
    const y = baseY - k * 8;
    g.fillStyle = OUT; g.fillRect(42, y - 1, 12, 3);
    g.fillStyle = '#b8bcc8'; g.fillRect(43, y, 10, 1);
  }
  g.fillStyle = OUT; g.beginPath(); g.arc(48, baseY - mastH, 3.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff6a5a'; g.beginPath(); g.arc(48, baseY - mastH, 2, 0, Math.PI * 2); g.fill();

  if (fine) {
    // comms dish on the roof's east side, tilted at the sky
    cylinder(g, 73, 48, 2.5, 38, 44, '#6a6d78', HULL);
    g.save(); g.translate(73, 48 - 48); g.rotate(0.55);
    g.beginPath(); g.ellipse(0, 0, 7.5, 3.8, 0, 0, Math.PI * 2);
    const dg = g.createLinearGradient(-7, -3, 7, 3);
    dg.addColorStop(0, '#e2e5ec'); dg.addColorStop(1, '#8a8f9c');
    g.fillStyle = dg; g.fill(); g.strokeStyle = edgeOf('#8a8f9c'); g.lineWidth = 1; g.stroke();
    g.fillStyle = '#6a6f7c'; g.beginPath(); g.ellipse(1, 0.8, 4, 1.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e1f24'; g.fillRect(-0.5, -4.5, 1, 4.5);
    g.restore();
    // landing-light posts on the plinth's front corners (LV3 swaps them for pylons)
    if (level < 3) for (const px of [10, 86]) {
      cylinder(g, px, 86, 1.6, 8, 15, '#6a6d78', HULL);
      glow(g, px, 86 - 16, 5, team);
      g.fillStyle = '#ffffff'; g.fillRect(px - 0.7, 86 - 16.7, 1.4, 1.4);
    }
  }

  // front corner pylons with team lamps (LV3)
  if (level >= 3) {
    for (const px of [12, 84]) {
      cylinder(g, px, 84, 5, 8, 26, HULL_TOP, HULL);
      glow(g, px, 84 - 27, 7, team);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, 84 - 27, 1.8, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

// ---------------- shared bits ----------------

const CONCRETE_TOP = '#7a746b', CONCRETE = '#544f48';
const DARK = '#2a2622', STEEL = '#b8bcc8';

// a flat quad on a wall or roof, given four screen points
function quad(g: Ctx, a: Pt, b: Pt, c: Pt, d: Pt, fill: string | CanvasGradient, stroke = true) { poly(g, [a, b, c, d], fill, stroke); }

// diagonal hazard stripes inside a screen rect
function hazard(g: Ctx, x: number, y: number, w: number, h: number, col: string) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = col; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(16,10,6,0.85)';
  for (let k = -h; k < w + h; k += 6) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 3, y); g.lineTo(x + k + 3 - h, y + h); g.lineTo(x + k - h, y + h); g.closePath(); g.fill(); }
  g.restore();
  g.strokeStyle = OUT; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
}

// thin vertical pole with a small pennant in team colour
function flag(g: Ctx, x: number, y: number, z0: number, z1: number, team: string) {
  g.fillStyle = OUT; g.fillRect(x - 1.5, y - z1, 3, z1 - z0);
  g.fillStyle = STEEL; g.fillRect(x - 0.5, y - z1, 1, z1 - z0);
  poly(g, [[x + 1, y - z1], [x + 13, y - z1 + 3], [x + 11, y - z1 + 6], [x + 1, y - z1 + 8]], team);
}

function lamp(g: Ctx, x: number, y: number, col: string) {
  glow(g, x, y, 6, col);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill();
}

// ---------------- Solar Array ----------------

// one photovoltaic panel tilted toward the sun: back edge raised
function solarPanel(g: Ctx, x0: number, y0: number, x1: number, y1: number) {
  const zb = 16, zf = 7;
  // struts
  g.fillStyle = OUT;
  for (const x of [x0 + 3, x1 - 4]) g.fillRect(x, y1 - zf, 2, zf - 2);
  const a: Pt = [x0, y0 - zb], b: Pt = [x1, y0 - zb], c: Pt = [x1, y1 - zf], d: Pt = [x0, y1 - zf];
  // panel edge (thickness) seen from the front
  quad(g, d, c, [x1, y1 - zf + 2], [x0, y1 - zf + 2], '#2a2e38');
  quad(g, a, b, c, d, '#1d3a6a');
  // cell grid
  g.strokeStyle = '#3d6cb0'; g.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    const t = k / 4;
    g.beginPath(); g.moveTo(x0 + (x1 - x0) * t, a[1]); g.lineTo(x0 + (x1 - x0) * t, d[1]); g.stroke();
  }
  for (let k = 1; k < 3; k++) {
    const t = k / 3, yy = a[1] + (d[1] - a[1]) * t;
    g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
  }
  // sky reflection streak
  g.save(); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.clip();
  g.fillStyle = 'rgba(190,225,255,0.35)';
  g.beginPath(); g.moveTo(x0, a[1] + 6); g.lineTo(x0 + 8, a[1]); g.lineTo(x0 + 14, a[1]); g.lineTo(x0, d[1] - 2); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = OUT; g.lineWidth = 2;
  g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath(); g.stroke();
}

export function drawSolar(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  // low concrete frame
  prism(g, chamfer(3, 5, 61, 61, 6), 0, 3, CONCRETE_TOP, CONCRETE);
  if (fine) {
    detailWalls(g, chamfer(3, 5, 61, 61, 6), 0, 3, 0, 0.3);
    speckle(g, 6, 5 - 3, 58, 61 - 3, 60, 3);
    // weather mast at the back corner: anemometer cups and a team beacon
    cylinder(g, 58, 8, 0.8, 3, 22, '#9a9eaa', HULL);
    cable(g, [[54, 8 - 21], [62, 8 - 21]], 0.6, '#b8bcc8');
    for (const x of [54, 62]) { g.fillStyle = '#c4c8d2'; g.beginPath(); g.arc(x, 8 - 21, 1.2, 0, Math.PI * 2); g.fill(); }
    lamp(g, 58, 8 - 23, team);
  }
  // back row, inverter, front row
  solarPanel(g, 6, 10, 30, 28);
  solarPanel(g, 34, 10, 58, 28);
  prism(g, [[26, 31], [38, 31], [38, 39], [26, 39]], 3, 12, '#6a6d78', HULL);
  detailWalls(g, [[26, 31], [38, 31], [38, 39], [26, 39]], 3, 12, 4);
  quad(g, [26, 39 - 10], [38, 39 - 10], [38, 39 - 8], [26, 39 - 8], team, false);
  g.fillStyle = '#7fff8a'; g.fillRect(35, 39 - 6, 2, 2);
  spill(g, 36, 39 - 5, 4, 'rgba(127,255,138,0.4)');
  if (fine) {
    // cable runs from the inverter out to each panel row
    for (const [x, y] of [[18, 28 - 7], [46, 28 - 7], [18, 38 - 16], [46, 38 - 16]] as Pt[])
      cable(g, [[32, 35 - 3], [(32 + x) / 2, (35 - 3 + y) / 2 + 2], [x, y]], 0.7, '#2a2c32');
  }
  solarPanel(g, 6, 38, 30, 56);
  solarPanel(g, 34, 38, 58, 56);
  g.restore();
}

// ---------------- Extractor (refinery) ----------------

// where the live overlay puts the processing glow and the stack lamp
export function extractorLights(w: number): { glow: Pt, lamp: Pt } {
  const s = w / 96;
  return { glow: [52 * s, (56 - 10) * s], lamp: [80 * s, (18 - 62) * s] };
}

export function drawExtractor(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 96; g.scale(s, s);
  prism(g, chamfer(3, 4, 93, 62, 8), 0, 5, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 4, 93, 62, 8), 0, 5);
  if (fine) speckle(g, 6, 4 - 5, 90, 62 - 5, 90, 5);

  // smoke stack at the back right
  cylinder(g, 80, 18, 6, 26, 60, '#2a2c32', '#6a6d78');
  if (fine) {
    // soot toward the lip and heat glowing in the mouth
    const sg = g.createLinearGradient(0, 18 - 60, 0, 18 - 48);
    sg.addColorStop(0, 'rgba(10,8,6,0.55)'); sg.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = sg; g.fillRect(74, 18 - 60, 12, 12);
    spill(g, 80, 18 - 60, 7, 'rgba(255,140,60,0.45)');
  }
  for (const z of [36, 48]) quad(g, [74, 18 - z - 2], [86, 18 - z - 2], [86, 18 - z + 1], [74, 18 - z + 1], team, false);
  g.fillStyle = '#1a1612'; g.beginPath(); g.arc(80, 18 - 60, 4, 0, Math.PI * 2); g.fill();

  // processing hall with a sloped roof
  prism(g, [[34, 12], [90, 12], [90, 56], [34, 56]], 5, 22, null, HULL);
  detailWalls(g, [[34, 12], [90, 12], [90, 56], [34, 56]], 5, 22, 8);
  quad(g, [34, 12 - 30], [90, 12 - 30], [90, 34 - 22], [34, 34 - 22], '#7c808c');   // rear slope
  quad(g, [34, 34 - 22], [90, 34 - 22], [90, 56 - 22], [34, 56 - 22], HULL_TOP);   // flat front roof
  poly(g, [[90, 12 - 30], [90, 12 - 22], [90, 34 - 22]], shade(HULL, 0.8));
  for (let x = 42; x < 88; x += 10) quad(g, [x, 34 - 22 - 1], [x + 6, 34 - 22 - 1], [x + 6, 34 - 22 + 3], [x, 34 - 22 + 3], '#3a3c44', false);
  // intake bay where harvesters unload: dark mouth glowing with crystal slurry
  quad(g, [40, 56 - 18], [64, 56 - 18], [64, 56 - 5], [40, 56 - 5], '#0e1416');
  g.fillStyle = 'rgba(67,243,236,0.55)'; g.fillRect(42, 56 - 10, 20, 4);
  hazard(g, 40, 56 - 21, 24, 3, '#e8c66a');
  // side windows
  for (const x of [70, 78]) quad(g, [x, 56 - 17], [x + 5, 56 - 17], [x + 5, 56 - 12], [x, 56 - 12], GLASS_DK);
  if (fine) {
    for (const x of [70, 78]) { g.fillStyle = GLASS; g.fillRect(x + 1, 56 - 16, 3, 1.2); spill(g, x + 2.5, 56 - 14.5, 4.5, 'rgba(95,224,240,0.25)'); }
    // safety railing along the front roof edge
    cable(g, [[35, 56 - 26], [89, 56 - 26]], 0.5, '#b8bcc8');
    for (let x = 36; x <= 88; x += 8) cable(g, [[x, 56 - 22], [x, 56 - 26]], 0.5, '#b8bcc8');
  }

  // big storage tank on the left, piped into the hall
  g.fillStyle = OUT; g.fillRect(28, 34 - 18, 8, 5);
  g.fillStyle = '#8a8e9a'; g.fillRect(28, 34 - 17, 8, 3);
  cylinder(g, 18, 34, 14, 5, 34, '#9aa0ac', '#6c717e');
  if (fine) {
    // welded ring seams with rivets, and a service ladder up the front
    for (const z of [13, 21, 29]) {
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.6;
      g.beginPath(); g.arc(18, 34 - z, 14, 0.05, Math.PI - 0.05); g.stroke();
      g.strokeStyle = 'rgba(255,240,215,0.14)';
      g.beginPath(); g.arc(18, 34 - z - 0.7, 14, 0.05, Math.PI - 0.05); g.stroke();
    }
    for (const x of [9, 11.5]) cable(g, [[x, 34 + 10.5 - 6], [x, 34 + 10.5 - 33]], 0.5, '#b8bcc8');
    for (let z = 8; z < 33; z += 3) cable(g, [[9, 34 + 10.5 - z], [11.5, 34 + 10.5 - z]], 0.4, '#b8bcc8');
  }
  dome(g, 18, 34, 14, 34, '#9aa0ac');
  quad(g, [4, 34 - 26], [32, 34 - 26], [32, 34 - 22], [4, 34 - 22], team, false);
  // crystal level gauge
  quad(g, [16, 34 - 20], [20, 34 - 20], [20, 34 - 8], [16, 34 - 8], '#0e1416');
  g.fillStyle = GLASS; g.fillRect(17, 34 - 14, 2, 5);
  g.restore();
}

// ---------------- Barracks ----------------

export function drawBarracks(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 6, 61, 61, 6), 0, 4, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 6, 61, 61, 6), 0, 4);
  if (fine) speckle(g, 6, 6 - 4, 58, 61 - 4, 60, 9);

  // LV2+: watch post at the back left
  if (level >= 2) {
    cylinder(g, 12, 14, 6, 4, 30, HULL_TOP, HULL);
    prism(g, chamfer(4, 6, 20, 20, 3), 30, 33, '#6a6d78', HULL);
    lamp(g, 12, 14 - 36, team);
  }

  // armoured bunker: straight walls, a sloped armour skirt on the front
  const body = chamfer(10, 12, 56, 50, 6);
  prism(g, body, 4, 22, null, '#5d6170');
  detailWalls(g, body, 4, 22, 7);
  quad(g, [12, 50 - 10], [54, 50 - 10], [56, 55 - 4], [10, 55 - 4], '#4b4f5c');          // skirt
  prism(g, body, 22, 25, null, level >= 3 ? GOLD : team);                                 // trim band
  prism(g, body, 25, 26, '#7e8290', '#5d6170');
  if (fine) speckle(g, 12, 12 - 26, 54, 50 - 26, 50, 13);
  // roof: hatch, vents, sandbag-style armour blocks along the rim
  prism(g, [[26, 22], [40, 22], [40, 32], [26, 32]], 26, 29, '#5a5d69', HULL);
  for (const x of [14, 46]) quad(g, [x, 40 - 26 - 1], [x + 6, 40 - 26 - 1], [x + 6, 40 - 26 + 2], [x, 40 - 26 + 2], '#3a3c44', false);
  // entrance: team-framed doorway in the skirt
  quad(g, [26, 55 - 18], [40, 55 - 18], [40, 55 - 4], [26, 55 - 4], team);
  quad(g, [28, 55 - 16], [38, 55 - 16], [38, 55 - 4], [28, 55 - 4], '#14110e');
  g.fillStyle = '#e8c66a'; g.fillRect(30, 55 - 14, 6, 1.5);
  // slit windows either side of the door
  for (const x of [15, 44]) quad(g, [x, 50 - 18], [x + 7, 50 - 18], [x + 7, 50 - 15], [x, 50 - 15], GLASS_DK);
  g.fillStyle = GLASS; g.fillRect(16, 50 - 17, 5, 1); g.fillRect(45, 50 - 17, 5, 1);
  if (fine) {
    for (const x of [18.5, 47.5]) spill(g, x, 50 - 16.5, 4.5, 'rgba(95,224,240,0.25)');
    spill(g, 33, 55 - 13.5, 6, 'rgba(232,198,106,0.35)');
    // sandbag walls either side of the entrance
    for (const [x0, n] of [[14, 3], [42, 3]] as [number, number][])
      for (let row = 0; row < 2; row++) for (let i = 0; i < n - row; i++) {
        const x = x0 + i * 3.4 + row * 1.7, y = 58.5 - row * 2.2;
        g.fillStyle = edgeOf('#8a7a5a'); g.beginPath(); g.ellipse(x, y, 1.9, 1.3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = row ? '#a08e68' : '#8a7a5a'; g.beginPath(); g.ellipse(x, y - 0.3, 1.6, 1, 0, 0, Math.PI * 2); g.fill();
      }
  }

  flag(g, 52, 16, 26, level >= 3 ? 52 : 44, team);
  // LV3: roof antenna and floodlight
  if (level >= 3) {
    g.fillStyle = OUT; g.fillRect(31, 22 - 46, 3, 18);
    g.fillStyle = STEEL; g.fillRect(32, 22 - 46, 1, 17);
    lamp(g, 18, 40 - 30, '#fff3c4');
  }
  g.restore();
}

// ---------------- Fabricator (vehicle factory) ----------------

export function drawFabricator(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save();
  const s = w / 96; g.scale(s, s);
  prism(g, chamfer(3, 6, 93, 93, 8), 0, 5, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 6, 93, 93, 8), 0, 5);
  // vehicle apron in front of the doors
  quad(g, [32, 93 - 5], [64, 93 - 5], [66, 95], [30, 95], shade(CONCRETE_TOP, 0.85));
  if (fine) {
    speckle(g, 6, 6 - 5, 90, 93 - 5, 110, 17);
    // tyre tracks worn into the apron
    g.strokeStyle = 'rgba(20,14,10,0.22)'; g.lineWidth = 2.2;
    for (const x of [40, 56]) { g.beginPath(); g.moveTo(x, 80 - 5); g.quadraticCurveTo(x + 2, 88 - 5, x - 3, 94); g.stroke(); }
  }

  // LV2+: gantry crane over the back right corner
  if (level >= 2) {
    for (const x of [70, 88]) { g.fillStyle = OUT; g.fillRect(x - 2, 16 - 54, 4, 50); g.fillStyle = '#e8c66a'; g.fillRect(x - 1, 16 - 53, 2, 48); }
    quad(g, [66, 16 - 56], [92, 16 - 56], [92, 16 - 51], [66, 16 - 51], '#e8c66a');
    g.fillStyle = OUT; g.fillRect(78, 16 - 51, 2, 12);
    prism(g, [[74, 16 - 39 + 16], [84, 16 - 39 + 16], [84, 16 - 39 + 22], [74, 16 - 39 + 22]], 0, 4, '#6a6d78', HULL);
  }

  // hangar: side walls, arched roof running north-south, front gable
  const x0 = 10, x1 = 86, yb = 14, yf = 80, zw = 26, R = 18;
  prism(g, [[x0, yb], [x1, yb], [x1, yf], [x0, yf]], 5, zw, null, '#5a5e6c');
  const zr = (x: number) => zw + R * Math.sqrt(Math.max(0, 1 - ((x - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2));
  const xs: number[] = [];
  for (let x = x0; x <= x1; x += 2) xs.push(x);
  // roof surface, lit on the west half
  g.beginPath();
  xs.forEach((x, i) => i ? g.lineTo(x, yb - zr(x)) : g.moveTo(x, yb - zr(x)));
  for (let i = xs.length - 1; i >= 0; i--) g.lineTo(xs[i], yf - zr(xs[i]));
  g.closePath();
  const rg = g.createLinearGradient(x0, 0, x1, 0);
  rg.addColorStop(0, '#a3a8b4'); rg.addColorStop(0.4, '#8a8f9c'); rg.addColorStop(1, '#5a5e6a');
  g.fillStyle = rg; g.fill(); g.strokeStyle = edgeOf('#5a5e6a'); g.lineWidth = edgeW(); g.stroke();
  // roof ribs and skylights
  g.strokeStyle = 'rgba(26,18,12,0.55)'; g.lineWidth = 1.2;
  for (let y = yb + 8; y < yf; y += 9) {
    g.beginPath(); xs.forEach((x, i) => i ? g.lineTo(x, y - zr(x)) : g.moveTo(x, y - zr(x))); g.stroke();
  }
  if (level >= 3) {
    for (let y = yb + 10; y < yf - 12; y += 18)
      quad(g, [44, y - zr(44)], [52, y - zr(52)], [52, y + 6 - zr(52)], [44, y + 6 - zr(44)], '#24406a');
  }
  // front gable wall
  g.beginPath();
  g.moveTo(x0, yf - 5);
  xs.forEach(x => g.lineTo(x, yf - zr(x)));
  g.lineTo(x1, yf - 5);
  g.closePath();
  g.fillStyle = '#6a6e7c'; g.fill(); g.strokeStyle = edgeOf('#6a6e7c'); g.lineWidth = edgeW(); g.stroke();
  if (fine) {
    wallSeams(g, [x0, yf], [x1, yf], 5, zw, 8);
    wallAO(g, [x0, yf], [x1, yf], 5, 6, 0.38);
    // roof exhaust vents on either flank
    for (const vx of [24, 72]) {
      const vz = zr(vx);
      cylinder(g, vx, 34, 2.4, vz - 1, vz + 6, '#2a2c32', '#6a6d78');
      g.fillStyle = '#14110e'; g.beginPath(); g.arc(vx, 34 - vz - 6, 1.6, 0, Math.PI * 2); g.fill();
    }
  }
  // team band across the gable and a round vent at its peak
  quad(g, [x0, yf - zw + 2], [x1, yf - zw + 2], [x1, yf - zw + 6], [x0, yf - zw + 6], level >= 3 ? GOLD : team, false);
  g.fillStyle = OUT; g.beginPath(); g.arc(48, yf - zw - 9, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a3c44'; g.beginPath(); g.arc(48, yf - zw - 9, 4.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#6a6e7c'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(44, yf - zw - 9); g.lineTo(52, yf - zw - 9); g.moveTo(48, yf - zw - 13); g.lineTo(48, yf - zw - 5); g.stroke();
  // roller door with hazard frame
  hazard(g, 30, yf - 23, 36, 3, '#e8c66a');
  if (fine) for (const x of [27, 69]) lamp(g, x, yf - 21.5, '#ffb02e');
  quad(g, [32, yf - 20], [64, yf - 20], [64, yf - 5], [32, yf - 5], '#3a3d46');
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
  for (let y = yf - 18; y < yf - 5; y += 3) { g.beginPath(); g.moveTo(33, y); g.lineTo(63, y); g.stroke(); }
  // side windows
  for (const x of [16, 72]) {
    quad(g, [x, yf - 18], [x + 8, yf - 18], [x + 8, yf - 12], [x, yf - 12], GLASS_DK);
    g.fillStyle = GLASS; g.fillRect(x + 1, yf - 16, 6, 2);
    spill(g, x + 4, yf - 15, 6, 'rgba(95,224,240,0.25)');
  }
  g.restore();
}

// ---------------- Fusion Reactor ----------------

const COPPER = '#c8783a';

// centre of the caged star, for the live pulse overlay
export function fusionCore(w: number): Pt {
  const s = w / 64;
  return [32 * s, (38 - 30) * s];
}

// magnetic coil pylon standing on the containment drum
function coilPylon(g: Ctx, x: number, y: number, level: number, team: string) {
  prism(g, [[x - 2, y - 2], [x + 2, y - 2], [x + 2, y + 2], [x - 2, y + 2]], 18, 42, '#6a6d78', HULL);
  for (const z of [24, 30, 36]) quad(g, [x - 3, y + 2 - z - 2], [x + 3, y + 2 - z - 2], [x + 3, y + 2 - z + 1], [x - 3, y + 2 - z + 1], COPPER);
  if (level >= 3) lamp(g, x, y - 44, team);
  else { g.fillStyle = OUT; g.fillRect(x - 2, y - 46, 4, 4); g.fillStyle = STEEL; g.fillRect(x - 1, y - 45, 2, 2); }
}

export function drawFusion(g: Ctx, w: number, _h: number, level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 8), 0, 4, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 8), 0, 4);
  if (fine) speckle(g, 6, 5 - 4, 58, 61 - 4, 60, 29);

  // LV2+: radiator fin bank along the back edge
  if (level >= 2) {
    for (let x = 22; x <= 40; x += 4) prism(g, [[x, 8], [x + 2, 8], [x + 2, 16], [x, 16]], 4, 22, '#8a8e9a', '#5a5e6a');
  }
  // coolant tanks in the back corners, piped into the drum
  for (const tx of [11, 53]) {
    cylinder(g, tx, 14, 7, 4, 22, '#9aa0ac', '#6c717e');
    dome(g, tx, 14, 7, 22, '#9aa0ac');
    quad(g, [tx - 7, 14 - 16], [tx + 7, 14 - 16], [tx + 7, 14 - 13], [tx - 7, 14 - 13], team, false);
  }
  for (const [x0, x1] of [[16, 22], [42, 48]]) { g.fillStyle = OUT; g.fillRect(x0, 22 - 12, x1 - x0, 5); g.fillStyle = '#8a8e9a'; g.fillRect(x0, 22 - 11, x1 - x0, 3); }

  // containment drum: hull, team band, cap
  cylinder(g, 32, 38, 20, 4, 12, HULL_TOP, HULL);
  cylinder(g, 32, 38, 20, 12, 15, team, level >= 3 ? GOLD : team);
  cylinder(g, 32, 38, 20, 15, 18, HULL_TOP, HULL);
  if (fine) {
    // rivets round the band and a shadow line under it
    for (let t = 0.15; t < Math.PI; t += 0.26) {
      const x = 32 + Math.cos(t) * 20, y = 38 + Math.sin(t) * 20 - 13.5;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - 0.3, y + 0.3, 1, 1);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x - 0.6, y, 0.9, 0.9);
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.8;
    g.beginPath(); g.arc(32, 38 - 11.6, 20, 0.05, Math.PI - 0.05); g.stroke();
  }
  // vent slots on the drum face
  for (const x of [18, 26, 34, 42]) quad(g, [x, 58 - 10], [x + 4, 58 - 10], [x + 4, 58 - 6], [x, 58 - 6], '#1e1f24', false);
  // emitter ring on the drum top
  g.beginPath(); g.arc(32, 38 - 18, 12, 0, Math.PI * 2);
  g.fillStyle = '#3a3c44'; g.fill(); g.strokeStyle = edgeOf('#3a3c44'); g.lineWidth = edgeW(); g.stroke();

  // back coil pylons, the caged star, front coil pylons
  coilPylon(g, 15, 30, level, team);
  coilPylon(g, 49, 30, level, team);
  const [sx, sy] = [32, 38 - 30];
  glow(g, sx, sy, 22, 'rgba(255,190,90,0.5)');
  const sg = g.createRadialGradient(sx - 3, sy - 4, 1, sx, sy, 11);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.35, '#ffe9a8'); sg.addColorStop(0.8, '#ffb43c'); sg.addColorStop(1, '#e0702a');
  g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, 11, 0, Math.PI * 2); g.fill();
  g.strokeStyle = fine ? '#a04a18' : OUT; g.lineWidth = edgeW(); g.stroke();
  if (fine) {
    // corona and four faint flares
    spill(g, sx, sy, 17, 'rgba(255,200,120,0.35)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,230,170,0.35)'; g.lineWidth = 0.8;
    g.beginPath();
    for (const t of [0.4, 2.0, 3.5, 5.1]) { g.moveTo(sx + Math.cos(t) * 12, sy + Math.sin(t) * 12); g.lineTo(sx + Math.cos(t) * 18, sy + Math.sin(t) * 18); }
    g.stroke(); g.restore();
  }
  // containment straps across the star
  g.strokeStyle = OUT; g.lineWidth = fine ? 1.5 : 2;
  g.beginPath(); g.ellipse(sx, sy, 11, 4, 0, 0, Math.PI); g.stroke();
  g.beginPath(); g.ellipse(sx, sy, 4, 11, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.strokeStyle = STEEL; g.lineWidth = 1;
  g.beginPath(); g.ellipse(sx, sy, 11, 4, 0, 0.3, Math.PI - 0.3); g.stroke();
  coilPylon(g, 15, 46, level, team);
  coilPylon(g, 49, 46, level, team);
  g.restore();
}

// ---------------- Research Spire ----------------

// warning light on the spike tip, for the live blink overlay
export function spireLight(w: number): Pt {
  const s = w / 64;
  return [32 * s, (34 - 84) * s];
}

export function drawSpire(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 8), 0, 4, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 8), 0, 4);
  if (fine) speckle(g, 6, 5 - 4, 58, 61 - 4, 60, 31);

  // base block with a team band
  const base = chamfer(10, 14, 54, 56, 8);
  prism(g, base, 4, 15, null, '#5d6170');
  detailWalls(g, base, 4, 15, 7);
  prism(g, base, 15, 18, null, team);
  prism(g, base, 18, 20, HULL_TOP, HULL);
  // entrance and base windows
  quad(g, [26, 56 - 15], [38, 56 - 15], [38, 56 - 4], [26, 56 - 4], '#14110e');
  hazard(g, 25, 56 - 18, 14, 2.5, GOLD);
  for (const x of [15, 43]) {
    quad(g, [x, 56 - 13], [x + 6, 56 - 13], [x + 6, 56 - 9], [x, 56 - 9], GLASS_DK);
    g.fillStyle = GLASS; g.fillRect(x + 1, 56 - 12, 4, 1);
    spill(g, x + 3, 56 - 11, 4.5, 'rgba(95,224,240,0.25)');
  }
  // sensor dish on the base roof
  cylinder(g, 48, 24, 3, 20, 26, '#6a6d78', HULL);
  g.save(); g.translate(48, 24 - 29); g.rotate(0.45);
  g.beginPath(); g.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
  g.fillStyle = '#c4c8d2'; g.fill(); g.strokeStyle = edgeOf('#8a8f9c'); g.lineWidth = edgeW(); g.stroke();
  g.fillStyle = '#7a7f8c'; g.beginPath(); g.ellipse(1, 1, 4, 1.8, 0, 0, Math.PI * 2); g.fill();
  g.restore();

  // shaft with a lit window column and side buttress fins
  const shaft = chamfer(21, 24, 43, 44, 5);
  prism(g, shaft, 20, 52, null, '#5d6170');
  detailWalls(g, shaft, 20, 52, 5, 0.3);
  for (let z = 26; z <= 46; z += 6) {
    quad(g, [29, 44 - z - 3], [35, 44 - z - 3], [35, 44 - z], [29, 44 - z], GLASS_DK, false);
    g.fillStyle = GLASS; g.fillRect(30, 44 - z - 2, 4, 1.2);
  }
  poly(g, [[21, 40 - 46], [21, 40 - 20], [14, 40 - 20]], shade('#5d6170', 1.15));
  poly(g, [[43, 40 - 46], [43, 40 - 20], [50, 40 - 20]], shade('#5d6170', 0.78));

  // observation deck: team band, glazed ring, cap
  const deck = chamfer(18, 21, 46, 47, 7);
  prism(g, deck, 52, 55, null, team);
  prism(g, deck, 55, 61, null, HULL);
  for (let x = 23; x <= 37; x += 7) {
    quad(g, [x, 47 - 60], [x + 4, 47 - 60], [x + 4, 47 - 56], [x, 47 - 56], GLASS_DK, false);
    g.fillStyle = GLASS; g.fillRect(x + 0.5, 47 - 59, 3, 1.2);
    spill(g, x + 2, 47 - 58, 4, 'rgba(95,224,240,0.3)');
  }
  prism(g, deck, 61, 62, HULL_TOP, HULL);

  // upper needle and spike
  prism(g, chamfer(26, 29, 38, 39, 3), 62, 74, '#7e8290', '#5d6170');
  poly(g, [[29, 34 - 74], [35, 34 - 74], [32, 34 - 84]], STEEL);
  g.fillStyle = OUT; g.beginPath(); g.arc(32, 34 - 84, 2.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff6a5a'; g.beginPath(); g.arc(32, 34 - 84, 1.6, 0, Math.PI * 2); g.fill();
  if (fine) {
    // guy wires from the spike down to the deck, aviation lights on its corners
    g.strokeStyle = 'rgba(200,205,215,0.45)'; g.lineWidth = 0.4;
    g.beginPath();
    for (const x of [19, 45]) { g.moveTo(32, 34 - 80); g.lineTo(x, 40 - 62); }
    g.stroke();
    for (const x of [19.5, 44.5]) { g.fillStyle = '#ff6a5a'; g.fillRect(x - 0.6, 44 - 62.6, 1.2, 1.2); spill(g, x, 44 - 62, 3, 'rgba(255,90,80,0.5)'); }
  }
  g.restore();
}

// ---------------- Laboratory ----------------

const BIO = '#7dff9a', BIO_DK = '#1f4a34';

// status lamp on the exhaust stack, for the live flicker overlay
export function labLight(w: number): Pt {
  const s = w / 64;
  return [12 * s, (18 - 38) * s];
}

export function drawLab(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 6), 0, 3, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 6), 0, 3, 0, 0.3);
  if (fine) speckle(g, 6, 5 - 3, 58, 61 - 3, 60, 37);

  // exhaust stack at the back of the lab block
  cylinder(g, 12, 18, 4, 3, 36, '#6a6d78', '#5a5e6a');
  quad(g, [8, 18 - 30], [16, 18 - 30], [16, 18 - 28], [8, 18 - 28], team, false);
  g.fillStyle = '#1a1612'; g.beginPath(); g.arc(12, 18 - 36, 2.5, 0, Math.PI * 2); g.fill();

  // lab block: walls, team band, cap, roof vents
  const block = chamfer(6, 10, 34, 50, 4);
  prism(g, block, 3, 18, null, '#5d6170');
  detailWalls(g, block, 3, 18, 7);
  prism(g, block, 18, 20, null, team);
  prism(g, block, 20, 22, HULL_TOP, HULL);
  if (fine) speckle(g, 8, 10 - 22, 32, 50 - 22, 40, 41);
  for (const vy of [18, 32]) prism(g, [[20, vy], [29, vy], [29, vy + 6], [20, vy + 6]], 22, 25, '#3a3c44', HULL);
  // airlock door with a hazard header, and a lit window
  hazard(g, 9, 50 - 17, 12, 2.5, GOLD);
  quad(g, [10, 50 - 14], [20, 50 - 14], [20, 50 - 3], [10, 50 - 3], '#14110e');
  g.fillStyle = BIO; g.fillRect(14, 50 - 11, 2, 2);
  quad(g, [24, 50 - 15], [31, 50 - 15], [31, 50 - 9], [24, 50 - 9], GLASS_DK);
  g.fillStyle = BIO; g.fillRect(25, 50 - 12, 5, 2);
  spill(g, 27.5, 50 - 11, 5, 'rgba(125,255,154,0.3)');
  spill(g, 15, 50 - 10, 4, 'rgba(125,255,154,0.3)');

  // greenhouse dome on a hull ring, specimens visible through the glass
  cylinder(g, 47, 30, 12, 3, 8, HULL_TOP, HULL);
  dome(g, 47, 30, 11, 8, '#4a9c8c');
  g.save();
  g.beginPath(); g.ellipse(47, 30 - 8, 11, 10.4, 0, Math.PI, 0); g.arc(47, 30 - 8, 11, 0, Math.PI); g.clip();
  g.fillStyle = 'rgba(40,110,60,0.8)';
  for (const [lx, ly, lr] of [[42, 30 - 10, 4], [50, 30 - 12, 5], [46, 30 - 15, 3.5], [53, 30 - 9, 3]])
    { g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(26,18,12,0.5)'; g.lineWidth = 1;
  for (const rx of [4, 8]) { g.beginPath(); g.ellipse(47, 30 - 8, rx, 10.4, 0, Math.PI, 0); g.stroke(); }
  g.beginPath(); g.moveTo(36, 30 - 13); g.lineTo(58, 30 - 13); g.stroke();
  g.fillStyle = 'rgba(220,255,250,0.45)';
  g.beginPath(); g.ellipse(43, 30 - 15, 2.5, 4, -0.5, 0, Math.PI * 2); g.fill();
  g.restore();

  // specimen vats in front of the dome, glowing culture fluid
  if (fine) cable(g, [[34, 46 - 10], [37, 50 - 10], [40, 50 - 10]], 1.2, '#4a4d56');   // feed pipe from the lab
  for (const vx of [40, 52]) {
    cylinder(g, vx, 52, 4.5, 3, 16, '#9aa0ac', BIO_DK);
    quad(g, [vx - 3, 52 - 13], [vx + 3, 52 - 13], [vx + 3, 52 - 6], [vx - 3, 52 - 6], BIO, false);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(vx - 2, 52 - 12, 1, 5);
    glow(g, vx, 52 - 10, 7, 'rgba(125,255,154,0.35)');
    if (fine) {
      g.fillStyle = 'rgba(230,255,235,0.75)';
      for (const [bx, by] of [[0.8, 8], [-0.6, 10.5], [1.6, 11.8]] as Pt[]) { g.beginPath(); g.arc(vx + bx, 52 - by, 0.55, 0, Math.PI * 2); g.fill(); }
    }
  }
  g.restore();
}

// ---------------- Sensor Array ----------------
// the radar dish itself is the live overlay, spinning on top of the mast

export function drawSensor(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 32; g.scale(s, s);
  prism(g, chamfer(2, 4, 30, 30, 4), 0, 2, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(2, 4, 30, 30, 4), 0, 2, 0, 0.3);
  // whip antenna at the back corner
  cylinder(g, 26, 8, 0.6, 2, 20, '#9a9eaa', HULL);
  g.fillStyle = '#ff6a5a'; g.fillRect(25.4, 8 - 21, 1.2, 1.2);
  // equipment housing
  const hut: Pt[] = [[7, 12], [25, 12], [25, 25], [7, 25]];
  prism(g, hut, 2, 6, HULL_TOP, HULL);
  detailWalls(g, hut, 2, 6, 6);
  quad(g, [7, 25 - 5], [25, 25 - 5], [25, 25 - 4.2], [7, 25 - 4.2], team, false);
  for (const x of [9, 20]) quad(g, [x, 25 - 3.6], [x + 3, 25 - 3.6], [x + 3, 25 - 2.4], [x, 25 - 2.4], '#1e1f24', false);
  // mast up to the dish
  cylinder(g, 16, 20, 1.6, 6, 10.4, '#6a6d78', HULL);
  g.restore();
}

// ---------------- Repair Yard ----------------

export function drawRepairYard(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 6), 0, 3, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 6), 0, 3);
  if (fine) speckle(g, 6, 5 - 3, 58, 61 - 3, 70, 43);
  // back of the yard: tool racks and an air tank
  const rack: Pt[] = [[12, 7], [32, 7], [32, 11], [12, 11]];
  prism(g, rack, 3, 12, '#6a6d78', '#4a4d56');
  detailWalls(g, rack, 3, 12, 5);
  for (let x = 14; x < 31; x += 3) quad(g, [x, 11 - 10], [x + 1.2, 11 - 10], [x + 1.2, 11 - 5], [x, 11 - 5], '#b8bcc8', false);
  cylinder(g, 49, 11, 4, 3, 13, '#9aa0ac', '#6c717e');
  dome(g, 49, 11, 4, 13, '#9aa0ac');
  quad(g, [45, 11 - 9], [53, 11 - 9], [53, 11 - 7.5], [45, 11 - 7.5], team, false);
  // the service bay marked out on the slab
  g.strokeStyle = 'rgba(61,220,132,0.75)'; g.lineWidth = 1.2; g.setLineDash([3, 2]);
  g.strokeRect(15, 17 - 3, 34, 34); g.setLineDash([]);
  g.strokeStyle = 'rgba(61,220,132,0.4)';
  g.beginPath(); g.moveTo(26, 34 - 3); g.lineTo(38, 34 - 3); g.moveTo(32, 28 - 3); g.lineTo(32, 40 - 3); g.stroke();
  // gantry crane spanning the bay
  for (const x0 of [7, 52]) {
    const leg: Pt[] = [[x0, 31], [x0 + 5, 31], [x0 + 5, 36], [x0, 36]];
    prism(g, leg, 3, 30, '#6a6d78', '#5d6170');
    detailWalls(g, leg, 3, 30, 0, 0.3);
    quad(g, [x0, 36 - 20], [x0 + 5, 36 - 20], [x0 + 5, 36 - 17], [x0, 36 - 17], team, false);
  }
  const beam: Pt[] = [[7, 31], [57, 31], [57, 36], [7, 36]];
  prism(g, beam, 26, 31, GOLD, '#b8923e');
  for (let x = 9; x < 56; x += 5) quad(g, [x, 36 - 30], [x + 2.5, 36 - 30], [x + 1.5, 36 - 27], [x - 1, 36 - 27], 'rgba(16,10,6,0.75)', false);
  // trolley, hoist line and a welding spark on the arm
  prism(g, [[29, 30], [36, 30], [36, 37], [29, 37]], 22, 26, '#848894', HULL);
  cable(g, [[32.5, 37 - 22], [32.5, 37 - 12]], 0.5, '#2a2c32');
  g.fillStyle = '#ffffff'; g.fillRect(32, 37 - 12.5, 1, 1);
  spill(g, 32.5, 37 - 12, 7, 'rgba(160,255,200,0.5)');
  for (const x of [9.5, 54.5]) lamp(g, x, 33 - 32, '#3ddc84');
  g.restore();
}

// ---------------- Skyport ----------------

export function drawSkyport(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 8), 0, 3, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 8), 0, 3);
  if (fine) speckle(g, 6, 5 - 3, 58, 61 - 3, 70, 47);
  // fuel tanks at the back left
  for (const tx of [9, 17]) {
    cylinder(g, tx, 10, 3.4, 3, 11, '#9aa0ac', '#6c717e');
    dome(g, tx, 10, 3.4, 11, '#9aa0ac');
  }
  // control tower at the back right with a glazed cab
  const tower: Pt[] = [[49, 5], [59, 5], [59, 15], [49, 15]];
  prism(g, tower, 3, 22, null, '#5d6170');
  detailWalls(g, tower, 3, 22, 5);
  prism(g, [[48, 4], [60, 4], [60, 16], [48, 16]], 22, 27, '#848894', GLASS_DK);
  quad(g, [48, 16 - 26], [60, 16 - 26], [60, 16 - 24.6], [48, 16 - 26 + 1.4], GLASS, false);
  spill(g, 54, 16 - 24.5, 6, 'rgba(95,224,240,0.3)');
  cylinder(g, 56, 9, 0.6, 27, 34, '#9a9eaa', HULL);
  g.fillStyle = '#ff6a5a'; g.fillRect(55.4, 9 - 35, 1.2, 1.2);
  // raised landing deck with its markings and edge lights
  cylinder(g, 30, 35, 22, 3, 6, '#565a64', HULL);
  const dy = 35 - 6;
  g.strokeStyle = GOLD; g.lineWidth = 1.2; g.setLineDash([4, 3]);
  g.beginPath(); g.arc(30, dy, 18, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.strokeStyle = team; g.lineWidth = 2;
  g.beginPath(); g.arc(30, dy, 10, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(235,238,245,0.85)';
  g.fillRect(25, dy - 6, 2.2, 12); g.fillRect(32.8, dy - 6, 2.2, 12); g.fillRect(25, dy - 1.1, 10, 2.2);   // H
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2, x = 30 + Math.cos(t) * 20.5, y = dy + Math.sin(t) * 20.5;
    const col = k % 2 ? team : '#ffffff';
    g.fillStyle = col; g.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
    spill(g, x, y, 2.4, k % 2 ? 'rgba(77,184,255,0.35)' : 'rgba(255,255,255,0.3)');
  }
  if (fine) speckle(g, 12, dy - 18, 48, dy + 18, 40, 53);
  // windsock on the front corner
  flag(g, 58, 58, 3, 18, team);
  g.restore();
}

// ---------------- Orbital Uplink ----------------

export function drawUplink(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 8), 0, 4, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 8), 0, 4);
  if (fine) speckle(g, 6, 5 - 4, 58, 61 - 4, 60, 59);
  // back capacitor banks
  const capacitor = (x: number, y: number) => {
    cylinder(g, x, y, 3.4, 4, 15, '#6a6d78', HULL);
    g.fillStyle = '#5fe0f0'; g.beginPath(); g.arc(x, y - 15, 2.2, 0, Math.PI * 2); g.fill();
    spill(g, x, y - 15, 6, 'rgba(95,224,240,0.45)');
  };
  capacitor(9, 11); capacitor(55, 11);
  // octagonal base with a team band
  const base = chamfer(13, 17, 51, 53, 8);
  prism(g, base, 4, 11, null, '#5d6170');
  detailWalls(g, base, 4, 11, 6);
  prism(g, base, 11, 13, null, team);
  prism(g, base, 13, 14, HULL_TOP, HULL);
  // yoke arms holding the dish
  for (const x0 of [19, 42]) { const arm: Pt[] = [[x0, 31], [x0 + 3, 31], [x0 + 3, 37], [x0, 37]]; prism(g, arm, 14, 28, '#848894', TANK); }
  // the dish, tilted at the sky: back shell, then the bowl with its ribs
  const cx = 32, cy = 34 - 30, rx = 19, ry = 13;
  g.fillStyle = '#4a4d56'; g.beginPath(); g.ellipse(cx, cy + 3, rx - 1, ry - 1, -0.12, 0, Math.PI * 2); g.fill();
  // concave: the inner wall facing the north-west sun (south-east side) is lit,
  // the far inner wall falls into shade
  const bowl = g.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.6, cy + ry);
  bowl.addColorStop(0, '#5e636e'); bowl.addColorStop(0.45, '#9da2ae'); bowl.addColorStop(1, '#eef0f4');
  g.beginPath(); g.ellipse(cx, cy, rx, ry, -0.12, 0, Math.PI * 2);
  g.fillStyle = bowl; g.fill();
  g.strokeStyle = '#c4c8d2'; g.lineWidth = 1.8; g.stroke();                                   // raised rim
  g.strokeStyle = edgeOf('#7a7f8c'); g.lineWidth = edgeW();
  g.beginPath(); g.ellipse(cx, cy, rx + 0.9, ry + 0.9, -0.12, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(40,44,52,0.3)'; g.lineWidth = 0.6;
  g.beginPath();
  for (let k = 0; k < 10; k++) { const t = (k / 10) * Math.PI * 2; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t) * rx * 0.97, cy + Math.sin(t) * ry * 0.97); }
  g.stroke();
  g.beginPath(); g.ellipse(cx, cy, rx * 0.55, ry * 0.55, -0.12, 0, Math.PI * 2); g.stroke();
  // emitter on a tripod at the focus
  const fx = cx, fy = cy - 20;
  cable(g, [[cx - rx * 0.8, cy + 2], [fx, fy]], 0.8, '#9a9eaa');
  cable(g, [[cx + rx * 0.8, cy + 2], [fx, fy]], 0.8, '#9a9eaa');
  cable(g, [[cx, cy - ry * 0.85], [fx, fy]], 0.8, '#9a9eaa');
  prism(g, [[fx - 2.5, fy + 18], [fx + 2.5, fy + 18], [fx + 2.5, fy + 23], [fx - 2.5, fy + 23]], 18, 22.5, '#6a6d78', '#3a3c44');   // emitter housing
  g.save(); g.globalCompositeOperation = 'lighter';
  glow(g, fx, fy - 1, 14, 'rgba(120,230,255,0.6)');
  g.restore();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(fx, fy - 1, 1.8, 0, Math.PI * 2); g.fill();
  // front capacitor banks and warning lights
  capacitor(9, 55); capacitor(55, 55);
  for (const x of [14, 50]) { g.fillStyle = '#ff6a5a'; g.fillRect(x - 0.7, 53 - 14.7, 1.4, 1.4); spill(g, x, 53 - 14, 3, 'rgba(255,90,80,0.5)'); }
  g.restore();
}

// ---------------- vehicles (refined style) ----------------
// Drawn around the unit's ground point (0,0), rotated on the ground plane, so
// prism() still shades whichever walls end up facing the viewer.

function rot(pts: Pt[], a: number): Pt[] {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt);
}
const at = (x: number, y: number, a: number): Pt => rot([[x, y]], a)[0];

// ---------------- Hover Tank ----------------

const TANK_TOP = '#7e8290', TANK = '#5d6170', SKIRT = '#3a3d46';

function drawHoverTankHull(g: Ctx, a: number, team: string) {
  // hover pads: cyan downdraft glowing on the ground under each corner
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [x, y] of [[9, -7], [9, 7], [-10, -7], [-10, 7]] as Pt[]) {
    const [px, py] = at(x, y, a);
    glow(g, px, py, 6.5, 'rgba(110,210,255,0.4)');
  }
  g.restore();

  const hull: Pt[] = [[-12, -10], [11, -10], [15, -5], [15, 5], [11, 10], [-12, 10], [-15, 6], [-15, -6]];
  prism(g, rot(hull, a), 2, 4, null, SKIRT);                       // armoured skirt
  const deck: Pt[] = [[-11, -9], [10, -9], [13.5, -4.5], [13.5, 4.5], [10, 9], [-11, 9], [-13.5, 5.5], [-13.5, -5.5]];
  prism(g, rot(deck, a), 4, 8, TANK_TOP, TANK);                    // hull body + deck
  const top = (x: number, y: number) => { const [px, py] = at(x, y, a); return [px, py - 8] as Pt; };
  const plate = (x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient, stroke = false) =>
    poly(g, [top(x0, y0), top(x1, y0), top(x1, y1), top(x0, y1)], fill, stroke);

  // engine deck at the rear: dark grille with slats
  plate(-13, -5.5, -7, 5.5, '#2a2c32', true);
  for (const y of [-3.5, -1, 1.5, 4]) plate(-12.5, y - 0.5, -7.5, y + 0.3, '#4a4d56');
  // team stripes down both flanks, a sensor bar across the nose
  plate(-5, -8.2, 9, -6.6, team);
  plate(-5, 6.6, 9, 8.2, team);
  plate(11, -3, 13, 3, GLASS_DK, true);
  plate(11.4, -2.2, 12.4, 2.2, GLASS);
  // panel seams and a lit front lip
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.5;
  g.beginPath();
  for (const x of [-7, 9]) { const p0 = top(x, -8.5), p1 = top(x, 8.5); g.moveTo(...p0); g.lineTo(...p1); }
  g.stroke();
  // weathering, kept to the deck
  g.save();
  g.beginPath();
  rot(deck, a).forEach(([x, y], i) => i ? g.lineTo(x, y - 8) : g.moveTo(x, y - 8));
  g.closePath(); g.clip();
  speckle(g, -15, -26, 15, 4, 40, 23);
  g.restore();
}

function drawHoverTankTurret(g: Ctx, a: number, team: string) {
  const z0 = 9.5, z1 = 13;
  const barrels = () => {
    for (const y of [-1.8, 1.8]) prism(g, rot([[7, y - 0.8], [20, y - 0.8], [20, y + 0.8], [7, y + 0.8]], a), 10.6, 12.2, '#9a9eaa', '#4a4d56');
    prism(g, rot([[19, -3], [22.5, -3], [22.5, 3], [19, 3]], a), 10.2, 12.6, '#6a6d78', '#3a3c44');   // muzzle brake
  };
  cylinder(g, 0, 0, 6.5, 8, z0, HULL_TOP, HULL);                   // turret ring
  const away = Math.sin(a) < 0;                                     // barrels pointing up-screen sit behind the head
  if (away) barrels();
  const head: Pt[] = [[-7.5, -5], [3, -5], [7, -2.5], [7, 2.5], [3, 5], [-7.5, 5]];
  prism(g, rot(head, a), z0, z1, '#848894', TANK);
  const top = (x: number, y: number) => { const [px, py] = at(x, y, a); return [px, py - z1] as Pt; };
  poly(g, [top(-6.5, -4), top(-4, -4), top(-4, 4), top(-6.5, 4)], team, false);   // team band across the back
  poly(g, [top(3, -4), top(5.5, -2), top(5.5, -0.5), top(3, -0.5)], GLASS_DK);      // gunner sight
  const [hx, hy] = at(-1.5, 2.2, a);
  cylinder(g, hx, hy, 1.7, z1, z1 + 1, '#6a6d78', HULL);           // commander hatch
  if (!away) barrels();
}

// refined-style vehicle art by unit id: hull and turret are baked separately so
// the turret can aim on its own
// ---------------- shared vehicle parts ----------------

// a box in the vehicle's own frame (x forward, y to the right)
function box(g: Ctx, a: number, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, top: string | null, side: string) {
  prism(g, rot([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], a), z0, z1, top, side);
}
// a flat plate lying on a deck at height z
function deckPlate(g: Ctx, a: number, z: number, x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient, stroke = false) {
  const p = (x: number, y: number): Pt => { const [px, py] = at(x, y, a); return [px, py - z]; };
  poly(g, [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)], fill, stroke);
}
// hover downdraft glowing on the ground
function padGlow(g: Ctx, a: number, pads: Pt[], r: number) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [x, y] of pads) { const [px, py] = at(x, y, a); glow(g, px, py, r, 'rgba(110,210,255,0.4)'); }
  g.restore();
}
// a chunky tyre with tread bars
function wheel(g: Ctx, a: number, x: number, y: number, r: number, w: number) {
  box(g, a, x - r, y - w / 2, x + r, y + w / 2, 0, r * 1.25, '#34343a', '#1e1e22');
  for (let k = -r + 1; k < r; k += 1.6) deckPlate(g, a, r * 1.25, k, y - w / 2, k + 0.6, y + w / 2, 'rgba(0,0,0,0.45)');
}
// barrels pointing forward along +x, one per y offset
function barrels(g: Ctx, a: number, ys: number[], x0: number, x1: number, z0: number, z1: number, thick: number) {
  for (const y of ys) box(g, a, x0, y - thick / 2, x1, y + thick / 2, z0, z1, '#9a9eaa', '#4a4d56');
}
// walker legs: each [hipX, hipY, footX, footY]; feet stride along x on a cycle.
// side 'back' draws the legs whose feet sit up-screen (behind the body),
// 'front' the rest, so legs overlap the body the right way at any heading
function walkerLegs(g: Ctx, a: number, legs: [number, number, number, number][], phase: number, stride: number,
                    hipZ: number, foot: number, side: 'back' | 'front', armour: string) {
  legs.forEach(([hx, hy, fx, fy], i) => {
    // diagonal pairs move together (trot), so the walker always has two feet down
    const t = phase * Math.PI * 2 + ((i === 0 || i === 3) ? 0 : Math.PI);
    const fxx = fx + Math.sin(t) * stride, lift = Math.max(0, Math.cos(t)) * stride * 0.5;
    const [px, py] = at(fxx, fy, a);
    if ((py > 0) !== (side === 'front')) return;
    const [hpx, hpy] = at(hx, hy, a);
    const out = Math.sign(fy || 1);
    const [kx, ky] = at((hx + fxx) / 2, (hy + fy) / 2 + out * 2.5, a);
    const kz = hipZ + 3 + lift;
    // thigh and shin: a dark core under a lit strut
    for (const [col, wid] of [[edgeOf(armour), 3.6], [armour, 2.2]] as [string, number][]) {
      g.strokeStyle = col; g.lineWidth = wid; g.lineCap = 'round';
      g.beginPath(); g.moveTo(hpx, hpy - hipZ); g.lineTo(kx, ky - kz); g.lineTo(px, py - lift - foot * 0.6); g.stroke();
    }
    g.fillStyle = 'rgba(255,240,215,0.35)'; g.beginPath(); g.arc(kx, ky - kz, 1, 0, Math.PI * 2); g.fill();
    box(g, a, fxx - foot, fy - foot * 0.75, fxx + foot, fy + foot * 0.75, lift, lift + foot * 0.7, '#6a6d78', '#3a3c44');
  });
}

// ---------------- Scout Ranger: fast four-wheel recon rover ----------------

function drawRangerHull(g: Ctx, a: number, team: string) {
  for (const [x, y] of [[-6, -6.5], [6.5, -6.5], [-6, 6.5], [6.5, 6.5]] as Pt[]) wheel(g, a, x, y, 3, 2.6);
  box(g, a, -9, -4.5, 9, 4.5, 1.5, 5, TANK_TOP, SKIRT);                                  // chassis
  prism(g, rot([[9, -4.5], [12, -2.5], [12, 2.5], [9, 4.5]], a), 1.5, 4.2, '#6a6d78', SKIRT); // nose wedge
  deckPlate(g, a, 5, -9, -4, -5.5, 4, team);                                             // team tailgate
  box(g, a, -3.5, -3.5, 4.5, 3.5, 5, 8, '#848894', TANK);                                  // cab
  deckPlate(g, a, 8, 2.5, -3, 4.5, 3, GLASS_DK, true);
  deckPlate(g, a, 8, 3, -2.2, 3.8, 2.2, GLASS);
  // radar mast on the tail with a little dish
  const [mx, my] = at(-7, 0, a);
  cylinder(g, mx, my, 0.8, 5, 12, '#9a9eaa', '#5a5d69');
  g.fillStyle = '#c4c8d2'; g.beginPath(); g.ellipse(mx, my - 12, 3, 1.4, a, 0, Math.PI * 2); g.fill();
  g.strokeStyle = edgeOf('#8a8f9c'); g.lineWidth = 0.8; g.stroke();
}
function drawRangerTurret(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 2.2, 8, 9.6, '#6a6d78', HULL);
  barrels(g, a, [0], 1, 8.5, 9, 10, 1);
  box(g, a, -2, -1.6, 1.5, 1.6, 9.2, 10.6, '#848894', TANK);
  deckPlate(g, a, 10.6, -1.8, -1.2, -0.6, 1.2, team);
}

// ---------------- Raider: stripped-down harassment buggy ----------------

function drawRaiderHull(g: Ctx, a: number, team: string) {
  for (const [x, y] of [[-6.5, -6.8], [6.5, -6.8], [-6.5, 6.8], [6.5, 6.8]] as Pt[]) wheel(g, a, x, y, 3.4, 2.8);
  box(g, a, -8, -3.6, 8, 3.6, 2, 4.5, '#6a6d78', SKIRT);                                  // bare frame
  box(g, a, -9.5, -3, -3.5, 3, 4.5, 8, '#4a4d56', '#3a3c44');                              // exposed engine
  for (const y of [-2, 0, 2]) deckPlate(g, a, 8, -9, y - 0.4, -4, y + 0.4, '#8a8e9a');
  for (const y of [-2.6, 2.6]) { const [ex, ey] = at(-8, y, a); cylinder(g, ex, ey, 0.9, 8, 12, '#2a2c32', '#6a6d78'); }
  box(g, a, 10.5, -5.5, 12, 5.5, 1.5, 5, '#b8bcc8', '#6a6d78');                            // ram bar
  for (const y of [-3.5, 0, 3.5]) box(g, a, 12, y - 0.6, 13.5, y + 0.6, 2.5, 3.8, '#d0d3da', '#7a7f8c');
  deckPlate(g, a, 4.5, 0, -3, 5, 3, '#2a2622');                                            // seat well
  // roll-cage hoop
  g.strokeStyle = edgeOf('#b8bcc8'); g.lineWidth = 1.4;
  const c0 = at(5, -3.4, a), c1 = at(5, 3.4, a);
  g.beginPath(); g.moveTo(c0[0], c0[1] - 4.5); g.lineTo(c0[0], c0[1] - 10); g.lineTo(c1[0], c1[1] - 10); g.lineTo(c1[0], c1[1] - 4.5); g.stroke();
  g.strokeStyle = '#b8bcc8'; g.lineWidth = 0.7; g.stroke();
  const [fx, fy] = at(-2, -3.2, a);
  flag(g, fx, fy, 4.5, 15, team);
}
function drawRaiderTurret(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 2, 8.5, 9.5, '#6a6d78', HULL);
  barrels(g, a, [-1, 1], 1, 9, 9.6, 10.5, 0.8);
  box(g, a, -2.5, -2, 1.5, 2, 9.4, 11, '#848894', TANK);
  deckPlate(g, a, 11, -2.2, -1.6, -1, 1.6, team);
}

// ---------------- Warden Drone: armed anti-air hover drone ----------------

function drawWardenHull(g: Ctx, a: number, team: string) {
  padGlow(g, a, [[0, -8], [0, 8], [-6, 0]], 6);
  for (const y of [-8, 8]) box(g, a, -4, y - 2, 4, y + 2, 3, 6, '#6a6d78', SKIRT);           // side pods
  box(g, a, -2, -8, 2, 8, 4, 5.5, '#4a4d56', SKIRT);                                         // pod spar
  cylinder(g, 0, 0, 6.5, 3, 8, HULL_TOP, TANK);                                               // body
  g.beginPath(); g.arc(0, -8, 6.5, 0, Math.PI * 2); g.strokeStyle = team; g.lineWidth = 1; g.stroke();
  deckPlate(g, a, 8, 4, -1.6, 6, 1.6, GLASS, true);                                          // sensor eye
}
function drawWardenTurret(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 3.4, 8, 10, '#6a6d78', HULL);
  barrels(g, a, [-1.6, 1.6], 2, 9.5, 10.2, 11.4, 1.1);
  box(g, a, -3, -2.6, 2.5, 2.6, 9.6, 12, '#848894', TANK);
  deckPlate(g, a, 12, -2.6, -2, -1, 2, team);
}

// ---------------- Thumper: four-legged seismic artillery walker ----------------

const THUMPER_LEGS: [number, number, number, number][] = [[5, -4, 10, -9], [5, 4, 10, 9], [-5, -4, -10, -9], [-5, 4, -10, 9]];
function drawThumperHull(g: Ctx, a: number, team: string, phase = 0) {
  walkerLegs(g, a, THUMPER_LEGS, phase, 2, 9, 2.2, 'back', '#6a6d78');
  const body: Pt[] = [[-7, -5], [5, -5], [8, -2], [8, 2], [5, 5], [-7, 5], [-8.5, 3], [-8.5, -3]];
  prism(g, rot(body, a), 7, 11, TANK_TOP, TANK);
  deckPlate(g, a, 11, -7.5, -4, -5, 4, team);
  for (const y of [-2.5, 0, 2.5]) deckPlate(g, a, 11, -4, y - 0.4, 3, y + 0.4, 'rgba(0,0,0,0.28)');
  walkerLegs(g, a, THUMPER_LEGS, phase, 2, 9, 2.2, 'front', '#6a6d78');
}
function drawThumperTurret(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 4.8, 11, 13.5, '#6a6d78', HULL);
  const away = Math.sin(a) < 0;
  const tube = () => {
    box(g, a, 2, -2.2, 15, 2.2, 13.5, 17, '#9a9eaa', '#4a4d56');                             // heavy mortar tube
    box(g, a, 6, -2.8, 9, 2.8, 13.2, 17.4, '#6a6d78', '#3a3c44');                            // recoil sleeve
    box(g, a, 14, -2.8, 16.5, 2.8, 13.2, 17.4, '#6a6d78', '#3a3c44');                        // muzzle
  };
  if (away) tube();
  box(g, a, -5, -4, 3, 4, 13.5, 17, '#848894', TANK);
  deckPlate(g, a, 17, -4.5, -3.2, -2.5, 3.2, team);
  deckPlate(g, a, 17, 0, 1.2, 2.4, 3, GLASS_DK, true);
  if (!away) tube();
}

// ---------------- Dominator: two-legged twin-cannon siege mech ----------------

const DOMINATOR_LEGS: [number, number, number, number][] = [[0, -5, 0, -8.5], [0, 5, 0, 8.5]];
function drawDominatorHull(g: Ctx, a: number, team: string, phase = 0) {
  walkerLegs(g, a, DOMINATOR_LEGS, phase, 4, 12, 3, 'back', '#6a6d78');
  box(g, a, -4.5, -6.5, 4.5, 6.5, 10, 14, '#6a6d78', SKIRT);                                // pelvis
  walkerLegs(g, a, DOMINATOR_LEGS, phase, 4, 12, 3, 'front', '#6a6d78');
}
function drawDominatorTurret(g: Ctx, a: number, team: string) {
  const away = Math.sin(a) < 0;
  const guns = () => {
    for (const y of [-10.5, 10.5]) {
      box(g, a, -3, y - 2.8, 5, y + 2.8, 16, 22, '#848894', TANK);                          // shoulder mount
      deckPlate(g, a, 22, -2.5, y - 2.2, 0, y + 2.2, team);
      barrels(g, a, [y - 1.1, y + 1.1], 5, 19, 18.2, 20.2, 1.5);
      box(g, a, 18, y - 2.4, 21, y + 2.4, 17.8, 20.8, '#6a6d78', '#3a3c44');
    }
  };
  if (away) guns();
  const torso: Pt[] = [[-7, -7.5], [3, -7.5], [7, -4], [7, 4], [3, 7.5], [-7, 7.5], [-8.5, 5], [-8.5, -5]];
  prism(g, rot(torso, a), 14, 23, '#848894', TANK);
  deckPlate(g, a, 23, 3, -3, 6.5, 3, GLASS_DK, true);                                       // cockpit
  deckPlate(g, a, 23, 3.6, -2.2, 5.6, 2.2, GLASS);
  for (const y of [-4.5, -1.5, 1.5, 4.5]) deckPlate(g, a, 23, -7, y - 0.4, -2, y + 0.4, 'rgba(0,0,0,0.3)');
  if (!away) guns();
}

// ---------------- Colossus: superheavy four-legged siege platform ----------------

const COLOSSUS_LEGS: [number, number, number, number][] = [[8, -6, 15, -13], [8, 6, 15, 13], [-8, -6, -15, -13], [-8, 6, -15, 13]];
function drawColossusHull(g: Ctx, a: number, team: string, phase = 0) {
  walkerLegs(g, a, COLOSSUS_LEGS, phase, 3, 14, 3.6, 'back', '#6a6d78');
  const body: Pt[] = [[-11, -8], [8, -8], [12, -4], [12, 4], [8, 8], [-11, 8], [-13, 5], [-13, -5]];
  prism(g, rot(body, a), 10, 17, TANK_TOP, TANK);
  for (const y of [-8.2, 8.2]) deckPlate(g, a, 17, -10, y - 0.8, 8, y + 0.8, team);
  for (const x of [-9, -6, -3]) deckPlate(g, a, 17, x, -5, x + 1.6, 5, '#2a2c32');             // heat vents
  walkerLegs(g, a, COLOSSUS_LEGS, phase, 3, 14, 3.6, 'front', '#6a6d78');
}
function drawColossusTurret(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 8, 17, 19, '#6a6d78', HULL);
  const away = Math.sin(a) < 0;
  const guns = () => {
    barrels(g, a, [-3.2, 0, 3.2], 7, 25, 20.8, 23, 1.8);
    box(g, a, 23.5, -5, 27, 5, 20.4, 23.4, '#6a6d78', '#3a3c44');
  };
  if (away) guns();
  const head: Pt[] = [[-10, -8], [5, -8], [9, -4.5], [9, 4.5], [5, 8], [-10, 8], [-11.5, 5], [-11.5, -5]];
  prism(g, rot(head, a), 19, 26, '#848894', TANK);
  deckPlate(g, a, 26, -10, -6, -6.5, 6, team);
  deckPlate(g, a, 26, 4, -6.5, 7.5, -3, GLASS_DK, true);
  deckPlate(g, a, 26, -4, -2, 2, 2, '#5a5d69', true);                                         // hatch
  if (!away) guns();
}

// ---------------- Harvester: hover hauler with an open crystal hopper ----------------

function drawHarvesterHull(g: Ctx, a: number, team: string) {
  padGlow(g, a, [[9, -7], [9, 7], [-10, -7], [-10, 7]], 6.5);
  const hull: Pt[] = [[-12, -9], [10, -9], [14, -5], [14, 5], [10, 9], [-12, 9], [-14, 6], [-14, -6]];
  prism(g, rot(hull, a), 2.5, 7.5, TANK_TOP, SKIRT);
  deckPlate(g, a, 7.5, -13, -5, -10.5, 5, team);
  // mining head on the nose: glowing cutter teeth
  box(g, a, 10, -6, 15.5, 6, 2, 6, '#4a4d56', '#3a3c44');
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const y of [-4, -1.3, 1.3, 4]) { const [px, py] = at(15.5, y, a); glow(g, px, py - 3.5, 2.6, 'rgba(67,243,236,0.6)'); }
  g.restore();
  // hopper: open bin full of flux crystal
  box(g, a, -9, -7, 6, 7, 7.5, 12, null, '#6a6d78');
  deckPlate(g, a, 12, -9, -7, 6, 7, '#121618', true);
  for (const [x, y, r] of [[-6, -3, 2.2], [-2, 2, 2.6], [2, -2.5, 2], [-5, 3.5, 1.8], [3, 3, 1.6]] as [number, number, number][]) {
    const [cx, cy] = at(x, y, a);
    poly(g, [[cx, cy - 12 - r * 1.6], [cx + r, cy - 12], [cx, cy - 12 + r * 0.6], [cx - r, cy - 12]], '#43f3ec');
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(cx - 0.4, cy - 12 - r * 1.2, 0.8, r * 0.8);
  }
}

// ---------------- Pioneer: hover transport with a folded command post ----------------

function drawPioneerHull(g: Ctx, a: number, team: string) {
  padGlow(g, a, [[10, -8], [10, 8], [-11, -8], [-11, 8], [0, 0]], 7);
  const hull: Pt[] = [[-13, -9.5], [11, -9.5], [15, -5], [15, 5], [11, 9.5], [-13, 9.5], [-15, 6], [-15, -6]];
  prism(g, rot(hull, a), 2.5, 7, TANK_TOP, SKIRT);
  for (const y of [-9.6, 9.6]) deckPlate(g, a, 7, -12, y - 0.7, 10, y + 0.7, team);
  deckPlate(g, a, 7, 11, -3, 14, 3, GLASS_DK, true);
  // folded command module: crated hall, stowed dome, antenna laid flat
  box(g, a, -10, -7, 7, 7, 7, 13, HULL_TOP, HULL);
  for (const x of [-6, -1, 4]) deckPlate(g, a, 13, x, -7, x + 0.6, 7, 'rgba(0,0,0,0.3)');
  hazardPlate(g, a, 13, -10, -7.4, 7, -6.2);
  hazardPlate(g, a, 13, -10, 6.2, 7, 7.4);
  const [dx, dy] = at(-2, 0, a);
  cylinder(g, dx, dy, 5, 13, 14.5, HULL_TOP, HULL);
  dome(g, dx, dy, 4.5, 14.5, DOME);
  const p0 = at(2, 0, a), p1 = at(10, 0, a);
  g.strokeStyle = edgeOf('#b8bcc8'); g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(p0[0], p0[1] - 13.6); g.lineTo(p1[0], p1[1] - 13.6); g.stroke();
  g.strokeStyle = '#b8bcc8'; g.lineWidth = 0.8; g.stroke();
}
// yellow/black hazard edging along a deck strip
function hazardPlate(g: Ctx, a: number, z: number, x0: number, y0: number, x1: number, y1: number) {
  deckPlate(g, a, z, x0, y0, x1, y1, GOLD);
  for (let x = x0; x < x1; x += 2.4) deckPlate(g, a, z, x, y0, x + 1.1, y1, 'rgba(16,10,6,0.85)');
}

// refined-style vehicle art by unit id: hull and turret are baked separately so
// the turret can aim on its own; walkers bake `frames` steps of their gait
export interface VehicleArt {
  hull: (g: Ctx, a: number, team: string, phase?: number) => void;
  turret?: (g: Ctx, a: number, team: string) => void;
  reach: number; height: number;
  frames?: number;
}
export const VEHICLE_ART: Partial<Record<string, VehicleArt>> = {
  hovertank: { hull: drawHoverTankHull, turret: drawHoverTankTurret, reach: 24, height: 16 },
  ranger:    { hull: drawRangerHull,    turret: drawRangerTurret,    reach: 17, height: 16 },
  raider:    { hull: drawRaiderHull,    turret: drawRaiderTurret,    reach: 17, height: 18 },
  warden:    { hull: drawWardenHull,    turret: drawWardenTurret,    reach: 16, height: 14 },
  artillery: { hull: drawThumperHull,   turret: drawThumperTurret,   reach: 20, height: 20, frames: 4 },
  dominator: { hull: drawDominatorHull, turret: drawDominatorTurret, reach: 26, height: 26, frames: 4 },
  colossus:  { hull: drawColossusHull,  turret: drawColossusTurret,  reach: 30, height: 30, frames: 4 },
  harvester: { hull: drawHarvesterHull, reach: 20, height: 16 },
  pioneer:   { hull: drawPioneerHull,   reach: 20, height: 18 },
};

// ---------------- defences ----------------
// Bases are ordinary building art; the aiming heads are TURRET_ART, baked per
// heading like vehicle turrets and drawn live at the pivot.

// low armoured plinth with a team band, shared by the gun emplacements
function plinth(g: Ctx, pts: Pt[], z0: number, z1: number, team: string) {
  prism(g, pts, z0, z1 - 2, null, '#5d6170');
  detailWalls(g, pts, z0, z1 - 2, 5);
  prism(g, pts, z1 - 2, z1 - 1, null, team);
  prism(g, pts, z1 - 1, z1, HULL_TOP, HULL);
}

// ---- Pulse Turret (1×1)

export function drawPulseTurret(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 32; g.scale(s, s);
  prism(g, chamfer(2, 3, 30, 30, 5), 0, 2, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(2, 3, 30, 30, 5), 0, 2, 0, 0.3);
  plinth(g, chamfer(6, 8, 26, 26, 5), 2, 7, team);
  for (const [x, y] of [[9, 11], [23, 11]] as Pt[]) { g.fillStyle = '#ffb02e'; g.fillRect(x - 0.7, y - 7.7, 1.4, 1.4); spill(g, x, y - 7, 2.5, 'rgba(255,176,46,0.45)'); }
  box(g, 0, 22, 26, 28, 29.5, 2, 5, '#6a6d78', '#4a4d56');                                  // ammo crate
  deckPlate(g, 0, 5, 23, 26.6, 27, 27.6, GOLD);
  g.restore();
}
function drawPulseHead(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 5, 7, 8.6, HULL_TOP, HULL);
  const away = Math.sin(a) < 0;
  const guns = () => {
    barrels(g, a, [-1.6, 1.6], 3.5, 12.5, 9.6, 11, 1.1);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const y of [-1.6, 1.6]) { const [px, py] = at(12.8, y, a); glow(g, px, py - 10.3, 2.2, 'rgba(95,224,240,0.6)'); }
    g.restore();
  };
  if (away) guns();
  prism(g, rot([[-5, -4], [2.5, -4], [5, -2], [5, 2], [2.5, 4], [-5, 4]], a), 8.6, 12, '#848894', TANK);
  deckPlate(g, a, 12, -4.5, -3, -2.8, 3, team);
  deckPlate(g, a, 12, 1.5, -1.2, 3.8, 1.2, GLASS_DK, true);
  if (!away) guns();
}

// ---- Rail Cannon (2×2)

export function drawRailCannon(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 8), 0, 3, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 8), 0, 3);
  if (fine) speckle(g, 6, 5 - 3, 58, 61 - 3, 60, 61);
  const coil = (x: number, y: number) => {
    cylinder(g, x, y, 3, 3, 13, '#6a6d78', HULL);
    for (const z of [6, 9]) { g.strokeStyle = COPPER; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y - z, 3, 0, Math.PI); g.stroke(); }
    g.fillStyle = '#5fe0f0'; g.beginPath(); g.arc(x, y - 13, 1.8, 0, Math.PI * 2); g.fill();
    spill(g, x, y - 13, 5, 'rgba(95,224,240,0.45)');
  };
  coil(12, 13); coil(52, 13);
  plinth(g, chamfer(11, 13, 53, 57, 10), 3, 12, team);
  coil(12, 56); coil(52, 56);
  g.restore();
}
function drawRailHead(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 9, 12, 14, HULL_TOP, HULL);
  const away = Math.sin(a) < 0;
  const rails = () => {
    for (const y of [-2.7, 2.7]) box(g, a, 7, y - 0.9, 33, y + 0.9, 15.5, 18, '#b8bcc8', '#5a5d69');
    deckPlate(g, a, 16.6, 8, -1.6, 32, 1.6, 'rgba(95,224,240,0.55)');
    for (const x of [13, 19, 25]) box(g, a, x, -3.8, x + 1.6, 3.8, 15, 18.6, COPPER, '#8a4e22');
    box(g, a, 31.5, -4, 34, 4, 15, 18.6, '#6a6d78', '#3a3c44');
  };
  if (away) rails();
  prism(g, rot([[-9, -7], [5, -7], [8.5, -4], [8.5, 4], [5, 7], [-9, 7], [-10.5, 4.5], [-10.5, -4.5]], a), 14, 20, '#848894', TANK);
  deckPlate(g, a, 20, -9, -5.5, -6, 5.5, team);
  for (const y of [-3, 0, 3]) deckPlate(g, a, 20, -4, y - 0.5, 4, y + 0.5, 'rgba(0,0,0,0.28)');
  if (!away) rails();
}

// ---- Arc Tower (1×1): a static tesla pylon; the orb's crackle is live

export function arcOrb(w: number): Pt {
  const s = w / 32;
  return [16 * s, (19 - 23) * s];
}
export function drawArcTower(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 32; g.scale(s, s);
  const VIOLET = '#4a4066';
  prism(g, chamfer(2, 3, 30, 30, 5), 0, 2, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(2, 3, 30, 30, 5), 0, 2, 0, 0.3);
  plinth(g, chamfer(8, 10, 24, 26, 4), 2, 6, team);
  prism(g, chamfer(12, 15, 20, 23, 2), 6, 19, '#5a5070', VIOLET);
  detailWalls(g, chamfer(12, 15, 20, 23, 2), 6, 19, 0, 0.3);
  for (const z of [9, 12.5, 16]) cylinder(g, 16, 19, 4.8, z, z + 1.3, '#8a7fb4', '#6f639a');   // insulators
  const [ox, oy] = [16, 19 - 23];
  const og = g.createRadialGradient(ox - 1.5, oy - 1.5, 0.5, ox, oy, 4.5);
  og.addColorStop(0, '#f2e3ff'); og.addColorStop(0.5, '#b48aff'); og.addColorStop(1, '#4a2a80');
  g.fillStyle = og; g.beginPath(); g.arc(ox, oy, 4.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = edgeOf('#4a2a80'); g.lineWidth = edgeW(); g.stroke();
  g.restore();
}

// ---- Bastion Battery (2×2)

export function drawBastion(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 64; g.scale(s, s);
  prism(g, chamfer(3, 5, 61, 61, 8), 0, 3, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(3, 5, 61, 61, 8), 0, 3);
  if (fine) speckle(g, 6, 5 - 3, 58, 61 - 3, 60, 67);
  // round fort with a team band and merlons on the parapet
  cylinder(g, 32, 34, 25, 3, 9, HULL_TOP, '#5d6170');
  cylinder(g, 32, 34, 25, 9, 10.5, team, team);
  cylinder(g, 32, 34, 25, 10.5, 12, '#7e8290', '#5d6170');
  for (let k = 0; k < 9; k++) {
    const t = 0.15 + (k / 8) * (Math.PI - 0.3), x = 32 + Math.cos(t) * 23, y = 34 + Math.sin(t) * 23;
    prism(g, rot([[-2.2, -1.8], [2.2, -1.8], [2.2, 1.8], [-2.2, 1.8]], t + Math.PI / 2).map(([px, py]) => [px + x, py + y] as Pt), 12, 14.5, '#848894', '#5d6170');
  }
  for (const x of [14, 50]) { g.fillStyle = '#ffb02e'; g.fillRect(x - 0.8, 55 - 8.8, 1.6, 1.6); spill(g, x, 55 - 8, 3, 'rgba(255,176,46,0.45)'); }
  g.restore();
}
function drawBastionHead(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 12, 12, 15, HULL_TOP, HULL);
  const away = Math.sin(a) < 0;
  const guns = () => {
    barrels(g, a, [-5.2, -1.75, 1.75, 5.2], 8, 27, 16.4, 18.6, 2);
    box(g, a, 26, -6.8, 29, 6.8, 16, 19, '#6a6d78', '#3a3c44');
  };
  if (away) guns();
  prism(g, rot([[-11, -9], [5, -9], [10, -5], [10, 5], [5, 9], [-11, 9], [-13, 5.5], [-13, -5.5]], a), 15, 22, '#848894', TANK);
  deckPlate(g, a, 22, -11.5, -6.5, -8, 6.5, team);
  deckPlate(g, a, 22, 3, -7.5, 7.5, -4.5, GLASS_DK, true);
  for (const y of [-4, -1, 2, 5]) deckPlate(g, a, 22, -6, y - 0.5, 1, y + 0.5, 'rgba(0,0,0,0.28)');
  if (!away) guns();
}

// ---- Skyguard AA (1×1)

export function drawSkyguard(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save();
  const s = w / 32; g.scale(s, s);
  prism(g, chamfer(2, 3, 30, 30, 5), 0, 2, CONCRETE_TOP, CONCRETE);
  detailWalls(g, chamfer(2, 3, 30, 30, 5), 0, 2, 0, 0.3);
  cylinder(g, 16, 18, 10, 2, 5.5, HULL_TOP, '#5d6170');
  cylinder(g, 16, 18, 10, 5.5, 6.5, team, team);
  cylinder(g, 16, 18, 10, 6.5, 7, '#7e8290', '#5d6170');
  g.restore();
}
function drawSkyguardHead(g: Ctx, a: number, team: string) {
  cylinder(g, 0, 0, 4.5, 7, 9, HULL_TOP, HULL);
  // twin missile pods either side of a sensor block, tubes open to the sky
  for (const y of [-4.5, 4.5]) {
    box(g, a, -4, y - 2.8, 4.5, y + 2.8, 9, 15, '#848894', TANK);
    for (const [dx, dy] of [[-1.5, -1.2], [-1.5, 1.2], [1.8, -1.2], [1.8, 1.2]] as Pt[]) {
      deckPlate(g, a, 15, dx - 1, y + dy - 0.9, dx + 1, y + dy + 0.9, '#14110e');
      deckPlate(g, a, 15, dx - 0.5, y + dy - 0.45, dx + 0.5, y + dy + 0.45, '#ff8c3a');
    }
  }
  box(g, a, -2.5, -1.6, 3.5, 1.6, 9, 13, '#6a6d78', '#4a4d56');
  deckPlate(g, a, 13, 1.5, -1.2, 3.5, 1.2, GLASS, true);
  deckPlate(g, a, 13, -2.5, -1.4, -1, 1.4, team);
}

// ---- walls (1×1 segments that butt together into a line)

function drawWallSegment(g: Ctx, w: number, team: string, heavy: boolean) {
  g.save();
  const s = w / 32; g.scale(s, s);
  const side = heavy ? '#4d535e' : '#6a6e7a', top = heavy ? '#6d737e' : '#8a8f9c', zt = heavy ? 15 : 11;
  prism(g, [[0, 12], [32, 12], [32, 27], [0, 27]], 0, 2, CONCRETE_TOP, CONCRETE);          // footing
  const body: Pt[] = [[1, 14], [31, 14], [31, 25], [1, 25]];
  prism(g, body, 2, zt, top, side);
  detailWalls(g, body, 2, zt, heavy ? 10 : 15);
  quad(g, [1, 25 - zt + 3], [31, 25 - zt + 3], [31, 25 - zt + 4.2], [1, 25 - zt + 4.2], team, false);
  for (const x of [4, 28]) for (const z of [4.5, zt - 1.5]) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - 0.5, 25 - z - 0.5, 1, 1); }
  if (heavy) {
    // armour ribs on the cap and amber hazard corners
    for (const x of [8, 16, 24]) quad(g, [x - 1, 14 - zt], [x + 1, 14 - zt], [x + 1, 25 - zt], [x - 1, 25 - zt], '#3a3f48', false);
    for (const x of [1, 28]) quad(g, [x, 25 - zt], [x + 3, 25 - zt], [x + 3, 23 - zt], [x, 23 - zt], '#ffb02e', false);
  }
  g.restore();
}
export function drawWall(g: Ctx, w: number, _h: number, _level: number, team: string) { drawWallSegment(g, w, team, false); }
export function drawHeavyWall(g: Ctx, w: number, _h: number, _level: number, team: string) { drawWallSegment(g, w, team, true); }

// aiming heads by building id: pivot in footprint units (scaled by width/32 per tile)
export interface TurretArt { head: (g: Ctx, a: number, team: string) => void; pivot: Pt; reach: number; height: number }
export const TURRET_ART: Partial<Record<string, TurretArt>> = {
  turret:   { head: drawPulseHead,    pivot: [16, 17], reach: 14, height: 14 },
  railgun:  { head: drawRailHead,     pivot: [32, 35], reach: 36, height: 22 },
  bastion:  { head: drawBastionHead,  pivot: [32, 34], reach: 30, height: 24 },
  skyguard: { head: drawSkyguardHead, pivot: [16, 18], reach: 10, height: 17 },
};

// custom art by building id; anything not listed keeps the pack sprite
export const BUILDING_ART: Partial<Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void>> = {
  nexus: drawNexus,
  outpost: drawNexus,
  solar: drawSolar,
  extractor: drawExtractor,
  barracks: drawBarracks,
  fab: drawFabricator,
  fusion: drawFusion,
  spire: drawSpire,
  lab: drawLab,
  sensor: drawSensor,
  repairyard: drawRepairYard,
  skyport: drawSkyport,
  uplink: drawUplink,
  turret: drawPulseTurret,
  railgun: drawRailCannon,
  arctower: drawArcTower,
  bastion: drawBastion,
  skyguard: drawSkyguard,
  wall: drawWall,
  heavywall: drawHeavyWall,
};
