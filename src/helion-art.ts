// Helion's infantry: the company's soldiers, in clean white composite plate
// over a dark undersuit, cyan visors and a stripe of company colour. Built on
// the creature rig (rig.ts) like the Clans and the aliens, so they stand and
// walk like people rather than stacked blocks. This module adds itself to
// art.ts's registries; Kessler keeps its own 'k:' troops.

import { VEHICLE_ART } from './art';
import { drawRig, stride, shadow } from './rig';
import type { Ctx, Tone, V3, Part } from './rig';

const SUIT: Tone = { dk: '#1c2028', mid: '#2e3440', lt: '#4a5262', hi: '#6a7488' };
const PLATE: Tone = { dk: '#8a94a2', mid: '#c4ccd6', lt: '#e8eef4', hi: '#ffffff' };
const GUNM: Tone = { dk: '#1e2026', mid: '#3a3e48', lt: '#5e6470', hi: '#8a909c' };
const VISOR = 'rgba(95,224,240,0.95)';

interface Kit {
  bulk?: number; visor?: string;
  gun: (P: Part[], z: number, team: string) => void;
  back?: (P: Part[], z: number, team: string) => void;
  extra?: (P: Part[], z: number, team: string) => void;
}
function soldier(g: Ctx, a: number, team: string, phase: number, k: Kit) {
  const bob = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.45, b = k.bulk ?? 1, P: Part[] = [];
  shadow(g, 1, 1.5, 6.5 * b, 3);
  for (const sd of [-1, 1]) {
    const [sw, lift] = stride(phase, sd, 2, 1.1);
    const hip: V3 = [0, sd * 1.2 * b, 7 + bob], knee: V3 = [0.6 + sw * 0.5, sd * 1.3 * b, 3.8 + lift], foot: V3 = [sw, sd * 1.3 * b, 0.8 + lift];
    P.push({ k: 'limb', a: hip, b: knee, w: 1.9 * b, w2: 1.6 * b, t: SUIT });
    P.push({ k: 'limb', a: knee, b: foot, w: 1.7 * b, w2: 1.4 * b, t: PLATE });                     // greaves
    P.push({ k: 'plate', c: [knee[0] + 0.5, knee[1], knee[2] - 0.6], rx: 0.9 * b, ry: 0.9 * b, h: 0.6, t: PLATE });   // knee guard
    P.push({ k: 'blob', c: [foot[0] + 0.5, foot[1], foot[2] - 0.2], rx: 1.3 * b, ry: 0.9 * b, t: GUNM });
  }
  const z = 7 + bob;
  P.push({ k: 'blob', c: [0, 0, z + 0.6], rx: 1.8 * b, ry: 2.2 * b, t: SUIT });                         // pelvis
  P.push({ k: 'blob', c: [0, 0, z + 3.4], rx: 2.2 * b, ry: 2.8 * b, t: SUIT });
  P.push({ k: 'plate', c: [0.4, 0, z + 3.6], rx: 2 * b, ry: 2.5 * b, h: 1.5, t: PLATE, ridge: 'rgba(60,70,84,0.6)' });   // chest plate
  P.push({ k: 'band', a: [1.6, -1.8 * b, z + 4.6], b: [1.6, 1.8 * b, z + 4.6], w: 0.8, col: team });   // company stripe
  k.back?.(P, z, team);
  for (const sd of [-1, 1]) {
    const sh: V3 = [0.1, sd * 2.4 * b, z + 5.2], el: V3 = [1.5, sd * 2.5 * b, z + 3.2], hand: V3 = [sd > 0 ? 3.1 : 4.8, 1.1, z + 3.6];
    P.push({ k: 'plate', c: [0, sd * 2.5 * b, z + 5.4], rx: 1.4 * b, ry: 1.3 * b, h: 1, t: PLATE });   // shoulder plate
    P.push({ k: 'limb', a: sh, b: el, w: 1.4 * b, w2: 1.2 * b, t: SUIT }, { k: 'limb', a: el, b: hand, w: 1.3 * b, w2: 1, t: PLATE });
  }
  k.gun(P, z, team);
  k.extra?.(P, z, team);
  // helmet: white shell, a dark visor band with a cyan glow across it
  P.push({ k: 'blob', c: [0.2, 0, z + 7.8], rx: 1.8 * b, ry: 2 * b, t: PLATE });
  P.push({ k: 'band', a: [1.3, -1.2, z + 7.7], b: [1.3, 1.2, z + 7.7], w: 1.1, col: '#14303e' });
  P.push({ k: 'glow', c: [1.7, 0, z + 7.7], r: 1.5, col: k.visor ?? VISOR });
  drawRig(g, a, P);
}
// a carbine held at the hip: dark body, a white shroud, a light along the side
const carbine = (len: number) => (P: Part[], z: number) => {
  P.push({ k: 'limb', a: [0.4, 1.1, z + 3.2], b: [3.6, 1.1, z + 3.6], w: 1.5, w2: 1.3, t: GUNM });
  P.push({ k: 'limb', a: [3.6, 1.1, z + 3.6], b: [3.6 + len, 1.1, z + 4.1], w: 0.9, w2: 0.7, t: PLATE });
  P.push({ k: 'glow', c: [2.6, 1.6, z + 3.8], r: 0.9, col: VISOR });
};
const pack = (P: Part[], z: number) => { P.push({ k: 'blob', c: [-2.3, 0, z + 4], rx: 1.4, ry: 2, t: GUNM }, { k: 'glow', c: [-3.1, 0, z + 4.6], r: 0.9, col: VISOR }); };

