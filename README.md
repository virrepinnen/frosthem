# Frosthem — The Barbarian

A playable ARPG prototype in the spirit of Diablo 2, set in a winter landscape.
You create a character, start in the village of Frosthem with a rusty axe and
nothing else, follow the path north, fight, pick up loot, level up and build a
character. The game saves itself in the browser.

## Play

**▶ Play here: https://virrepinnen.github.io/frosthem/**

Nothing to install — it runs straight in the browser. The character is saved
locally in your browser, so you can close the tab and continue later on the same
machine.

## Running locally

No build chain required — the project is static files. Start a web server in the
project root:

```bash
python3 -m http.server 8123
```

Then open `http://127.0.0.1:8123/index.html`. The files are ES modules, so they
have to be served over HTTP — opening `index.html` straight from disk will not
work.

> **If your character "disappears":** the save lives in the browser's
> `localStorage`, which is tied to the exact origin. `http://127.0.0.1:8123` and
> `http://localhost:8123` count as *two different sites* — and the published page
> is a third. Stick to the same address and the character stays put.

## Controls

| Key | Effect |
| --- | --- |
| `←` `↑` `↓` `→` | Walk |
| — | The attack takes care of itself when an enemy is within reach |
| `1`–`6` | Skills |
| `Q` | Health potion |
| `E` | Use: talk, waystone, portal, chest |
| `Space` | Dodge roll (invulnerable mid-roll) |
| `T` | Open a town portal (and go back again) |
| `I` / `C` / `K` | Bag · Character · Skills |
| `F5` | Save now |
| `F1` / `F2` | How to play · hide the quick list |
| `Esc` | Close panels, otherwise the pause and save menu |

The controls are built for a laptop and **need no mouse at all**: right hand on
the arrow keys, left hand on `1`–`6` and `Q`. WASD is deliberately removed so the
left hand belongs to the skills. You aim automatically at the nearest enemy in
line of sight, and strike on your own the moment someone comes within reach — a
marker shows whose turn it is. Both auto-aim and auto-attack can be switched off
in the pause menu, and left click still works as a manual trigger.

The icons under the minimap open the same views with the mouse; hover over them
to see the shortcut. A gold dot means you have unspent points.

Skills go onto the hotbar automatically as you learn them. Right-clicking a skill
in the skill panel moves it to the next slot.

Items can also be picked up by clicking their name label on the ground. Gold and
potions are picked up automatically as you walk over them.

## What is built

**The world.** The village of Frosthem (fixed layout, a merchant and an NPC) and
three wilderness zones: Bleka hedarna → Vargpasset → Den frusna graven. The
wilderness zones are generated procedurally every time you enter them, using
hand-designed rules.

Every map has a **path** tying the entrance to the exit, and a **detour** leading
to the zone's own place — The Quarry, The Abandoned Camp or The Offering Ground.
There you find a chest, a shrine and an elite pack. The path is the zone's spine:
it gives direction without the map becoming a corridor, and the monster groups
sit *along* it so you meet them on the way.

**The borders cannot be clicked.** The path continues out of the picture to the
north, and where it leaves the map two standing stones flank it with the ground
behind them dissolved into driving snow. Go there *under your own power* and the
screen fades for a third of a second and you step into the next area — no portal,
no `E`, no window. The same to the south, and the same when you walk out through
the village gate in Frosthem. Requiring your own movement is deliberate: a shove
in the back mid-fight should not be able to throw you out of the map, and you
always land a little inside the threshold so the first step does not send you
back.

The name of the place fades in high on the screen when you arrive, and then stays
under the minimap for as long as you are there.

**Travel.** Every zone has a **waystone** you unlock by touching it; after that
you can jump between all the waystones you have found. The **town portal** (`T`)
takes you to Frosthem and back to exactly the same spot — it preserves the zone
you left, including monsters and loot on the ground, which is the whole point
when zones are otherwise regenerated on every visit.

The portal is not free: it charges for **2.5 seconds**, of which the last half
second is the gate opening and the figure stepping in. Moving breaks it, and **a
single hit breaks it**. Escape is therefore something you have to make room for,
not a button you press when everything is already burning.

**Two resources, not one.** Stamina and mana are kept apart and shown
separately: life as an orb on the left, mana as an orb on the right, and stamina
as its own golden bar in the centre of the view.

*Stamina* is the body. Every swing and every physical skill costs, and **in
combat you recover at only 40 %** of the normal rate — break contact and it
refills quickly. Every enemy felled gives 8 back. That turns the combat economy
into a trade-off: you can clear a pack if you land your blows, but missed swings
and tougher enemies force you to back off and breathe. Vitality carries it, and
heavy weapons cost more per swing.

*Mana* is the will, and only Frost skills draw on it. It does not care whether
you are fighting. If you build on steel and force, a little will is enough —
which is the whole point of splitting them.

