# Bb2D Production Plan

## Blunt diagnosis

The current MVP is playable, but it is not gift-ready. The biggest problem is not mechanics, it is presentation discipline:

- asset frames are guessed instead of mapped
- characters are coming from environmental tiles, which is how we got the door-character crime scene
- pets are not scaled or animated consistently
- the world is hand-painted with loose tile stamps, not a real map layer
- interactions work, but they do not feel tactile yet
- the game lacks animation states, scene transitions, ambience, and a clean narrative arc

The fix is a proper production pass, not another patch over the patch.

## Target quality

A small but coherent cozy RPG:

- camera-follow top-down world
- consistent pixel-art style
- real animated player + spouse/NPC sprites
- pets that follow at sane size and speed
- tilemap-based world with readable zones
- farming/fishing/gathering/decorating loops with animations and feedback
- match-3 shrine polished enough to feel intentional
- personal story delivered through quests, memory cards, and ending scene
- playable in 10-15 minutes without confusion

## Asset direction

### Primary pack selected

Use **Superpowers Ninja Adventure Asset Pack**.

- Creator: Pixel-boy
- Source: https://github.com/sparklinlabs/superpowers-asset-packs/tree/master/ninja-adventure
- License: CC0 1.0 Universal
- Local files copied into: `public/ninja/`

Why this over the current Kenney Tiny Town setup:

- has real animated top-down character sheets
- includes NPCs, dog/pet sprite, food/items, HUD, FX, sounds, music
- coherent visual style across characters/items/UI
- CC0 license, clean for publishing
- no guessing environmental tiles as characters

### Secondary pack status

Keep Kenney only as fallback/reference until replaced. Do not mix Kenney and Ninja casually in the final presentation because mixed pixel scales/styles look amateur.

### Optional future pack

Sprout Lands is more cozy/farming-specific, but the official itch download flow is less automation-friendly. Use it only if we manually download the official basic pack and verify license text. Do not use random GitHub mirrors that contain copyrighted Stardew assets.

## Implementation phases

### Phase 1: Asset discipline and animation foundation

- Remove all guessed `tiny-town` frame IDs for player/NPCs/items.
- Load explicit files:
  - `ninja/characters/player.png`
  - `ninja/characters/b.png`
  - `ninja/pets/pet-dog.png`
  - `ninja/tiles/tileset.png`
  - `ninja/items/*.png`
  - `ninja/hud/dialogue-bubble.png`
- Create Phaser animations:
  - player idle/down/up/left/right
  - player walk/down/up/left/right
  - B idle animation
  - pet walk/follow animation
- Replace player container with an actual `Phaser.GameObjects.Sprite` or container wrapping a sprite only for label/shadow.
- Add direction tracking so interaction and animation face the correct way.

### Phase 2: Real map layer

- Stop stamping random tiles directly in code.
- Create a simple map definition:
  - base terrain grid
  - path layer
  - water layer
  - object layer
  - interaction rectangles
- Keep it TypeScript-native for now, unless importing Tiled JSON is faster.
- Add collision/soft blockers for water, cliffs, house walls, trees.
- Keep camera follow and world bounds.

### Phase 3: Cozy mechanics polish

- Farming:
  - seed, water, grow, harvest states
  - crop sprites for each state
  - short animation/particle on harvest
- Fishing:
  - cast line animation or bobber
  - 1-second timing interaction
  - fish item popup
- Gathering:
  - axe/chop or shake animation
  - respawn timer with visual state
- Decorating:
  - choose from unlocked decor instead of random stars
  - place rugs/plants/lamps/furniture visibly inside home

### Phase 4: Narrative and UX polish

- Add a quest journal panel instead of cramped HUD text.
- Add proper dialogue box using Ninja HUD asset.
- Add short dialogues with B at milestones:
  - start
  - first memory
  - pets unlocked
  - home half decorated
  - ending ready
- Add map signposts and clearer zone transitions.
- Add pause/help screen.

### Phase 5: Audio and juice

- Add quiet looping music from the pack if license/size is acceptable.
- Add UI click, harvest, fish, memory, and completion sounds.
- Add screen fade on intro/ending.
- Add particle effects: leaves, sparkles, pond ripples.

### Phase 6: QA and deployment

- Build: `npm run build`
- Preview and check app/assets return 200.
- Run a manual completion-route test:
  - move in all directions
  - gather wood/herbs
  - grow/harvest crops
  - fish
  - solve shrine once
  - unlock pets
  - decorate home
  - collect memories
  - trigger ending
- Push to GitHub.
- Wait for Pages workflow success.
- Verify live URL and latest JS bundle.

## Acceptance bar before showing her

Do not show until all are true:

- player is not a tile/object masquerading as a person
- player has visible walking animation in all four directions
- B is visually distinct and correctly scaled
- pets are small, cute, and follow without covering the player
- every interactive object visually matches its mechanic
- there is no obvious placeholder art
- world feels intentionally laid out, not scattered
- ending is reachable without instructions from you standing over her shoulder

## Current completed step

Downloaded/copied the Ninja Adventure CC0 production asset foundation into `public/ninja/` with license and credits.
