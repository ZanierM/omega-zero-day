// Hand-built structure art, drawn in code in the same chunky 3/4 top-down style
// as the terrain: flat-lit roofs, shaded walls facing the viewer, hard outlines.
// The renderer adds the pad, cast shadow, outline and pixelation around it.
//
// Coordinates: (0,0) is the footprint's top-left corner on the ground; x runs
// east, y runs south, and a height z lifts a point straight up the screen.

type Pt = [number, number];
type Ctx = CanvasRenderingContext2D;

const OUT = '#1a120c';

// multiply a #rrggbb colour by k (k > 1 lightens)
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function poly(g: Ctx, pts: Pt[], fill: string, stroke = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = OUT; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); }
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
  }
  if (top) poly(g, pts.map(([x, y]) => [x, y - z1] as Pt), top);
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
  sg.addColorStop(0, shade(side, 1.18)); sg.addColorStop(0.45, side); sg.addColorStop(1, shade(side, 0.7));
  g.fillStyle = sg; g.fill();
  g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.arc(cx, cy - z1, r, 0, Math.PI * 2);
  g.fillStyle = top; g.fill(); g.stroke();
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
  g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
}

function glow(g: Ctx, x: number, y: number, r: number, col: string) {
  const gg = g.createRadialGradient(x, y, 0, x, y, r);
  gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gg;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

// ---------------- Nexus HQ ----------------

const HULL_TOP = '#858893', HULL = '#5a5d69', PLINTH_TOP = '#6e6a63', PLINTH = '#4a4640';
const DOME = '#8d93a3', GOLD = '#e8c66a', GLASS = '#5fe0f0', GLASS_DK = '#16303a';

// beacon at the tip of the mast, relative to the footprint's top-left (world px)
export function nexusBeacon(w: number, level: number): { x: number, y: number } {
  const s = w / 96;
  return { x: 48 * s, y: (46 - 44 - 15 - (level >= 3 ? 30 : 22)) * s };
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

  // front windows: dark frames with a lit lower pane
  for (let x = 30; x <= 62; x += 8) {
    poly(g, [[x, 78 - 26], [x + 5, 78 - 26], [x + 5, 78 - 16], [x, 78 - 16]], GLASS_DK);
    poly(g, [[x + 1, 78 - 21], [x + 4, 78 - 21], [x + 4, 78 - 17], [x + 1, 78 - 17]], GLASS, false);
  }
  // side windows on the chamfers
  poly(g, [[19, 75 - 24], [24, 78 - 24], [24, 78 - 18], [19, 75 - 18]], GLASS_DK);
  poly(g, [[72, 78 - 24], [77, 75 - 24], [77, 75 - 18], [72, 78 - 18]], GLASS_DK);

  // hangar door with hazard chevrons on the plinth face
  poly(g, [[40, 92 - 8], [56, 92 - 8], [56, 92 - 1], [40, 92 - 1]], '#2a2622');
  g.fillStyle = GOLD;
  for (let x = 41; x < 55; x += 4) poly(g, [[x, 92 - 7], [x + 2, 92 - 7], [x + 3, 92 - 5], [x + 1, 92 - 5]], GOLD, false);

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

  // command drum + dome with a team-coloured glass band
  cylinder(g, 48, 46, 18, 38, 44, HULL_TOP, HULL);
  dome(g, 48, 46, 16, 44, DOME);
  g.save();
  g.beginPath(); g.ellipse(48, 46 - 44, 16, 15.2, 0, Math.PI, 0); g.arc(48, 46 - 44, 16, 0, Math.PI); g.clip();
  g.fillStyle = team;
  g.fillRect(30, 46 - 44 - 7, 36, 4);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(30, 46 - 44 - 7, 36, 1.2);
  g.restore();

  // antenna mast with cross-spars, beacon housing at the tip
  const mastH = level >= 3 ? 30 : 22;
  const baseY = 46 - 44 - 15;
  g.fillStyle = OUT; g.fillRect(46, baseY - mastH, 4, mastH + 1);
  g.fillStyle = '#b8bcc8'; g.fillRect(47, baseY - mastH, 2, mastH);
  for (let k = 1; k <= (level >= 3 ? 3 : 2); k++) {
    const y = baseY - k * 8;
    g.fillStyle = OUT; g.fillRect(42, y - 1, 12, 3);
    g.fillStyle = '#b8bcc8'; g.fillRect(43, y, 10, 1);
  }
  g.fillStyle = OUT; g.beginPath(); g.arc(48, baseY - mastH, 3.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff6a5a'; g.beginPath(); g.arc(48, baseY - mastH, 2, 0, Math.PI * 2); g.fill();

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
function quad(g: Ctx, a: Pt, b: Pt, c: Pt, d: Pt, fill: string, stroke = true) { poly(g, [a, b, c, d], fill, stroke); }

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
  // back row, inverter, front row
  solarPanel(g, 6, 10, 30, 28);
  solarPanel(g, 34, 10, 58, 28);
  prism(g, [[26, 31], [38, 31], [38, 39], [26, 39]], 3, 12, '#6a6d78', HULL);
  quad(g, [26, 39 - 10], [38, 39 - 10], [38, 39 - 8], [26, 39 - 8], team, false);
  g.fillStyle = '#7fff8a'; g.fillRect(35, 39 - 6, 2, 2);
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

  // smoke stack at the back right
  cylinder(g, 80, 18, 6, 26, 60, '#2a2c32', '#6a6d78');
  for (const z of [36, 48]) quad(g, [74, 18 - z - 2], [86, 18 - z - 2], [86, 18 - z + 1], [74, 18 - z + 1], team, false);
  g.fillStyle = '#1a1612'; g.beginPath(); g.arc(80, 18 - 60, 4, 0, Math.PI * 2); g.fill();

  // processing hall with a sloped roof
  prism(g, [[34, 12], [90, 12], [90, 56], [34, 56]], 5, 22, null, HULL);
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

  // big storage tank on the left, piped into the hall
  g.fillStyle = OUT; g.fillRect(28, 34 - 18, 8, 5);
  g.fillStyle = '#8a8e9a'; g.fillRect(28, 34 - 17, 8, 3);
  cylinder(g, 18, 34, 14, 5, 34, '#9aa0ac', '#6c717e');
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

  // LV2+: watch post at the back left
  if (level >= 2) {
    cylinder(g, 12, 14, 6, 4, 30, HULL_TOP, HULL);
    prism(g, chamfer(4, 6, 20, 20, 3), 30, 33, '#6a6d78', HULL);
    lamp(g, 12, 14 - 36, team);
  }

  // armoured bunker: straight walls, a sloped armour skirt on the front
  const body = chamfer(10, 12, 56, 50, 6);
  prism(g, body, 4, 22, null, '#5d6170');
  quad(g, [12, 50 - 10], [54, 50 - 10], [56, 55 - 4], [10, 55 - 4], '#4b4f5c');          // skirt
  prism(g, body, 22, 25, null, level >= 3 ? GOLD : team);                                 // trim band
  prism(g, body, 25, 26, '#7e8290', '#5d6170');
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
  // vehicle apron in front of the doors
  quad(g, [32, 93 - 5], [64, 93 - 5], [66, 95], [30, 95], shade(CONCRETE_TOP, 0.85));

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
  g.fillStyle = rg; g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
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
  g.fillStyle = '#6a6e7c'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
  // team band across the gable and a round vent at its peak
  quad(g, [x0, yf - zw + 2], [x1, yf - zw + 2], [x1, yf - zw + 6], [x0, yf - zw + 6], level >= 3 ? GOLD : team, false);
  g.fillStyle = OUT; g.beginPath(); g.arc(48, yf - zw - 9, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a3c44'; g.beginPath(); g.arc(48, yf - zw - 9, 4.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#6a6e7c'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(44, yf - zw - 9); g.lineTo(52, yf - zw - 9); g.moveTo(48, yf - zw - 13); g.lineTo(48, yf - zw - 5); g.stroke();
  // roller door with hazard frame
  hazard(g, 30, yf - 23, 36, 3, '#e8c66a');
  quad(g, [32, yf - 20], [64, yf - 20], [64, yf - 5], [32, yf - 5], '#3a3d46');
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
  for (let y = yf - 18; y < yf - 5; y += 3) { g.beginPath(); g.moveTo(33, y); g.lineTo(63, y); g.stroke(); }
  // side windows
  for (const x of [16, 72]) {
    quad(g, [x, yf - 18], [x + 8, yf - 18], [x + 8, yf - 12], [x, yf - 12], GLASS_DK);
    g.fillStyle = GLASS; g.fillRect(x + 1, yf - 16, 6, 2);
  }
  g.restore();
}

// custom art by building id; anything not listed keeps the pack sprite
export const BUILDING_ART: Partial<Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void>> = {
  nexus: drawNexus,
  outpost: drawNexus,
  solar: drawSolar,
  extractor: drawExtractor,
  barracks: drawBarracks,
  fab: drawFabricator,
};
