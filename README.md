# Abyssal Garden: Rift Defense

**An underwater first-person shooter in your browser: hold a reef against aliens coming through rifts.**

Something on the seabed went wrong, and now rifts keep opening in the reef. You are the diver left to guard the
resonance core while wave after wave of aliens swims out of them (the bestiary owes a lot to the Half-Life games).
The mission ends when you die or the core is destroyed.

The map is the Abyssal Garden: towering kelp forests, sunbeams pouring through a rippling surface, a sunken ship,
manta rays gliding overhead. The world, the sound and the effects are made by code, and the whole game fits in **one
140 KB HTML file**. On its own that file plays with aliens and weapons that are sculpted by code as well.

With the [`assets`](assets) folder next to it (14 MB) the aliens become **3D scans of real sea animals** from the
Smithsonian's collections, wet, tinted and glowing from their creases, and the rifle a photo-textured model: a
horseshoe crab, a porcupinefish, a shore crab the size of a car and a sunflower sea star. All of them are public
domain; see [`assets/CREDITS.md`](assets/CREDITS.md).

(The screenshots below show the map; they were taken before the aliens arrived.)

![Kelp forest with a stone whale tail and a manta ray](.github/screenshots/whale-fluke.jpg)

## Try it

1. Download [`index.html`](index.html).
2. Open it in **Chrome** or **Edge** on a desktop computer.
3. Wait a few seconds while the world is built, then press **Dive in**. The first wave arrives a few seconds later.

For the scanned models, download the whole repository and serve the folder over HTTP (a browser does not let a page
opened from disk read the files next to it), for example with `npx serve` or `python3 -m http.server`, then open
`http://localhost:<port>/`. Hosted on GitHub Pages it works as it is.

Nothing to install, and it works offline. It needs a browser with **WebGPU**. If you see *"This scene needs WebGPU"*, update your browser or switch to Chrome / Edge.

## What's down there

- **Kelp forests** that sway in the current and sparkle with tiny gold and green specks
- **Light rays** streaming down from a wavy surface, with shimmering caustics on the sea floor
- **A sunken wooden ship**, a **giant stone whale tail**, rock arches, canyons and floating boulders
- **Manta rays**, schools of fish, rising bubbles and drifting particles
- **A purple grotto** with glowing magenta ground cover, coral and barrel sponges
- **A soundscape** made up as you listen: a deep rumble, distant whale calls, soft chimes and bubbles

| | |
|---|---|
| ![Shipwreck](.github/screenshots/shipwreck.jpg) | ![Looking up through the kelp](.github/screenshots/kelp-forest.jpg) |
| ![Barrel sponges](.github/screenshots/sponge-garden.jpg) | ![Light rays over the kelp basin](.github/screenshots/light-rays.jpg) |

![The purple grotto](.github/screenshots/purple-grotto.jpg)

## The mission

The **resonance core** stands on the seabed where you start, under the stone whale tail; its beam reaches up to the
surface, so you can always find your way back. Aliens arrive in waves through green rifts that open around it.
Between waves you get ten seconds, some repairs to the core and a supply drop next to it.

| Alien | What it does |
|---|---|
| **Leaper** | Small and quick, comes in packs. Swims up in pulses, then lunges and bites. *Scan: horseshoe crab.* |
| **Spitter** | Keeps its distance and lobs globs of acid that sink as they fly. From wave 2. *Scan: porcupinefish.* |
| **Stalker** | The big one. Circles you, then charges: fast, but it turns slowly, so swim aside. From wave 3. *Scan: shore crab, 2.6 m across.* |
| **Caster** | Hovers above the core and throws pairs of slow homing orbs at it. Turns on you if you come close. From wave 4. *Scan: sunflower sea star, pulsing like a jellyfish.* |

Some aliens go for you, some for the core; one that you shoot may change its mind. An alien that gets stuck in the
rock slips through a rift and comes out near its target.

| Weapon | |
|---|---|
| **Rifle** | Automatic. Its darts lose force in water: full damage up to 14 m, less beyond. Scatters when fired from the hip. With the assets it is a salvaged, cloth-wrapped carbine with a scope. |
| **Harpoon gun** | One heavy bolt at a time. It takes a moment to arrive, sinks a little, and goes through whatever it hits. |
| **Arc lance** | A beam through everything in line. Few shots. |

Dead aliens sometimes leave something behind; swim close to collect it: red is health, blue is suit power (the suit
takes 60% of each hit while it lasts), amber is darts, white is harpoons, violet is lance cells.

## Controls

| | Keyboard & mouse |
|---|---|
| Look around | Move the mouse |
| Swim | `W` `A` `S` `D` |
| Up / down | `Space` / `C` (or `E` / `Q`) |
| Thruster (swim faster) | Hold `Shift` |
| Fire | Left mouse button |
| Aim (zooms in, steadies the rifle, slows you down) | Right mouse button |
| Reload | `R` (an empty weapon reloads by itself) |
| Change weapon | `1` `2` `3` or the mouse wheel |
| Redeploy after the mission ends | Click, or `Enter` |
| Menu (pauses the game) | `Esc` |
| Sound on / off | `M` (sound starts when you dive in) |
| Performance stats | `H` |
| Detail level | **Low**, **Medium** or **High** in the menu (reloads the page) |

The seabed, cliffs and arches are solid for you, for the aliens and for every shot. Kelp, plants, corals, sponges,
loose rocks, the floating boulders, the ship and the whale tail you can swim (and shoot) through.

