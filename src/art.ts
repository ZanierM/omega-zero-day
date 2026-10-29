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

// custom art by building id; anything not listed keeps the pack sprite
export const BUILDING_ART: Partial<Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void>> = {
  nexus: drawNexus,
  outpost: drawNexus,
};
