# Omega Zero Day

A real-time strategy game in TypeScript and HTML5 Canvas. On the dying world of Cinder, command Helion Dynamics through a story campaign or choose a faction for a skirmish over flux crystal and the launch corridor.

## Run locally

```sh
npm install
npx vite
```

Open the local URL printed by Vite. Run `npm test` for the TypeScript check and `npx vite build` for a production build.

## Modes

**Campaign:** Play as Helion through an optional Boot Camp and thirteen missions in three acts, including a night-and-day tunnel hunt, a no-base commando raid, a convoy hunt and an escort through solar flares. A pre-mission conversation, comms and an objective tracker guide each mission. Choices about the Hearth Clans and the Hollow affect later allies and the ending. Easy, Normal and Hard difficulty are available. Completed missions and choices are saved locally.

**Skirmish:** Play as Helion Dynamics, the Kessler Collective, the Ashen Clans, the Vey Brood, the Keepers or the Hollow. Choose one or more human opponents, difficulty, starting flux, crystal density and one of four landscapes. Optional settings add the Brood, Keepers or Hollow as threats and start a supernova countdown. The last skirmish setup is remembered locally.

In skirmish, destroy every hostile structure to win. A human faction can also hold a majority of flux vents for three minutes to open the launch corridor; rivals can do the same. Ground combat units capture uncontested vents by standing nearby. Harvesters and aircraft do not capture them.

## Controls

- **Left-click / drag:** Select a unit or building / box-select units. Double-click selects units of the same type.
- **Right-click:** Move, attack an enemy, or send a harvester to crystal. **A** then left-click orders an attack move.
- **WASD / arrows / screen edge:** Move the camera. Click the minimap to jump. Use **+ / −** or the mouse wheel to zoom.
- **Build bar:** Pick a category and queue units or buildings. A finished building shows **PLACE**; click it, then click the map. Right-click a queued item to remove one.
- **Q:** Use selected units' ability. **S:** Stop. **P:** Pack a selected Clan building. **M:** Toggle sound.
- **Ctrl/Cmd + 1–9:** Save a control group; **1–9** recalls it. **Space:** Jump to the latest under-attack alert.
- **Menu button:** Pause, resume, restart or return to the briefing.

On touch screens, tap to select, tap the ground to order selected units, drag to pan, and pinch to zoom. The box-select button switches a drag from panning to selection.

## Game systems

Flux funds construction and production. Extractors send harvesters to crystal, while controlled vents provide income. Most human buildings need power; a deficit slows production and disables turrets. Laboratories or faction equivalents unlock research. Units gain veterancy, and many have faction-specific abilities. Campaign missions add scripted objectives, the Vey's response to harvesting, choices and allied factions.

Matches autosave in the browser and can be resumed from the briefing. Progress and saves use local storage in that browser.

All music and effects are synthesized with WebAudio; the game has no audio files.

## Code map

| File | Purpose |
|---|---|
| `src/config.ts` | Factions, units, buildings, research and balance |
| `src/map.ts`, `src/path.ts` | Map generation and pathfinding |
| `src/game.ts`, `src/ai.ts` | Simulation, win conditions and opponents |
| `src/campaign/missions.ts`, `src/campaign/runner.ts`, `src/campaign/scenes.ts` | Campaign content, mission state and pre-mission conversations |
| `src/input.ts`, `src/ui.ts`, `src/main.ts` | Controls, interface and game startup |
| `src/render.ts`, `src/*-art.ts`, `src/rig.ts` | Canvas rendering and faction art |
| `src/audio.ts`, `src/epilogue.ts`, `src/save.ts` | Sound, endings and save/resume |

Console helpers: `novaStep(30)` advances the simulation by 30 seconds; `novaDebug` exposes live game state.

## Art credits

The project includes [“Sci-Fi Strategy Mech Buildings Isometric Asset Pack” by acdrnx](https://opengameart.org/content/sci-fi-strategy-mech-buildings-isometric-asset-pack) and [“Sci-Fi RTS” by Kenney](https://kenney.nl/assets/sci-fi-rts), both CC0. Newer factions also use code-drawn art.