**On a touchscreen:** the left thumb is a movement stick, the right thumb looks around, and the weapon fires by
itself when an alien is in your sights. Two buttons on the right change weapon and reload; the `≡` button in the
corner opens the menu. A keyboard attached to the phone works as well. Phones always show the scene in landscape and
start on Low or Medium detail. (Touch support is experimental.)

## Detail levels

The **Low**, **Medium** and **High** buttons in the menu pick the detail level; the current one is lit. Each level is the same world, built with less in it:

| Level | What it is | Picked on a first visit for |
|---|---|---|
| **High** | The full scene | Computers |
| **Medium** | Half of the leaves, sparkles and pebbles; small rocks, sponges and corals cast no shadows | Phones with 8 GB of memory |
| **Low** | A quarter of the leaves, no anti-aliasing, coarser rocks and corals, simpler lighting, 480p to start with | Other phones, and computers with 4 GB of memory or less |

If loading crashes the tab, or the graphics driver gives up, the page starts again one level lower. Your browser remembers the level, and the resolution and draw distance the scene settled on, for the next visit.

## How it works

- The seabed is sculpted on your graphics card every time the page opens, then decorated with about two million kelp leaves and plants, tens of thousands of rocks, and thousands of sponges, corals and fish.
- Everything is drawn with **WebGPU** directly. No game engine or 3D library is used.
- The ship, whale tail, mantas, fish and corals are built from simple mathematical shapes.
- The aliens, the weapons and the diver's gloved hands are sculpted the same way as the whale tail: each is a formula for a solid shape (blended ellipsoids, capsules and boxes) that is turned into a mesh while the page loads. Shadowing in the creases, worn edges on the metal, teeth, eyes and soft undersides are worked out from the same formula and stored in the mesh, so skin looks wet and gunmetal looks used without a single texture file.
- The sound is synthesized live with the Web Audio API, the gunfire and the aliens included.
- The aliens find their way with the same distance field that keeps you out of the rock: they slide along walls, climb over what is in their way and check their line of fire before they shoot.
- It's built to run smoothly: about 180 fps at 2560×1440 on an RTX 5070 Ti. On slower hardware it aims for 60 fps by lowering first the resolution and then how far away plants and rocks are drawn, in small steps. The scene is already running, blurred, behind the start menu, so most of that tuning is done before you dive in. A low-end phone (Samsung Galaxy A16) reaches about 20 fps at 670×372 on Low.

## Make it your own

The readable source code is in the [`source`](source) folder. To change something and rebuild `index.html` you need [Node.js](https://nodejs.org) 18 or newer:

```bash
cd source
npm install
npm run build
```

This writes a new `index.html` next to this README. `npm run build:readable` writes an unminified version instead, which is easier to debug in the browser's developer tools.

`npm run build:dev` writes a separate `dev.html` with two extra tools that are not part of `index.html`: `F` flies the camera along a one-minute path through the whole world, and `B` runs that flight as a benchmark and reports frame and GPU times. For testing the game, `K` puts one alien of each kind in front of you, `T` holds the trigger, `G` makes you and the core invulnerable and `V` hides the game's models (to see what they cost); a shader that fails to compile is reported on screen.

| File | What's inside |
|---|---|
| [`source/src/world.js`](source/src/world.js) | The world layout: rock walls, arches, tunnels, kelp forests, sponge gardens, fish schools, mantas, the ship and the whale tail. **A good place to start.** |
| [`source/src/shaders.js`](source/src/shaders.js) | The look: water and fog colors, lighting, kelp, rocks, the water surface, light rays, alien skin and weapon effects (WGSL shader code) |
| [`source/src/game.js`](source/src/game.js) | The game: aliens and how they behave, weapons, waves, pickups, effects and the HUD |
| [`source/src/models.js`](source/src/models.js) | The sculpted shapes of the aliens, the weapons with the diver's hands, and the resonance core |
| [`source/assets.mjs`](source/assets.mjs) | `npm run assets`: downloads the scans and the rifle from their sources and converts them into the [`assets`](assets) folder (which scan plays which alien, its size and which way it faces are set at the top) |
| [`source/src/main.js`](source/src/main.js) | The renderer, the camera, the controls, and the viewpoints and camera path the world is laid out around |
| [`source/src/audio.js`](source/src/audio.js) | The soundscape and the sound effects |
| [`source/src/quality.js`](source/src/quality.js) | The detail levels: which one a device starts on, and what is remembered between visits |
| [`source/src/math.js`](source/src/math.js) | Noise, random numbers and mesh-building helpers |
| [`source/src/dev.js`](source/src/dev.js) | Development tools (fly-through, benchmark, game tests), only in `dev.html` |
| [`source/template.html`](source/template.html) | The page around the scene: loading bar, start menu, links and their styles |

Some easy first tweaks:

- **Water color:** `WCOL` (blue-green water) and `PCOL` (purple grotto) near the top of the shared scene code in `shaders.js`
- **Sunlight color:** `SUNC` right next to them
- **Brightness and light rays:** `EXPO` and `RAYS` in `main.js`
- **Swimming speed:** search for `ks ? 9 : 5` in `main.js` (thruster speed : normal speed)
- **Alien toughness, speed and score:** the `T_HP`, `T_SPD` and `T_PTS` tables near the top of the state in `game.js`
- **Who arrives in which wave:** `nextWave` in `game.js`

## License

[MIT](LICENSE): free to use, change and share, including in your own projects.