const TROOPER: Kit = { gun: carbine(4.6), back: pack };
const ROCKETEER: Kit = {
  back: pack,
  gun: (P, z) => {   // a launcher tube on the shoulder, warhead glowing at the front
    P.push({ k: 'limb', a: [-2.8, 1.9, z + 6.4], b: [4.8, 1.9, z + 6.9], w: 2.1, w2: 2.1, t: PLATE });
    P.push({ k: 'limb', a: [-2.8, 1.9, z + 6.4], b: [-1.6, 1.9, z + 6.5], w: 2.3, w2: 2.3, t: GUNM });
    P.push({ k: 'glow', c: [5, 1.9, z + 6.9], r: 1.6, col: 'rgba(255,140,58,0.9)' });
  },
};
const VANGUARD: Kit = {
  bulk: 1.2, back: pack, gun: carbine(3.4),
  extra: (P, z) => {   // a tall shield on the left arm, a light strip down its face
    P.push({ k: 'limb', a: [3.6, -2.8, z - 3.6], b: [3.8, -2.8, z + 4.6], w: 4, w2: 3.6, t: PLATE });
    P.push({ k: 'glow', c: [4.4, -2.8, z + 0.6], r: 1.6, col: VISOR });
  },
};
const SNIPER: Kit = {
  visor: 'rgba(255,90,90,0.95)',
  gun: (P, z) => {   // a long rifle with a scope, its lens glinting red
    P.push({ k: 'limb', a: [0.4, 1.1, z + 3.2], b: [3.6, 1.1, z + 3.6], w: 1.4, w2: 1.2, t: GUNM });
    P.push({ k: 'limb', a: [3.6, 1.1, z + 3.6], b: [11.6, 1.1, z + 4.3], w: 0.7, w2: 0.55, t: GUNM });
    P.push({ k: 'limb', a: [2.8, 1.1, z + 4.6], b: [6, 1.1, z + 5], w: 0.9, w2: 0.9, t: PLATE });
    P.push({ k: 'glow', c: [6.2, 1.1, z + 5], r: 0.9, col: 'rgba(255,80,80,0.9)' });
  },
  back: (P, z) => P.push({ k: 'cloth', c: [-0.6, 0, z + 5.6], r0: 2.4, z1: z - 1.6, r1: 3.8, t: { dk: '#2a3028', mid: '#46503e', lt: '#64705a', hi: '#8a967c' }, trim: 'rgba(0,0,0,0)' }),   // a camouflage cape
};
const PYRO: Kit = {
  visor: 'rgba(255,170,80,0.95)',
  back: (P, z) => { for (const sd of [-1, 1]) P.push({ k: 'limb', a: [-2.4, sd * 1.1, z + 1.4], b: [-2.4, sd * 1.1, z + 6.6], w: 1.9, w2: 1.9, t: { dk: '#6a1e10', mid: '#b8402a', lt: '#e06a4a', hi: '#ffb090' } }); },   // fuel tanks
  gun: (P, z) => {
    P.push({ k: 'limb', a: [0.4, 1.1, z + 3.2], b: [6.4, 1.1, z + 3.8], w: 1.4, w2: 1.1, t: GUNM });
    P.push({ k: 'glow', c: [6.8, 1.1, z + 3.8], r: 2.4, col: 'rgba(255,150,60,0.9)' });
  },
};
const JUGGERNAUT: Kit = {
  bulk: 1.45, visor: 'rgba(255,176,46,0.95)',
  back: (P, z) => P.push({ k: 'plate', c: [-2.6, 0, z + 4.6], rx: 1.6, ry: 3.2, h: 1.6, t: PLATE }),   // armoured power pack
  gun: (P, z) => {   // a rotary gun slung at the hip, six barrels
    P.push({ k: 'limb', a: [0.4, 2.6, z + 2.8], b: [4.4, 2.6, z + 3.2], w: 3, w2: 2.8, t: GUNM });
    for (const dy of [-0.6, 0, 0.6]) P.push({ k: 'limb', a: [4.4, 2.6 + dy, z + 3.2], b: [9.6, 2.6 + dy, z + 3.5], w: 0.6, w2: 0.5, t: PLATE });
  },
};

Object.assign(VEHICLE_ART, {
  trooper:    { hull: (g: Ctx, a: number, t: string, p = 0) => soldier(g, a, t, p, TROOPER),    reach: 11, height: 20, frames: 4, turn: 10 },
  rocketeer:  { hull: (g: Ctx, a: number, t: string, p = 0) => soldier(g, a, t, p, ROCKETEER),  reach: 11, height: 20, frames: 4, turn: 10 },
  vanguard:   { hull: (g: Ctx, a: number, t: string, p = 0) => soldier(g, a, t, p, VANGUARD),   reach: 11, height: 22, frames: 4, turn: 10 },
  sniper:     { hull: (g: Ctx, a: number, t: string, p = 0) => soldier(g, a, t, p, SNIPER),     reach: 14, height: 20, frames: 4, turn: 10 },
  pyro:       { hull: (g: Ctx, a: number, t: string, p = 0) => soldier(g, a, t, p, PYRO),       reach: 10, height: 20, frames: 4, turn: 10 },
  juggernaut: { hull: (g: Ctx, a: number, t: string, p = 0) => soldier(g, a, t, p, JUGGERNAUT), reach: 13, height: 26, frames: 4, turn: 10 },
});
