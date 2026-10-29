# Omega Zero Day — campaign plan (draft for review)

Status: **story and plan only, nothing implemented.** Names, tone and the mission list are all open to change before any code is written. Open questions are at the end.

---

## 1. The story

### Premise

Helios is dying. The colony world **Cinder** (the scorched planet the skirmish already plays on) has **214 days** before its sun goes supernova. In orbit waits the **ark-fleet**: forty thousand sleepers and the last of the colony's seed banks. Its jump drives burn **flux crystal**, and the fields are on the surface.

Flux has one more use. Fed through the **flux vents**, it powers the **launch beacon**, which opens a **corridor**: a short gravitational window that lets a fleet slip past the dying sun's outer shells. The window opens only as Helios destabilises, and only one fleet can ride it. Whoever holds the vents decides who that is.

Four factions are left on Cinder:

| Faction | Who they are | What they want | How they fight (skirmish doctrine) |
|---|---|---|---|
| **Helion Dynamics** (player) | The colony's original charter company: engineers, miners, its security wing | Get the ark-fleet out with everyone aboard | Balanced |
| **Kessler Collective** | The colony security corps, gone rogue under its marshal | A fleet that leaves under martial law, with their people first | Armoured columns behind gun lines |
| **Verdant Pact** | Terraformers and their families, who spent thirty years greening Cinder | To stay. They believe the vents can stabilise Helios | Infantry tides that swarm the vents |
| **Ashen Syndicate** | Deep-crust miners and smugglers | To sell seats on the fleet to the highest bidder | Fast raids on harvesters, aircraft, artillery |

### Characters

**The Commander (player).** Callsign *Lantern*. A Helion field commander given the job nobody wanted. Never seen or voiced; everyone talks *to* Lantern, which keeps the player in the seat.