**Fog of war.** The wilderness starts black on the map and is uncovered as you
walk. The minimap remembers terrain, paths and what you have found — but only
shows enemies that are near you right now. The village is known from the start.

**Perspective.** The camera angle is locked and orthographic, as in Diablo 2:
nothing shrinks with distance. The ground plane is squashed vertically (0.58) so
it tilts away from the viewer, while everything with height — figures, trees,
houses, blocks — rises out of the squashed ground in *unsquashed* pixels. That
difference is what makes a figure look like it is standing up rather than lying
flat.

The simulation is still pure 2D: collisions, distances and AI all work in the
world plane. Only the drawing and the mouse-to-world conversion know about the
projection, which meant the game rules never had to be touched.

**The figure.** The Barbarian is an old, one-eyed wanderer — fur collar across
the shoulders, a long robe to the ground, a walking staff in the free hand and a
raven on the shoulder that rocks at its own pace. She is drawn in paths, not in
images, and always stands upright like a D2 sprite: direction changes the
*image*, not the rotation. From the front you see the face with the eye patch and
the long beard; from behind, only the mass of hair falling over the collar.

**The cloak has physics.** The hem's deflection is a damped spring reaching in
the *opposite* direction to the movement, so the cloth always trails the body.
Stop and it falls back, swings once past rest and settles — underdamped on
purpose, because critically damped cloth looks stiff. The spring lives in the
game state and integrates with the same dt as everything else, and the velocity
is measured from the actual movement so it holds equally for walking, dashing and
rolling. The deflection is capped: a roll travels at nearly 1,000 px/s and would
otherwise throw the hem far outside the figure.

Four strikes alternate so two blows in a row never look alike: **slash**,
**backhand**, a heavier **overhead** and a **thrust** with a lunge. The basic
attack alternates the first two and slips in a heavy strike every fourth blow;
skills have their own. The trail is drawn from the same curve as the blade — so
the band follows exactly the path the weapon took, with a dark core and a bright
leading edge, because a pure white sweep vanishes against the snow.

The monsters stand up on the same terms: wolves on four legs seen from the side,
raiders with bows, wraiths floating without a shadow, and the boss with his ice
crown.

`sprite-lab.html` draws the figure in all eight directions, the cloak deflection
step by step, and every strike frame by frame.

**Combat.** Swings with an arc and reach, instant hit detection (responsiveness
before wind-up), knockback, critical hits, bleeding, freezing, stuns and life
steal. The packs are many and small — a group of snow wolves is a dozen
individuals, not four blobs. The enemies have five archetypes with different AI:
chargers, melee, ranged and heavy creatures. They are deliberately aggressive —
it drives the pace.

**The boss.** Jarl Hravn **sleeps when you enter the arena** — he stands among
his guards with no health bar, only turning his head towards you, and does not
strike back. You have to find him and begin the fight yourself. The first hit
wakes him and everything within 460 pixels at once, with a screen flash, a shake
and a nova out from his body. Auto-attack ignores dormant targets, so you can
walk up and look without accidentally starting the fight. After that he runs his
own AI with four **telegraphed** attacks: *Frost Sweep* (an arc in front),
*Ice Crush* (a marked circle where you stand — walk away), *Rime Lance* (a marked
line, then a charge) and *Calls Wraiths* at 66 % and 33 % life. Every attack
draws its hit area on the ground while it charges.

**Elite packs.** Champions and elite monsters with random modifiers — *Swift,
Brutal, Frostbound, Armoured, Bloodthirsty, Warded* — combined freely. That gives
unpredictable difficulty spikes without anyone designing them by hand.

**The bag.** The grid is 12 × 6, and items take space according to their own
shape rather than their equipment slot: a long sword is 1 × 3 and a great sword
1 × 4, while a battle axe is 2 × 3 and a war hammer 2 × 4. Swap a weapon for one
you already carry and the old one lands in the gap the new one left, so the bag
is not reshuffled on every swap.

**Experience as orbs.** XP is no longer credited straight away — it falls as orbs
on the ground where the enemy stood, and you only get it once you walk close
enough to sweep them up. That turns reach into a trade-off: strike from afar or
kite a pack around and you have to walk back and collect the haul. The
denominations are visible in colour and size — white small and large, then
yellow, blue and purple — so you can see from the ground what is worth fetching.
A heavy haul is split into several orbs, and once the field fills up new ones are
merged into nearby orbs instead of scattering more gravel.

**Loot.** Items drop rarely — barely one per twenty ordinary enemies felled — and
white junk items almost always fall away entirely. Gold comes in fewer but
heavier piles. Everything you find is picked up automatically as you walk over
it, but something *you* drop stays put until you have walked away, so it is
possible to put a weapon down in the wilderness.

**Progression.** Levels from 1 upward, four attribute points and one skill point
per level. Three real **skill trees** (Steel, Frost, Endurance) — one per tab —
with five skills each in three tiers: two entries, two middle steps that each
require a point in their parent, and a capstone requiring both middle steps.
Tier 2 opens at level 6, tier 3 at level 12. Plus synergies where skills
strengthen each other.

