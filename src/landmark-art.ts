// Campaign landmarks, in the same footprint conventions as art.ts:
//   the Meridian — the first colony ship, half-buried, crystal grown through her
//   the Lantern Shaft — Helion's deep tap into the Vey, a derrick over a bleeding pit

type Ctx = CanvasRenderingContext2D;

function glowAt(g: Ctx, x: number, y: number, r: number, col: string) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}
function shard(g: Ctx, x: number, y: number, h: number, w: number, lean = 0) {
  const tx = x + lean * h, ty = y - h;
  g.fillStyle = '#1d7682'; g.beginPath(); g.moveTo(x - w, y); g.lineTo(tx, ty); g.lineTo(x, y + w * 0.3); g.closePath(); g.fill();
  g.fillStyle = '#46c4c8'; g.beginPath(); g.moveTo(x, y + w * 0.3); g.lineTo(tx, ty); g.lineTo(x + w, y); g.closePath(); g.fill();
  g.strokeStyle = '#d8fffd'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + w * 0.2, y); g.lineTo(tx, ty); g.stroke();
}

function drawMeridian(g: Ctx, w: number, _h: number) {
  g.save(); const s = w / 128; g.scale(s, s);
  // the crater she ploughed, and drifted sand along her flank
  g.fillStyle = 'rgba(40,28,18,0.55)'; g.beginPath(); g.ellipse(66, 86, 62, 18, -0.06, 0, Math.PI * 2); g.fill();
  // the hull: a long tilted cylinder, nose buried at the right
  g.save(); g.translate(64, 62); g.rotate(-0.12);
  const hull = g.createLinearGradient(0, -22, 0, 22);
  hull.addColorStop(0, '#c8c2b4'); hull.addColorStop(0.35, '#8e8a80'); hull.addColorStop(1, '#3a3834');
  g.fillStyle = hull;
  g.beginPath(); g.moveTo(-58, -14); g.lineTo(46, -20); g.quadraticCurveTo(64, -10, 58, 8); g.lineTo(-58, 18); g.quadraticCurveTo(-66, 2, -58, -14); g.fill();
  g.strokeStyle = 'rgba(20,16,12,0.6)'; g.lineWidth = 1; g.stroke();
  // ring frames along her length, one section torn open
  for (const x of [-44, -26, -8, 10, 28]) { g.strokeStyle = 'rgba(30,26,22,0.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, -17); g.lineTo(x + 1, 17); g.stroke(); }
  g.fillStyle = '#16120e'; g.beginPath(); g.moveTo(-6, -16); g.lineTo(12, -18); g.lineTo(8, 4); g.lineTo(-2, 10); g.lineTo(-10, 0); g.closePath(); g.fill();
  // her name, faded, and portholes with a little light still in them
  g.fillStyle = 'rgba(30,40,60,0.5)'; g.font = '700 7px system-ui, sans-serif'; g.fillText('MERIDIAN', -46, -4);
  for (const x of [-40, -32, 18, 26, 34]) {
    g.fillStyle = '#20262c'; g.beginPath(); g.arc(x, 8, 2, 0, Math.PI * 2); g.fill();
    if (x % 3 === 0) glowAt(g, x, 8, 4, 'rgba(255,200,120,0.6)');
  }
  // the old tail fin, snapped
  g.fillStyle = '#6e6a62'; g.beginPath(); g.moveTo(-56, -12); g.lineTo(-64, -30); g.lineTo(-50, -26); g.lineTo(-48, -13); g.closePath(); g.fill();
  g.restore();
  // crystal grown up through the torn section and along the buried nose
  for (const [x, y, hh, ww, lean] of [[66, 50, 26, 5, -0.1], [74, 54, 18, 4, 0.2], [58, 56, 14, 3.5, -0.3], [112, 64, 16, 4, 0.15], [104, 70, 10, 3, -0.1], [22, 74, 9, 3, -0.2]] as number[][]) shard(g, x, y, hh, ww, lean);
  glowAt(g, 68, 40, 22, 'rgba(120,250,240,0.35)');
  g.restore();
}

function drawShaft(g: Ctx, w: number, _h: number, _level: number, team: string) {
  g.save(); const s = w / 96; g.scale(s, s);
  // a concrete collar round a pit that leaks the Vey's light
  g.fillStyle = '#6e6a60'; g.beginPath(); g.ellipse(48, 66, 40, 18, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8c887c'; g.beginPath(); g.ellipse(48, 63, 38, 16, 0, 0, Math.PI * 2); g.fill();
  const pit = g.createRadialGradient(48, 64, 2, 48, 64, 26);
  pit.addColorStop(0, '#e8fffd'); pit.addColorStop(0.25, '#4fd2d6'); pit.addColorStop(1, '#06161a');
  g.fillStyle = pit; g.beginPath(); g.ellipse(48, 64, 26, 11, 0, 0, Math.PI * 2); g.fill();
  glowAt(g, 48, 58, 34, 'rgba(120,250,240,0.45)');
  // the derrick: a lattice tower of girders over the pit
  g.strokeStyle = '#3a3c44'; g.lineWidth = 2.4; g.lineCap = 'round';
  const legs: [number, number][] = [[24, 66], [72, 66], [34, 52], [62, 52]];
  for (const [x, y] of legs) { g.beginPath(); g.moveTo(x, y); g.lineTo(48, -8); g.stroke(); }
  g.strokeStyle = '#5d6170'; g.lineWidth = 1;
  for (let y = 54; y > 0; y -= 10) {
    const k = (y + 8) / 74;
    g.beginPath(); g.moveTo(48 - 24 * k, y); g.lineTo(48 + 24 * k, y); g.stroke();
    g.beginPath(); g.moveTo(48 - 24 * k, y); g.lineTo(48 + 24 * (k - 0.13), y - 10); g.stroke();
  }
  // Helion's mark on a placard, a warning lamp, the drill string down into the light
  g.fillStyle = '#2a2c32'; g.fillRect(40, 70, 16, 7);
  g.fillStyle = team; g.fillRect(41, 71, 14, 2);
  g.strokeStyle = '#c8ccd6'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(48, -8); g.lineTo(48, 62); g.stroke();
  glowAt(g, 48, -10, 6, 'rgba(255,90,80,0.8)');
  g.restore();
}

export const LANDMARK_ART: Record<string, (g: Ctx, w: number, h: number, level: number, team: string) => void> = {
  meridian: drawMeridian, lanternshaft: drawShaft,
};