**Admiral Ines Varga** — ark-fleet command, in orbit. The voice of every briefing (the skirmish's "final transmission" is hers). She is calm, dry and exhausted, and she counts sleepers the way other people count bullets. She can't land, so she can't help, and she knows it. *Arc:* she starts by giving orders and ends by asking favours.

**Sergeant Mara Okoye** — ground lead and the tutorial voice. She has twenty years in Helion security and served under Kessler before the split. She is blunt, funny under fire and protective of rookies. *Arc:* she knows how Kessler thinks and slowly admits she agrees with half of it.

**Dr. Teodor Lind** — Helion flux engineer. He explains vents, the corridor and research. He is warm, nervous and talks too much. *Secret:* he designed the beacon and knows the corridor fits one fleet, not "everyone". He has known this since day one.

**Marshal Dieter Kessler** — leader of the Kessler Collective. A former security chief who held the colony together through two famines. He is not cruel; he is certain. *Line:* "Order is the only seat belt this colony ever had." *Arc:* becomes the Act III wall, then makes a last offer.

**Speaker Ama Reyes** — elected voice of the Verdant Pact. A gentle scientist who is partly right: vent flux *can* delay the nova, by days, not years. *Arc:* the campaign's moral choice. Do you trust her numbers?

**Vessa Kol, "the Cinder Queen"** — runs the Ashen Syndicate. She is charming, mercenary and the only one who enjoys the end of the world. *Arc:* she is never an ally, but she trades. Two missions offer a deal, at a price.

### Three acts

**Act I — Landfall.** Lantern lands at a burned-out Helion depot to restart flux production. Kessler patrols test the new base. Lind shows that vents matter more than crystal fields. Kessler's first real assault reveals the Collective has already taken the colony's armour depots.

**Act II — The Corridor.** Lind reveals the corridor and the vents' role. Every faction starts racing for the vents. The Ashen Syndicate burns Helion's economy to force a deal. The Verdant Pact holds the central vents and Reyes asks Lantern to stop fighting: give her ten days with the vents and she can buy the colony a second window. Lantern **chooses** whether to spare the Verdant research spire. Meanwhile Kessler builds an orbital uplink to hold the fleet hostage, and the act ends with Lantern destroying it.

**Act III — Last Light.** Helios starts flaring. Lind confesses the corridor fits one fleet. Kessler offers to merge fleets under his command. Okoye pushes Lantern to take it. Lantern breaks Kessler's wall either way. In the finale, *Zero Day*, every remaining faction converges on the corridor vents while the sun comes apart. Hold the vents until the beacon fires.

**Ending.** The fleet always launches. The variant depends on the Act II choice:
- **Spared the spire:** Reyes's data buys enough time for a second, smaller corridor. The Verdant Pact follows the fleet out. The final card is two fleets.
- **Destroyed it:** the corridor closes behind Lantern. One fleet, and a long silence on the comms.

---

## 2. Missions

Each mission teaches one thing, uses one faction's doctrine, and leans on mechanics that already exist. "New" marks the engine work a mission needs.

| # | Mission | Faction | Teaches / uses | Win | Notes |
|---|---|---|---|---|---|
| 1 | **Cold Drop** | Kessler (patrols only) | Base building, harvesting, power | Build an Extractor and deliver 3,000 flux, then destroy the patrol camp | Okoye tutorial prompts. New: tech locks (structures tab only), tutorial triggers |
| 2 | **Flux Lines** | Verdant (scouts) | Capturing vents and towers, vision | Hold 2 vents and a tower for 60 s | Lind's first scene. Capture status from skirmish is the core |
| 3 | **Iron Weather** | Kessler | Defences, repair, upgrades | Survive 3 scripted waves, then destroy the forward base | New: scripted waves, survive timer |
| 4 | **Sparks** | Ashen | Protecting the economy, raids, mobile defence | Keep 3 harvesters alive for 8 min while you build a Fabricator | Vessa's first deal: pay 2,000 flux and the raids stop for 2 min. New: protect objective, offer dialogue |
| 5 | **The Green Tide** | Verdant | Infantry counters (pyro and artillery), choice | Break the Verdant hold on the central vents | Optional objective: **spare the research spire** (it sets the ending). New: optional objectives, a campaign flag |
| 6 | **Uplink** | Kessler | Research, orbital strike, a timed assault | Destroy Kessler's Orbital Uplink before it charges (on-screen timer) | You get the Orbital Protocol early. New: per-mission starting tech |
| 7 | **Burning Sky** | Ashen and Verdant | Solar flares, three-way fights, the corridor | Secure the launch corridor (hold most vents for 3 min) | Uses the skirmish corridor win directly, with flares from the start |
| 8 | **Kessler's Wall** | Kessler | Siege: bastions, walls, artillery, colossus | Destroy Kessler's Nexus | Kessler's offer mid-mission: accept and it ends differently (an alternate debrief, same next mission) |
| 9 | **Zero Day** | All remaining | Everything | Hold the corridor for 5 min with the supernova clock running | Map-wide flares, waves from all sides. Ending variant from the mission 5 flag |

Each mission runs about 12–25 minutes, roughly 3 hours for the whole campaign. There is one difficulty setting for the campaign, using the existing Easy, Normal and Hard knobs.

---

## 3. Implementation plan

The plan reuses the skirmish engine and keeps the existing file ownership. Nothing starts until the story and the mission list are signed off.

### Phase 0 — engine groundwork (Claude: `game.ts`, `ai.ts`, `map.ts`)
1. **Objectives replace the hard-coded win check.** An objective list is evaluated every tick. Skirmish becomes the default list ("destroy all" OR "hold corridor", "lose if HQ gone"), so skirmish behaviour doesn't change.
   - Types: `destroyAll`, `destroyBuilding`, `holdCorridor`, `captureN`, `survive`, `deliverFlux`, `protectUnits`, `timer` (fail when it expires).
   - Each objective is primary or optional, and can be hidden until a trigger reveals it.
2. **Event bus.** `unitDied`, `buildingDestroyed`, `captured`, `corridorChanged`, `enteredArea`, `timeReached`, `objectiveDone`. Missions subscribe to these; the game knows nothing about missions.
3. **Scripted actions.** Spawn a wave at a point with a target, reveal an area, give credits, unlock tech, set an AI posture, end the mission.
4. **Hand-authored maps.** A fixed seed plus overrides for bases, vents, towers and crystal, so every play of a mission has the same layout.
5. **Tech locks and starting tech** per mission, checked in `canBuild`.
6. **AI hooks.** Per-mission doctrine overrides, a "hold position" posture (no waves), "attack now", and switching off expansion.

### Phase 1 — mission data and the first slice
- `src/campaign/missions.ts` holds pure data: map, factions, start state, objectives, triggers, dialogue. The plan is one file per act once it grows.
- `src/campaign/runner.ts` loads a mission, wires its triggers to the event bus, and tracks objectives and flags.
- Build **missions 1–3** first as a vertical slice, test them with you, then do Acts II and III.

### UI agent's part (`index.html`, `ui.ts`, `main.ts`)
- A Campaign / Skirmish choice on the briefing, with a mission select that shows locked and completed missions.
- A mission briefing card (Varga's transmission, the objectives, and a map thumbnail).
- A **comms box**: portrait, speaker name and typed-out line, skippable, and never blocking input.
- An **objective tracker** (primary, optional, timers) alongside the existing corridor strip.
- Mission complete and failed screens, and the ending cards.
- Campaign progress in localStorage (one key, try/catch, like the save slot).

### Claude's art part (`art.ts`, `render.ts`)
- Code-drawn portrait busts for the six characters, in the refined style, baked once like the icons.
- Mission props: a crashed lander, a launch-beacon tower for the corridor, Verdant greenhouses, Kessler banners.
- An area-trigger marker (a ground ring) for "move here" objectives.

### Saves
- Campaign progress: completed missions, the mission 5 flag, best times.
- A mid-mission save reuses `save.ts` and adds the mission id, fired triggers, objective state and flags.

### Order of work
1. Phase 0, with skirmish moved onto the objective system and re-tested (no player-visible change).
2. Missions 1–3, the comms box and the tracker, then playtest with you.
3. Missions 4–6 and the choice flag.
4. Missions 7–9 and the endings.
5. Balance pass using the new telemetry (time to first fight and match length per mission).

---

## 4. Questions for you before implementation
1. **Tone:** grounded and bittersweet (as written), or more pulpy and action-heavy?
2. **The choice in mission 5:** keep it (two endings), or a single linear ending?
3. **Kessler's offer in mission 8:** a real branch (a different mission 9 setup), or flavour only?
4. **Length:** 9 missions (~3 h), or a shorter 5–6 mission first release?
5. **Names:** keep the planet as *Cinder* and the player callsign as *Lantern*, or something else?
6. **Voice:** text only (recommended), or should we plan for voice lines later?
