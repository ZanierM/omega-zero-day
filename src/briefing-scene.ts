// Low-resolution canvas keeps the horizon's pixels crisp at every Fold size.
export function drawBriefingScene(canvas: HTMLCanvasElement) {
  const scale = 3;
  const w = canvas.width = Math.ceil(innerWidth / scale);
  const h = canvas.height = Math.ceil(innerHeight / scale);
  const ctx = canvas.getContext('2d')!;
  let seed = 70921;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(width), Math.ceil(height));
  };
  rect(0, 0, w, h, '#0d111b');
  for (let y = 0; y < h; y += 3) {
    const f = y / h;
    rect(0, y, w, 3, f < .58 ? '#111624' : f < .76 ? '#241b26' : '#4b2a25');
  }
  for (let i = 0; i < Math.floor(w * h / 1100); i++) {
    const x = random() * w, y = random() * h * .69;
    rect(x, y, random() > .94 ? 2 : 1, 1, random() > .75 ? '#9b9baa' : '#4e5665');
  }
  const horizon = h * .74;
  const sunX = w * .72, sunY = horizon - h * .03, radius = Math.max(15, Math.min(w, h) * .075);
  rect(sunX - radius * 1.45, sunY - radius * .5, radius * 2.9, radius * 1.5, '#6b3430');
  for (let yy = -radius; yy <= radius; yy += 2) {
    const half = Math.sqrt(Math.max(0, radius * radius - yy * yy));
    rect(sunX - half, sunY + yy, half * 2, 2, yy < 0 ? '#d4784b' : '#a7513c');
  }
  for (let y = 0; y < h - horizon; y += 2) {
    const span = (y / (h - horizon)) * w * .38;
    rect(sunX - span / 2, horizon + y, span, 1, y % 6 ? '#5b302b' : '#8a4431');
  }
  const ridge = (base: number, amp: number, color: string, offset: number) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) {
      const y = base + Math.sin((x + offset) * .027) * amp + Math.sin((x + offset) * .073) * amp * .38 + (random() - .5) * 3;
      ctx.lineTo(x, Math.round(y));
    }
    ctx.lineTo(w, h); ctx.fill();
  };
  ridge(horizon + 8, h * .035, '#222430', 37);
  ridge(horizon + h * .06, h * .045, '#191e28', 170);
  const ox = w * .18, oy = horizon + h * .035;
  // The far outpost sits between two ridges, with tiny lit windows and an aerial.
  rect(ox - 12, oy - 4, 36, 13, '#111923');
  rect(ox - 5, oy - 12, 19, 8, '#172332');
  rect(ox + 2, oy - 25, 2, 14, '#2f3a46');
  rect(ox - 1, oy - 25, 8, 1, '#5a6069');
  rect(ox + 2, oy - 27, 2, 2, '#d99c60');
  for (let i = 0; i < 5; i++) rect(ox - 8 + i * 6, oy, 3, 2, '#e8bc6d');
  rect(ox - 16, oy + 8, 44, 2, '#4d3a34');
  ridge(horizon + h * .15, h * .045, '#10151c', 290);
  ridge(horizon + h * .26, h * .07, '#0b1015', 53);
  // Sparse illuminated seams make the foreground read as worked terrain.
  for (let i = 0; i < 16; i++) {
    const x = random() * w, y = horizon + h * (.17 + random() * .23);
    rect(x, y, 2 + random() * 8, 1, '#4f3e34');
  }
}
