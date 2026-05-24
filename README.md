# Bb2D

A small cozy browser RPG gift: exploration, farming, fishing, gathering, decorating, pets, match-3 memories, and a romantic ending.

Live: https://milathebot.github.io/bb2d/

## Visual direction

The game now uses a single cohesive local SVG pixel-art pack under `public/cozy/` instead of mixing unrelated asset packs. The pack covers:

- player and B character sprites
- Pengu and Mila cat sprites
- trees, herbs, crop growth stages
- house, shrine, signs, memory cards, decor, fish
- a unified warm palette for the whole world

This replaced the previous mixed Kenney/Ninja/animal-pack pass, which looked inconsistent.

## Controls

- Move: WASD or arrow keys
- Interact: E
- Fish: F at the pond
- Puzzle: P at the shrine
- Decorate: B at home
- Restart: R

## Development

```bash
npm install
npm run dev
npm run build
```

GitHub Pages deploys from `main` via `.github/workflows/pages.yml`.
