# Bb2D

A cozy browser RPG gift: farming, fishing, gathering, decorating, pets, match-3 memories, camera-follow exploration, and a romantic ending.

Live: https://milathebot.github.io/bb2d/

## Current polish pass

- Larger explorable world instead of a single visible map
- Smooth camera follow with world bounds/deadzone
- Spread-out areas connected by paths
- More complete cozy loop: gather, fish, farm, decorate, memories, puzzle rewards, cat unlocks, ending
- Fixed HUD, area label, prompts, toast feedback, and memory cards

## Asset packs

Bb2D uses real free CC0 Kenney asset packs, stored locally in `public/kenney/`:

- Tiny Town by Kenney, CC0: https://kenney.nl/assets/tiny-town
- Animal Pack by Kenney, CC0: https://kenney.nl/assets/animal-pack

## Goal

Prepare the home and then talk to B:

- Gather 8 wood
- Gather 5 herbs
- Catch 4 fish
- Grow 4 blooms
- Collect 6 hearts
- Place 8 decorations
- Remember 5 memories

Memories give hearts. The match-3 shrine gives hearts and decor tokens.

## Controls

- Move: WASD / arrow keys
- Interact: E
- Fish: F near pond
- Puzzle: P near memory shrine
- Decorate: B inside home
- Close puzzle: ESC
- Restart: R

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
