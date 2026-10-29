// Save / resume for single-player skirmishes. One slot in localStorage,
// written on a timer while playing and whenever the tab is hidden, so a
// closed tab or a phone call doesn't cost the match.

import { snapshotMap, restoreMap, MapSnapshot } from './map';
import { snapshotGame, restoreGame, GameSnapshot } from './game';
import { snapshotAI, restoreAI, AISnapshot, Difficulty } from './ai';
import { camera } from './input';
import { terrainPaintSeed } from './render';

const KEY = 'ozd-save-v1';

export interface SaveFile {
  version: 1; savedAt: number;
  map: MapSnapshot; game: GameSnapshot; ai: AISnapshot;
  terrainSeed: number; camera: { x: number; y: number; zoom: number };
}

export function writeSave(difficulty: Difficulty): boolean {
  const data: SaveFile = {
    version: 1, savedAt: Date.now(),
    map: snapshotMap(), game: snapshotGame(), ai: snapshotAI(difficulty),
    terrainSeed: terrainPaintSeed(), camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch { return false; }   // storage full or disabled
}

export function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveFile;
    return data.version === 1 ? data : null;
  } catch { return null; }
}

export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* storage may be unavailable */ } }

/** Restores the map, world and AI. The caller repaints with `terrainSeed` and places the camera. */
export function applySave(s: SaveFile) {
  restoreMap(s.map);
  restoreGame(s.game);
  restoreAI(s.ai);
}

/** One-line summary for the Resume button, e.g. "12 min in · saved 3 min ago". */
export function describeSave(s: SaveFile): string {
  const played = Math.round(s.game.stats.time / 60);
  const ago = Math.round((Date.now() - s.savedAt) / 60000);
  const agoText = ago < 1 ? 'just now' : ago < 60 ? `${ago} min ago` : ago < 1440 ? `${Math.round(ago / 60)} h ago` : `${Math.round(ago / 1440)} d ago`;
  return `${played} min in · saved ${agoText}`;
}
