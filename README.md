# Bb2D

A small cozy browser RPG gift: exploration, farming, fishing, gathering, decorating, pets, match-3 memories, and a romantic ending.

Live: https://milathebot.github.io/bb2d/

## Visual direction

The game uses a bespoke local SVG pixel-art pack under `public/cozy/` so the visuals stay consistent instead of mixing unrelated packs.

Current polish pass:

- B / the wife is now the player character.
- Noot is the NPC at home for the ending.
- Each memory area has bespoke set dressing:
  - University building
  - Rave/DJ booth with lights
  - Dubai/Canada skyline
  - Kitchen date scene
- Main gameplay areas have richer visual anchors:
  - Moon Forest tree cluster
  - Quiet Pond with reeds/bench/dock
  - Garden bed with planted rows
  - Home Base house/furniture/lights
  - Memory Shrine lanterns
- Unified palette and local SVG assets for player, NPC, cats, crops, fish, decor, signs, and interactables.

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
