// Pre-mission conversations: the characters talk the commander through who is
// who and why this mission matters, before the clock starts. Shown in the
// scene box (src/scene.ts) and replayable from the pause menu.
//
// Lantern never speaks. Lines can depend on campaign flags, so each scene is a
// function of the mission context.

import type { Ctx, SceneLine } from './runner';

export interface Scene { place: string; lines: SceneLine[] }

export const SCENES: Record<string, (c: Ctx) => Scene> = {
  // ---------------------------------------------------------------- Act I
  'act1-1': () => ({
    place: 'Ark-fleet flagship, high orbit over Cinder · 214 days to collapse',
    lines: [
      { who: 'varga', text: "Commander, I'm Admiral Ines Varga. As of this morning you are the most important person in the Helios system, so I'm going to take two minutes to make sure you know why." },
      { who: 'varga', text: "Helios is dying. Our astronomers give it two hundred and fourteen days before it collapses and takes every world in this system with it. Above you are forty thousand colonists asleep in the ark-fleet. They are everyone we managed to load." },
      { who: 'varga', text: "The fleet can carry them out, but its jump drives are empty, and they run on flux: the blue crystal that grows on Cinder. The last good fields are under your feet. Every load you dig up goes up the tether to us." },
      { who: 'varga', text: "One more thing, and it matters later. As the star comes apart, its outer shells will open a single gap we can fly through. We call it the corridor. To steer through it the fleet needs a beacon on the surface, and the beacon is powered by the flux vents. So we need two things before that day: flux in the tanks, and the vents in our hands." },
      { who: 'varga', text: "Your callsign is Lantern. The company chose it, not me. Your ground lead is Sergeant Mara Okoye. Listen to her; she knows Cinder better than anyone I have." },
      { who: 'okoye', text: "Lantern. Mara Okoye. Twenty years in colony security, so I've seen most of what this planet throws at you. Welcome to the dirt." },
      { who: 'okoye', text: "We're dropping into Depot Six. It was Helion's biggest flux depot until it burned three weeks ago. The company report says it was an accident. Nobody on the surface believes that." },
      { who: 'okoye', text: "That was also the week the colony's security corps walked out on Helion. Marshal Kessler took most of them with him. They call themselves the Kessler Collective now, and they patrol the ridge above the depot. I used to wear their colours, so trust me when I say they will shoot." },
      { who: 'varga', text: "Then here is the job. Get Depot Six running, deliver twelve thousand flux to the fleet, and deal with whatever Kessler has watching you from that ridge." },
      { who: 'okoye', text: "Power first, then an Extractor on the crystal. I'll talk you through the rest once we're down." },
    ],
  }),

  'act1-2': () => ({
    place: 'Depot Six, the morning after · 209 days',
    lines: [
      { who: 'okoye', text: "Before anything else: Harvester Two. It stopped reporting at the end of yesterday's shift. No wreck, no tracks, just a hole in the ground that was still warm when we found it. Something pulled it under." },
      { who: 'lind', text: "Ah, hello, Commander. Dr. Teodor Lind, chief flux engineer. Sorry, yes, a missing harvester, awful. But I need to talk to you about the vents, because they matter more than any crystal field." },
      { who: 'lind', text: "The crystal fields are what's left lying on the surface. The vents are where flux comes up from deep in the crust, pure and steady. Hold a vent and it feeds you without a single harvester." },
      { who: 'lind', text: "And the corridor beacon the Admiral told you about runs on vent flux. No vents, no beacon. No beacon, nobody leaves. So I need to survey them: ninety seconds of steady readings from two vents west of here, relayed through a watchtower. Then I can start working out where the beacon has to stand." },
      { who: 'okoye', text: "The problem is who's sitting on them. The Hearth Clans." },
      { who: 'okoye', text: "Short version. Thirty-odd years ago Helion's first miners worked the deep crust. When the company moved on, some of them stayed behind. The clans are their grandchildren. The Hearth live right beside the crystal and treat the vents like holy ground, and they will not share them." },
      { who: 'okoye', text: "Their leader is Ama Reyes, a Helion biologist who walked off the job years ago and never came back. Don't expect her to be pleased to see us." },
      { who: 'okoye', text: "How they fight: old rifles, firebombs and harpoons. Their camps need no power and can pack up and move. And they hide snares in the dirt around anything they hold. You won't see one until it springs, so send a cheap squad in first." },
      { who: 'varga', text: "Take the two vents and a watchtower, and hold them long enough for Dr. Lind's survey. And Lantern: try not to start a war we don't need." },
    ],
  }),

  'act1-3': () => ({
    place: 'Depot Six, eight days later · 201 days',
    lines: [
      { who: 'okoye', text: "We need to talk about the vents. Those things that came up out of the ground at the harvester. I looked at the bodies, Lantern. They were human. Pale, with crystal growing through the skin like quartz, but human." },
      { who: 'lind', text: "Which isn't possible. Nobody lives out there. The company surveys say so, the colony records say so. I'm writing it up anyway, because somebody has to." },
      { who: 'okoye', text: "And the voice on the comms shouting about 'root-takers'. That signal came from under the crust. I don't have a theory. I just don't like it." },
      { who: 'varga', text: "It will have to wait. Kessler has stopped probing. Orbital scans show an armoured column forming at his forward base, and it is pointed straight at Depot Six." },
      { who: 'okoye', text: "Some background on Kessler, since you'll hear from him today. Marshal Dieter Kessler ran colony security for twenty years. When Helion's supply ships didn't come, he kept this colony fed through two famines. People down here trust him more than they trust the company." },
      { who: 'okoye', text: "I served under him for twelve of those years. He's hard, but he doesn't lie for fun. When he walked out three weeks ago, he said Helion had done something unforgivable. He never said what." },
      { who: 'varga', text: "Whatever his grievance is, he wants the fleet, and he means to take it by force. Your Fabricator clearance has come through. Build armour, dig in behind your turrets and let his column break on them. Then take his forward base apart." },
      { who: 'okoye', text: "Rocket Troopers behind the turrets, tanks in reserve. And keep the harvesters behind the guns. Kessler knows exactly what feeds the fleet." },
    ],
  }),

  // ---------------------------------------------------------------- Act II
  'act2-4': () => ({
    place: 'Act II — The Corridor · Depot Six · 176 days',
    lines: [
      { who: 'okoye', text: "You heard Kessler's broadcast. Everyone on Cinder heard it. 'Ask your company what Project Lantern was. Ask them who signed it.'" },
      { who: 'okoye', text: "Lantern. The same word as your callsign. I'm going to assume that's somebody's idea of a joke, because the other explanations are worse." },
      { who: 'varga', text: "Project Lantern was a deep-drilling programme, Sergeant. It is classified, and it is not your concern or the commander's. Kessler wants us arguing among ourselves before the corridor opens. Don't give him that." },
      { who: 'lind', text: "It was... yes. A drilling programme. That's right." },
      { who: 'varga', text: "Now. A supply convoy lands at Depot Six in eight minutes with drive parts for the fleet, and it needs flux on the pad when it touches down." },
      { who: 'okoye', text: "That'll be messy, because the other clans have found us: the Ashen. They're not the same as the Hearth. The Hearth want us off the crystal. The Ashen don't care about the crystal or about us. They're raiders and traders, and they'll sell anything to anyone." },
      { who: 'okoye', text: "Their chief is Vessa Kol. People call her the Cinder Queen. Her crews come in on fast technicals, cut a harvester open for its flux and parts, and they're gone before a turret can turn." },
      { who: 'okoye', text: "So: turrets by the crystal, and a Fabricator up so we've got something fast enough to chase them. And don't lose more than three harvesters." },
      { who: 'varga', text: "If you do, I turn the convoy around. I'm sorry, but I will." },
    ],
  }),

  'act2-5': () => ({
    place: 'The central valley · 168 days',
    lines: [
      { who: 'lind', text: "Good news, of a kind. The survey worked. The beacon has to stand in the middle of the valley, where four big vents meet. The bad news is that the Hearth Clans hold three of them." },
      { who: 'varga', text: "Then the commander takes them. We are out of time to ask nicely." },
      { who: 'reyes', text: "Commander. This is Ama Reyes, Speaker for the Hearth. I'm opening this channel because I would rather talk than bury more people. Please give me one minute." },
      { who: 'reyes', text: "I came to Cinder as a Helion biologist. I studied the crystal for six years before I understood what I was looking at. Flux isn't a mineral. It grows, it reacts, it signals. The whole field under this valley is one living thing. We call it the Vey." },
      { who: 'reyes', text: "The vents are where it breathes. When you cap one and draw on it, it hurts. I have recordings of it. Our labs are in the old terraforming station between the vents, and everything I have learned is in there." },
      { who: 'lind', text: "Lantern, I... have seen odd readings. The vents pulse, like a heartbeat. I put it in my report. I'm not saying she's right." },
      { who: 'okoye', text: "You're not saying she's wrong either, Doc." },
      { who: 'reyes', text: "Take the vents if you must. But come and look at the labs first, and then decide what kind of people you are. If you burn them, you burn the only proof anyone has." },
      { who: 'varga', text: "The objective is the vents, Lantern. What happens to the labs is your call. I won't order it either way." },
      { who: 'okoye', text: "They'll come in swarms with firebombs, and they'll seed the ground with snares. Thumpers break up a crowd. Keep the tanks in front and sweep ahead for traps." },
    ],
  }),

  'act2-6': () => ({
    place: 'The northern flats · 160 days',
    lines: [
      { who: 'varga', text: "Lantern. Kessler is charging an Orbital Uplink: a fire-control link that can reach the fleet in orbit. Once it charges he can threaten every ship up here, and forty thousand sleepers become his hostages." },
      { who: 'varga', text: "He has shielded it behind three relay pylons out in the valley. Destroy the relays and the shield drops. You have eleven minutes. Fleet Command has cleared you to research the Orbital Protocol and put up an Uplink of your own." },
      { who: 'okoye', text: "And there's the other thing. Since the valley, every time we push a field hard, the ground answers: tremors, crystal storms, vents going dark. And the pale ones come up wherever we cut deepest." },
      { who: 'lind', text: "The resonance. Yes. I've been reading the signal maps from Reyes's labs all week, and..." },
      { who: 'lind', text: "Lantern, when this is over I need to talk to you. Privately. Please don't let me put it off again." },
      { who: 'varga', text: "One more thing. Deep-space arrays picked up something on approach to Cinder last night. It isn't ours and it isn't Kessler's. I don't know what it is. Watch the sky." },
      { who: 'okoye', text: "Relays first, then the uplink. Eleven minutes. Let's go." },
    ],
  }),

  // ---------------------------------------------------------------- Act III
  'act3-7': () => ({
    place: 'Act III — Last Light · The deep crust, south of the valley · 19 days',
    lines: [
      { who: 'okoye', text: "Varga's back on the channel. Weeks of silence, and now she's back like nothing happened. So I'm going to say it all out loud, once, so the commander has it straight." },
      { who: 'okoye', text: "Lind's file, the Resonance Report. Nineteen years ago a Helion survey proved that the Vey, Reyes's living crystal, has been holding Helios steady for millions of years. Every ton of flux we cut loosens its grip on the star." },
      { who: 'okoye', text: "The board buried the report, because flux paid too well. Then six years ago they built Project Lantern: a shaft drilled into the Vey's heart to pull flux faster than any harvester could. It worked. The Vey convulsed, and the star started to die. That's our countdown." },
      { who: 'okoye', text: "And Depot Six held the survey archive. Company security burned it the week Kessler started asking questions. He was telling the truth about all of it." },
      { who: 'lind', text: "Every word of that is true. I designed the Lantern tap. I named it. I have spent six years trying to find a way to undo it." },
      { who: 'varga', text: "I know what you all think of me. You can go on thinking it once the corridor is open. Until then I am still responsible for forty thousand people, and so are you." },
      { who: 'okoye', text: "Then there are the visitors. The ships that came down in the middle of the uplink fight. Doc?" },
      { who: 'lind', text: "They call themselves the Keepers. As far as I can tell, they made the Vey. They seeded it here, ages ago, like a garden, to keep Helios alive. They've come back because it's dying, and they strike whoever is cutting the most. Which is mostly us." },
      { who: 'okoye', text: "Which brings us to today. The pale people from under the crust have a name. They're the Hollow." },
      { who: 'lind', text: "Two hundred years ago a colony ship called the Meridian came down hard on Cinder. It was listed as lost with all hands. It wasn't. The survivors lived, and the Vey grew into them. The Hollow are their great-great-grandchildren. The voice on our comms is one of their elders." },
      { who: 'varga', text: "Survey drones have found the wreck. So has Vessa Kol. Her crews have been cutting the Hollow out of the crystal for years. That's where the 'purest flux on Cinder' comes from. She's moving on the ship now." },
      { who: 'seren', text: "Root-takers. Your machines listen at last. The ship your engineer speaks of is our home, and our grave, and our cradle. Come and see her before the Ashen cut her open." },
      { who: 'okoye', text: "Vessa will offer you money to look away. The Hollow will ask you to stand with them. I'm not going to tell you what to do, Lantern. I'm just going to remember what you did." },
    ],
  }),

  'act3-8': c => {
    const sold = c.flag('meridian') === 'sold';
    return {
      place: "Kessler's Wall, the northern vents · 6 days",
      lines: [
        { who: 'varga', text: "Kessler has walled himself in around the last launch-capable vents in the north. He means to light a beacon of his own and take the corridor with his people aboard. If he does, our forty thousand stay behind." },
        { who: 'lind', text: "And Project Lantern is still running. The tap at the bottom of the shaft is still drawing from the Vey's heart, even now, with the star coming apart. If I shut it off, the Vey might steady Helios just long enough for the corridor to open on time." },
        { who: 'lind', text: "The controls are at the bottom of the shaft, and I'm the only one left who knows them. I'm going down. Keep the shaft head clear for ninety seconds and I'll do the rest." },
        { who: 'okoye', text: "Teo, that shaft is full of whatever comes up out of the Vey. Nobody walks back out of that." },
        { who: 'lind', text: "Mara. I built the thing that is killing the sun. Let me do one useful thing with what I know." },
        { who: 'varga', text: "I can't order you to let him go, Lantern. I can't order you to stop him either." },
        sold
          ? { who: 'okoye', text: "Kessler's going to make you an offer today. After the Meridian, I honestly don't know which side of it I'm on. Just so you know." }
          : { who: 'okoye', text: "Kessler's going to make you an offer today. Whatever he says about the board, he'll be right. That doesn't make him right about us." },
        { who: 'okoye', text: "Bastions on the north face, rail cannons either side. Thumpers to crack the walls, heavy armour behind them. And somebody on that shaft head the whole time." },
      ],
    };
  },

  'act3-9': c => {
    const spared = c.flag('labs') === 'spared', hollow = c.flag('meridian') === 'protected', okoyeLeft = c.flag('okoye') === 'left';
    const lines: SceneLine[] = [
      { who: 'narrator', text: 'Helios fills half the sky. The corridor vents are already burning.' },
      { who: 'varga', text: "Lantern. This is the last briefing I will give you. Helios is breaking up. The corridor opens in minutes, and about fifteen minutes after that it closes for good." },
      { who: 'varga', text: "Hold three of the five corridor vents for five minutes and the beacon lights. Once it's lit, the fleet can go." },
      { who: 'reyes', text: spared
        ? "Commander. You left our labs standing, so you already know what the beacon costs. To fire, it burns the vents dry, and what is left of the Vey burns with them. Cinder dies the moment the fleet leaves."
        : "Commander. You burned our labs, but you will hear this anyway. To fire, the beacon burns the vents dry, and what is left of the Vey burns with them. Cinder dies the moment the fleet leaves." },
      { who: 'reyes', text: "There is another way. Give the vents to us and don't fire. Left alone, the Vey might steady Helios for years, maybe decades. I can't promise more than that. Nobody can." },
    ];
    if (hollow) lines.push({ who: 'elder', text: "And there is a third, root-taker. The Vey can live in a single crystal, its heart, at the bottom of your Lantern shaft. Carry it with you and it will not die with this sun. But it is the Vey that holds the star. When we lift it out, Helios will not wait." });
    lines.push({ who: 'varga', text: "I won't tell you which. I have made enough choices on this world. When the beacon is lit, the decision is yours." });
    lines.push(okoyeLeft
      ? { who: 'varga', text: "Sergeant Okoye is with Kessler's survivors now. I know. Hold the vents anyway." }
      : { who: 'okoye', text: "Three vents, five minutes. Whatever you choose at the end, Lantern, I'm with you." });
    return { place: 'The corridor vents · the last hour', lines };
  },
};
