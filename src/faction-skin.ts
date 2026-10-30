// Faction looks: the human factions share building and vehicle shapes, so each
// gets a "skin" painted over the finished art, inside its silhouette only
// (source-atop), once at bake time. Helion stays clean corporate tech.
//   Kessler: riveted armour bands, rust stripes, a war banner
//   Verdant: moss, climbing vines, mismatched patched panels
//   Ashen:   soot rising from the base, scorch streaks, embers, welded scrap spikes
// Units turn through many headings, so they only get smooth, position-free
// treatments (anything scattered would shimmer as they rotate).

import { SLOTS, FactionId } from './config';

export const skinOf = (owner: number): FactionId | null => {
  const f = SLOTS[owner];
  return f === 'kessler' || f === 'verdant' || f === 'ashen' ? f : null;
};

function rng(seed: number) {
  let r = seed * 9301 + 49297;
  return () => (r = (r * 233280 + 49297) % 2147483647) / 2147483647;
}
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0;

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
export function skinBuilding(c: HTMLCanvasElement, faction: FactionId, defId: string, k: number) {
  const g = c.getContext('2d')!;
  const { x0, y0, x1, y1, top } = silhouette(c);
  if (x1 < 0) return;
  const W = x1 - x0, H = y1 - y0, rnd = rng(hash(defId + faction));
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
  } else if (faction === 'verdant') {
    // moss settles on the upper surfaces
    for (let i = 0; i < 9; i++) {
      const x = x0 + rnd() * W, y = y0 + rnd() * H * 0.7, r = (5 + rnd() * 9) * k;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(78,130,52,0.5)'); gr.addColorStop(1, 'rgba(78,130,52,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // mismatched patch panels with stitched seams
    for (let i = 0; i < 3; i++) {
      const pw = (6 + rnd() * 8) * k, ph = (4 + rnd() * 5) * k, x = x0 + rnd() * (W - pw), y = y0 + H * 0.35 + rnd() * H * 0.45;
      g.fillStyle = rnd() < 0.5 ? 'rgba(150,140,100,0.35)' : 'rgba(90,110,80,0.4)'; g.fillRect(x, y, pw, ph);
      g.strokeStyle = 'rgba(30,26,18,0.5)'; g.lineWidth = Math.max(1, k * 0.5); g.setLineDash([k, k]);
      g.strokeRect(x, y, pw, ph); g.setLineDash([]);
    }
    // vines climbing from the ground, with leaves
    g.strokeStyle = 'rgba(52,104,40,0.85)'; g.lineWidth = 1.2 * k; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      let x = x0 + (0.1 + rnd() * 0.8) * W, y = y1;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        const nx = x + (rnd() - 0.5) * 8 * k, ny = y - (4 + rnd() * 6) * k;
        g.quadraticCurveTo(x + (rnd() - 0.5) * 10 * k, (y + ny) / 2, nx, ny);
        x = nx; y = ny;
        if (y < y0 + H * 0.2) break;
      }
      g.stroke();
      for (let s = 0; s < 5; s++) {
        const lx = x0 + (0.1 + rnd() * 0.8) * W, ly = y0 + H * (0.3 + rnd() * 0.6);
        g.fillStyle = 'rgba(96,160,64,0.8)';
        g.beginPath(); g.ellipse(lx, ly, 1.8 * k, 1 * k, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
      }
    }
  } else if (faction === 'ashen') {
    // soot rising from the base
    const sg = g.createLinearGradient(0, y1, 0, y0 + H * 0.25);
    sg.addColorStop(0, 'rgba(14,10,8,0.62)'); sg.addColorStop(1, 'rgba(14,10,8,0)');
    g.fillStyle = sg; g.fillRect(x0, y0, W, H);
    // scorch streaks and rust patches
    for (let i = 0; i < 6; i++) {
      const x = x0 + rnd() * W, len = H * (0.2 + rnd() * 0.4);
      const st = g.createLinearGradient(0, y1 - len, 0, y1);
      st.addColorStop(0, 'rgba(10,6,4,0)'); st.addColorStop(1, 'rgba(10,6,4,0.55)');
      g.fillStyle = st; g.fillRect(x, y1 - len, (2 + rnd() * 3) * k, len);
    }
    for (let i = 0; i < 4; i++) {
      const x = x0 + rnd() * W, y = y0 + H * (0.3 + rnd() * 0.5), r = (3 + rnd() * 5) * k;
      g.fillStyle = 'rgba(140,62,24,0.32)'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd(), 0, Math.PI * 2); g.fill();
    }
    // embers still glowing in the joints
    for (let i = 0; i < 6; i++) {
      const x = x0 + rnd() * W, y = y0 + H * (0.4 + rnd() * 0.5);
      const eg = g.createRadialGradient(x, y, 0, x, y, 3 * k);
      eg.addColorStop(0, 'rgba(255,150,60,0.9)'); eg.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = eg; g.beginPath(); g.arc(x, y, 3 * k, 0, Math.PI * 2); g.fill();
    }
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
  } else if (faction === 'ashen') {
    for (let i = 0; i < 5; i++) {
      const x = Math.round(x0 + (0.12 + i * 0.19) * W), ty = top[x];
      if (ty < 0) continue;
      const hgt = (4 + rnd() * 5) * k;
      g.fillStyle = i % 2 ? '#2a2420' : '#3a302a';
      g.beginPath(); g.moveTo(x - 1.6 * k, ty + k); g.lineTo(x + rnd() * 2 * k, ty - hgt); g.lineTo(x + 1.6 * k, ty + k); g.closePath(); g.fill();
    }
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
  } else if (faction === 'verdant') {
    const gr = g.createLinearGradient(0, H, 0, H * 0.3);
    gr.addColorStop(0, 'rgba(70,120,46,0.42)'); gr.addColorStop(1, 'rgba(70,120,46,0.05)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);                                    // moss and field green
  } else if (faction === 'ashen') {
    const gr = g.createLinearGradient(0, H, 0, H * 0.25);
    gr.addColorStop(0, 'rgba(14,10,8,0.5)'); gr.addColorStop(1, 'rgba(14,10,8,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);                                    // soot
    g.fillStyle = 'rgba(150,60,20,0.12)'; g.fillRect(0, 0, W, H);                 // rust cast
  }
  g.restore();
}