**Levelling up.** The game pauses and shows a wide window with the attributes as
four cards on the left and the **whole skill tree** on the right — nothing hides
behind a button. Every card states outright what one click gives. The points go
into a pending pile: you can take them back with minus and try again, and only
*Confirm* writes them to the character. Attributes and skills are confirmed
**separately**, because they are different decisions. You do not have to spend
them at all; `Esc` takes you straight back into the fight and the points stay.

The game opens no windows when you start — you stand in Frosthem immediately,
with a notice in the corner instead of a modal to dismiss.

**Several characters.** The main menu lists your characters with level, enemies
felled, gold and when you last played — one click and you are in. *Create a new
character* opens the class list (the Barbarian is built; the Hunter and the
Frostcaller are listed as coming). Everything is saved in the browser's
`localStorage`, automatically on level-up, zone change and when you leave the
tab, or manually with `F5`.

Every new character gets a short five-step walkthrough. The question mark in the
top right (or `F1`) brings it back at any time. The start screen offers
*Continue* when a save exists. You always return to Frosthem, since the village
is the only place that is not regenerated.

**Other.** Shrines with timed buffs, treasure chests, a minimap showing paths and
waystones, comparing tooltips, an equipment doll in the shape of a body as in D2,
particles, blood marks, screen shake and drifting snow.

**The snow in the main menu.** 380 flakes, each with its own depth, size and fall
speed. Small flakes are caught harder by the wind than large ones, every flake
has its own sway and a slow pulsing of its speed (±38 %), and the gusts come from
three sine waves with different periods. The smallest are drawn as dots, the
largest as rotating six-armed stars with a soft halo.

## Architecture

```
index.html          canvas + DOM overlay for the HUD and panels
styles.css          the whole UI (panels, orbs, tooltips) in CSS
src/
  core/             rng (seeded), math, input
  data/             items.js (base types + affix tables), monsters.js, skills.js
  entities/         player.js, monster.js — plain data structures
  systems/          world (generation + paths), spawn, ai, boss, combat,
                    loot, stats, inventory, save
  render/           camera, renderer (all canvas drawing), fx (particles/numbers)
  ui/               hud, panels, tooltip — DOM, not canvas
  game.js           game state + update loop
  main.js           bootstrap, canvas setup, rAF loop
```

A couple of deliberate choices:

- **DOM for UI, canvas for the world.** Inventories, tooltips and panels are a
  hundred times simpler in HTML/CSS than hand-drawn in canvas.
- **Data separated from systems.** Every balance number lives in `src/data/`.
  Changing a weapon or a monster requires touching no logic at all.
- **Typed ES modules.** The code is JSDoc-typed with `checkJs` in
  `jsconfig.json`, which gives full type checking in the editor without a build
  step. Node was not available on the machine — the files are structured exactly
  like a TS project, so migrating to real `.ts` files is mechanical the day you
  install Node.

## Known trade-offs

- **Zones are regenerated.** That is deliberate (replay value), but it is also
  why the town portal has to preserve the zone and why the save always puts you
  back in the village.
- **The boss stands outside the separation force.** The usual logic preventing
  monsters from stacking could push the boss away from the player forever — which
  is why it never got to attack. It now has its own loop, and the ordinary
  separation is capped as well.
- **Walls block line of sight, but only the big ones.** Blocks, cliffs and
  buildings stop swings, area damage and arrows; trees and posts do not. The line
  is drawn at radius 22 — letting small things block felt arbitrary in a fight.
- **The detour's wall always has a gate**, facing where the side path actually
  arrives (not towards the junction — the path bends). Verified with a flood fill
  across 80 generated zones: chest, exits, waystone and shrines are always
  reachable from the entrance.

## Balance status

The opening is verified with a simple bot: a level-1 character with starting gear
beats every ordinary group in Bleka hedarna and loses 20–50 % of its life on the
way. The boss takes about a minute with reasonable gear. The middle segment
(Vargpasset, levels 5–9) is the least tested part.

Death is deliberately soft: you wake in Frosthem and keep everything. The penalty
is easy to sharpen in `updatePlayer` in `src/game.js` once the balance settles.

## Next steps

A reasonable order, with the highest value per hour first:

1. **Sound.** The biggest thing missing. Hits, death sounds and a wind loop do
   more for the feel than any graphical upgrade — especially now that stamina has
   a rhythm that would benefit from being heard.
2. **Telegraphed specials for ordinary elite monsters.** The boss has them now;
   the same device on the elite packs would lift the whole middle segment.
3. **Sockets and runes**, giving loot a second layer to dig into.
4. **More classes.** The Hunter and the Frostcaller are sketched; the systems are
   built to receive them.
5. **Difficulty tiers** (Nightmare, Hell) with resistance penalties — D2's
   cheapest way to make all the content relevant again.
