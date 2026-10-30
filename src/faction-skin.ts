// Faction looks: Helion and Kessler share building and vehicle shapes, so Kessler
// gets a "skin" painted over the finished art, inside its silhouette only
// (source-atop), once at bake time. Helion stays clean corporate tech; the
// Ashen Clans have art of their own (clan-art.ts).
//   Kessler: riveted armour bands, rust stripes, a war banner
// Units turn through many headings, so they only get smooth, position-free
// treatments (anything scattered would shimmer as they rotate).

import { SLOTS, FactionId } from './config';

export const skinOf = (owner: number): FactionId | null => {
  const f = SLOTS[owner];
  return f === 'kessler' ? f : null;
};

// bounding box of the drawn art, and the top-most opaque pixel per column
function silhouette(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!, { width: W, height: H } = c;
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const top = new Int32Array(W).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] < 40) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (top[x] < 0) top[x] = y;
  }
  return { x0, y0, x1, y1, top };
}

/** Paint a faction's look over a baked building canvas (k = bake scale). */
export function skinBuilding(c: HTMLCanvasElement, faction: FactionId, _defId: string, k: number) {
  const g = c.getContext('2d')!;
  const { x0, y0, x1, y1, top } = silhouette(c);
  if (x1 < 0) return;
  const W = x1 - x0, H = y1 - y0;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  if (faction === 'kessler') {
    // heavy armour bands across the lower body, each riveted along its top edge
    for (let i = 0; i < 3; i++) {
      const y = y0 + H * (0.45 + i * 0.17), bh = Math.max(2 * k, H * 0.05);
      g.fillStyle = 'rgba(30,34,42,0.38)'; g.fillRect(x0, y, W, bh);
      g.fillStyle = 'rgba(210,215,225,0.18)'; g.fillRect(x0, y, W, Math.max(1, k * 0.6));
      for (let x = x0 + 3 * k; x < x1; x += 6 * k) {
        g.fillStyle = 'rgba(230,230,235,0.55)'; g.fillRect(x, y + bh * 0.35, k, k);
        g.fillStyle = 'rgba(10,10,14,0.5)'; g.fillRect(x + k * 0.6, y + bh * 0.35 + k * 0.6, k * 0.7, k * 0.7);
      }
    }
    // rust hazard stripes on the flank
    g.strokeStyle = 'rgba(176,82,28,0.42)'; g.lineWidth = 3 * k;
    for (let x = x0 - H; x < x1; x += 14 * k) { g.beginPath(); g.moveTo(x, y1); g.lineTo(x + H * 0.4, y1 - H * 0.4); g.stroke(); }
  }
  g.restore();
  // outside the silhouette: Kessler's banner, Ashen's welded spikes
  if (faction === 'kessler') {
    const px = x0 + W * 0.18, py = top[Math.round(px)] >= 0 ? top[Math.round(px)] : y0;
    g.strokeStyle = '#2a2c32'; g.lineWidth = 1.2 * k;
    g.beginPath(); g.moveTo(px, py + 2 * k); g.lineTo(px, py - 16 * k); g.stroke();
    g.fillStyle = '#b8541e';
    g.beginPath(); g.moveTo(px, py - 16 * k); g.lineTo(px + 9 * k, py - 14 * k); g.lineTo(px, py - 9 * k); g.closePath(); g.fill();
    g.fillStyle = 'rgba(30,20,10,0.6)'; g.fillRect(px + 1.5 * k, py - 14 * k, 2.4 * k, 2.4 * k);
  }
}

/** A position-free tint for a baked unit/vehicle frame (safe across headings). */
export function skinUnit(c: HTMLCanvasElement, faction: FactionId) {
  const g = c.getContext('2d')!, W = c.width, H = c.height;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  if (faction === 'kessler') {
    g.fillStyle = 'rgba(26,30,38,0.22)'; g.fillRect(0, 0, W, H);                // heavier, darker steel
    const gr = g.createLinearGradient(0, H * 0.45, 0, H * 0.62);
    gr.addColorStop(0, 'rgba(176,82,28,0)'); gr.addColorStop(0.5, 'rgba(176,82,28,0.35)'); gr.addColorStop(1, 'rgba(176,82,28,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);                                    // a rust band round the body
  }
  g.restore();
}
