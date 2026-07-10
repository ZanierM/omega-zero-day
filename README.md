# Omega Zero Day

A Red Alert 2–style real-time strategy game in TypeScript + HTML5 Canvas.
You command **Helion Dynamics** (blue) against 1–3 rogue AI factions
fighting over flux crystal on Kepler-442b. Destroy every hostile structure to win.

Buildings & units: ["Sci-Fi Strategy Mech Buildings Isometric Asset Pack" by acdrnx](https://opengameart.org/content/sci-fi-strategy-mech-buildings-isometric-asset-pack) (CC0) —
isometric pixel art with 8-direction units and three visual tech stages per building (shown as upgrade levels LV1→LV3).
Environment props: ["Sci-Fi RTS" by Kenney](https://kenney.nl/assets/sci-fi-rts) (CC0).

## Run it

```sh
npm install
npx vite
```

## How to play

- **Left-drag** — box-select units; left-click selects one unit/building
- **Right-click / two-finger click** — move; on an enemy: attack; harvesters sent to crystal will mine
- **Arrows / WASD / screen edges** — scroll; click the minimap (bottom-left) to jump
- **Build bar (bottom)** — pick a category from the dropdown, click an item to queue it.
  Units: every click queues one more (badge shows the count); right-click removes one.
  Buildings: click queues the next build; clicking the queued one again removes it.
  When a building shows PLACE, click its button then click the map.
- **Power** — buildings drain it, Solar Arrays supply it; a deficit slows production to 40% and disables turrets
- **Research** — build a Laboratory to unlock the Research tab: Weapons/Armor/Defence Grid upgrade lines
- **Building upgrades** — select your Nexus/Barracks/Fabricator/turrets and click UPGRADE (up to LV3: +50% HP per level, +30% turret damage, repairs on upgrade)
- **Walls** — cheap 1×1 barriers in the Defence tab; block pathing and soak damage

## Sound

All audio is synthesized live with WebAudio (no files): generative ambient music plus
effects for weapons, explosions, construction, research and credits. Toggle with the
SOUND button (bottom-right) or the **M** key. Combat is only audible when it's on screen.

## Tech tree

Solar → Barracks (infantry, Pulse Turret, Laboratory) · Solar → Extractor → Fabricator (vehicles) → Research Spire (Dominator, Thumper artillery, Rail Cannon)

## Skirmish setup

The briefing screen has a dropdown for 1–3 AI opponents; 2 AIs get a 76×76 map, 3 AIs get 90×90.

## Code map

| File | What it does |
|---|---|
| `src/config.ts` | All balance numbers — units, buildings, defences, upgrades, team colors |
| `src/map.ts` | Dynamic map generation, crystal fields, base positions |
| `src/path.ts` | A* pathfinding |
| `src/game.ts` | Simulation: movement, combat, harvesting, queues, research, power, fog, win/lose |
| `src/ai.ts` | AI opponents: build order, economy, research, attack waves |
| `src/input.ts` | Selection, orders, camera, placement |
| `src/render.ts` | Terrain texture, Kenney sprite baking + team tinting, effects, minimap |
| `src/ui.ts` | Bottom command bar: category dropdown, queue badges, upgrade button |
| `src/main.ts` | Briefing flow, world setup, game loop |

Console helpers: `novaStep(30)` fast-forwards 30s; `novaDebug` exposes live game state.
