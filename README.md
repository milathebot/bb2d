# Bb2D

A cozy browser RPG gift: farming, fishing, gathering, decorating, cats, match-3 memories, and a romantic ending.

Live: https://milathebot.github.io/bb2d/

## Visuals

Bb2D now uses a custom lightweight pixel-art asset pack in `public/assets/`:

- grass/forest/dirt/water/wood tiles
- trees, herbs, crops, pond dock, house, shrine, memory signs
- player, B, Pengu, Mila
- cozy home rug/decor pieces

All assets are local/custom SVGs, so the game stays fast and has no external asset dependency.

## Goal

Prepare the home and then talk to B:

- Gather 6 wood
- Gather 4 herbs
- Catch 3 fish
- Grow 3 blooms
- Collect 5 hearts
- Place 6 decorations
- Remember 4 memories

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
