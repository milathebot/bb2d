from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path('email_assets/extracted/Gif/Super_Retro_Collection/Resources')
OUT = Path('public/gif')
OUT.mkdir(parents=True, exist_ok=True)
SINGLE = ROOT / 'Environments/TilePalette/Autotiles/root/single'
ATLAS = ROOT / 'Environments/TilePalette/Autotiles/root/atlas'
SOURCES = []


def note(out, src):
    SOURCES.append((out, src))


def copy(src_rel: str, name: str):
    Image.open(ROOT / src_rel).convert('RGBA').save(OUT / name)
    note(name, src_rel)


def crop(src_rel: str, box: tuple[int, int, int, int], name: str):
    Image.open(ROOT / src_rel).convert('RGBA').crop(box).save(OUT / name)
    note(name, f'{src_rel} crop {box}')


def crop_single(rel: str, frame: int = 0) -> Image.Image:
    im = Image.open(SINGLE / rel).convert('RGBA')
    return im.crop((0, frame * 16, 16, frame * 16 + 16))


def tile_from_image(rel: str, box=(0, 0, 16, 16)) -> Image.Image:
    return Image.open(ROOT / rel).convert('RGBA').crop(box)


def save_tile(img: Image.Image, name: str, src: str):
    img.save(OUT / name)
    note(name, src)

# Pack-native sprites only. No custom SVG-derived or hand-pixel object art.
copy('Hero/hero/color_4/idle/hero_idle_DOWN.png', 'player.png')
copy('Hero/hero/color_1/idle/hero_idle_DOWN.png', 'noot.png')
for direction in ['DOWN', 'UP', 'LEFT', 'RIGHT']:
    copy(f'Hero/hero/color_4/walk/hero_walk_{direction}.png', f'player-walk-{direction.lower()}.png')
    copy(f'Hero/hero/color_4/breath_idle/hero_breath_idle_{direction}.png', f'player-idle-{direction.lower()}.png')
    copy(f'Hero/hero/color_1/walk/hero_walk_{direction}.png', f'noot-walk-{direction.lower()}.png')
    copy(f'Hero/hero/color_1/breath_idle/hero_breath_idle_{direction}.png', f'noot-idle-{direction.lower()}.png')
copy('Characters/Animals/cat1_16x20.png', 'cat-pengu-sheet.png')
copy('Characters/Animals/cat3_16x20.png', 'cat-mila-sheet.png')
crop('Characters/Animals/cat1_16x20.png', (16, 0, 32, 20), 'cat-pengu.png')
crop('Characters/Animals/cat3_16x20.png', (16, 0, 32, 20), 'cat-mila.png')
copy('Prefabs/Trees/Sprites/tree_02.png', 'tree.png')
copy('Prefabs/Trees/Sprites/tree_11.png', 'tree2.png')
copy('Prefabs/Houses/Sprites/house_25.png', 'house.png')
copy('Prefabs/Houses/Sprites/house_20.png', 'university.png')
copy('Prefabs/Houses/Sprites/house_26.png', 'home-detail.png')
copy('Prefabs/Lamps/Sprites/lamp_04.png', 'lamp.png')
copy('Prefabs/Potted plants/Sprites/potted_plant_02.png', 'herb.png')
copy('Prefabs/Potted plants/Sprites/potted_plant_05.png', 'decor.png')
copy('Prefabs/Potted plants/Sprites/potted_plant_07.png', 'heart-decor.png')
copy('Prefabs/Potted plants/Sprites/potted_plant_08.png', 'garden-bed.png')
copy('Prefabs/Crates/Sprites/crate_08.png', 'bench.png')
copy('Prefabs/Statues/Sprites/statue_01.png', 'shrine.png')
copy('Prefabs/Barrels/Sprites/barrel_01.png', 'sign.png')
copy('Prefabs/Books/Sprites/book_06.png', 'memory.png')
copy('Prefabs/Fires/Sprites/fire_camp_02.png', 'dj-booth.png')
copy('Prefabs/Barrels/Sprites/barrel_02.png', 'kitchen.png')
copy('Prefabs/Rocks/Sprites/rock_25.png', 'pond-detail.png')
copy('Prefabs/Columns/Sprites/column_04.png', 'skyline.png')
copy('Prefabs/Trees/Sprites/tree_31.png', 'forest-detail.png')
copy('Prefabs/Fires/Sprites/Fire_01.png', 'rave-light-pink.png')
copy('Prefabs/Fires/Sprites/Fire_02.png', 'rave-light-blue.png')
copy('Animations/Water/waterfall_effect_01_16x32.png', 'memory-sparkle.png')
copy('Prefabs/Books/Sprites/book_07.png', 'ending-frame.png')
# No fish sprite exists in the pack. Use a pack-native water animation frame as fishing feedback rather than a wrong/custom fish.
crop('Animations/Water/water_02_16x16.png', (0, 0, 16, 16), 'fish.png')

# Farming/crops from pack strips.
for i, name in enumerate(['crop0.png', 'crop1.png', 'crop2.png', 'crop3.png']):
    crop('Prefabs/Crops/Sprites/crop_01.png', (i * 18, 0, (i + 1) * 18, 28), name)
for i, name in enumerate(['farm-crop0.png', 'farm-crop1.png', 'farm-crop2.png', 'farm-crop3.png', 'farm-crop4.png', 'farm-crop5.png']):
    crop('Animations/Farm/farm_plant_01_18x32.png', (i * 18, 0, (i + 1) * 18, 32), name)
# Dark plot sprites from tilemap/autotile, not handmade.
soil = crop_single('overworld_autotile_40.png')
soil_dark = crop_single('ground_autotile_13.png')
for name, tile in [('farm-soil0.png', soil), ('farm-soil1.png', soil_dark)]:
    im = Image.new('RGBA', (48, 32), (0, 0, 0, 0))
    for y in range(0, 32, 16):
        for x in range(0, 48, 16): im.alpha_composite(tile, (x, y))
    im.save(OUT / name)
    note(name, 'tilemap soil composed from pack autotiles')
crop('Characters/Farm/farm_hoe_01_32x32.png', (32, 32, 64, 64), 'farm-tool.png')

# Water assets from the normal water animations, not frozen/ice autotile.
copy('Animations/Water/water_03_48x48.png', 'water-sheet.png')
copy('Animations/Water/water_01_16x16.png', 'water-ripple.png')
copy('Animations/Water/waterfall_16x16.png', 'waterfall.png')

T = {
    'grass_a': crop_single('ground_autotile_0.png'),
    'grass_b': crop_single('ground_autotile_0.png'),
    'grass_c': crop_single('ground_autotile_17.png'),
    'forest': crop_single('ground_autotile_21.png'),
    'leaf': crop_single('overworld_autotile_29.png'),
    'path_a': crop_single('ground_autotile_16.png'),
    'path_b': crop_single('ground_autotile_8.png'),
    'soil': crop_single('overworld_autotile_40.png'),
    'soil_dark': crop_single('ground_autotile_13.png'),
    'stone': crop_single('ground_autotile_10.png'),
    'wood': crop_single('house_autotile_3_0.png'),
    'deck': crop_single('house_autotile_0_0.png'),
    'water_a': tile_from_image('Animations/Water/water_01_16x16.png', (0, 0, 16, 16)),
    'water_b': tile_from_image('Animations/Water/water_02_16x16.png', (0, 0, 16, 16)),
    'water_c': tile_from_image('Animations/Water/water_03_48x48.png', (0, 0, 16, 16)),
    'shore': crop_single('ground_autotile_25.png'),
}
for name, key in [('tile-grass.png','grass_a'),('tile-dirt.png','path_a'),('tile-water.png','water_a'),('tile-forest.png','forest'),('tile-wood.png','wood')]:
    save_tile(T[key], name, f'pack tile {key}')
for name, key in [('terrain-grass.png','grass_b'),('terrain-grass-detail.png','leaf'),('terrain-dirt.png','path_a'),('terrain-dirt-round.png','path_b'),('terrain-path.png','path_a')]:
    save_tile(T[key], name, f'pack tile {key}')

W, H, TS = 2400, 1600, 16


def blank(size=(W,H)): return Image.new('RGBA', size, (0, 0, 0, 0))

def draw_mask(size, fn):
    m = Image.new('L', size, 0); d = ImageDraw.Draw(m); fn(d); return m

def ellipse(size, cx, cy, rx, ry):
    return draw_mask(size, lambda d: d.ellipse((cx-rx, cy-ry, cx+rx, cy+ry), fill=255))

def polygon(size, pts):
    return draw_mask(size, lambda d: d.polygon(pts, fill=255))

def line(size, pts, width):
    def f(d):
        d.line(pts, fill=255, width=width, joint='curve')
        for x,y in pts: d.ellipse((x-width//2, y-width//2, x+width//2, y+width//2), fill=255)
    return draw_mask(size, f)

def mask_union(size, masks):
    out=Image.new('L', size, 0)
    for m in masks: out=Image.composite(Image.new('L', size, 255), out, m)
    return out

def tile_mask(img, mask, variants):
    for y in range(0, img.height, TS):
        for x in range(0, img.width, TS):
            if mask.getpixel((min(x+8,img.width-1), min(y+8,img.height-1))):
                idx = ((x//TS)*17 + (y//TS)*31 + ((x//96) ^ (y//80))*7) % len(variants)
                img.alpha_composite(variants[idx], (x,y))

def tile_rect(img, x, y, w, h, variants):
    m = draw_mask(img.size, lambda d: d.rectangle((x,y,x+w,y+h), fill=255))
    tile_mask(img, m, variants)

def border_rect(img, x, y, w, h, tile):
    tile_rect(img, x, y, w, TS, [tile]); tile_rect(img, x, y+h-TS, w, TS, [tile])
    tile_rect(img, x, y, TS, h, [tile]); tile_rect(img, x+w-TS, y, TS, h, [tile])

# Hand-authored tilemap background. Variation is patch-based, not random noisy scatter.
img = Image.new('RGBA', (W,H), (0,0,0,0))
base = Image.new('L', (W,H), 255)
tile_mask(img, base, [T['grass_a']])

# Organic grass/forest patches.
for m, vars in [
    (polygon((W,H), [(40,120),(270,60),(610,110),(725,350),(605,620),(250,665),(72,540)]), [T['grass_c'], T['grass_a'], T['grass_a']]),
    (polygon((W,H), [(690,690),(900,650),(1115,735),(1080,935),(905,1010),(720,930)]), [T['grass_a']]),
    (polygon((W,H), [(60,1280),(330,1245),(670,1340),(700,1515),(360,1585),(70,1530)]), [T['grass_c'], T['grass_a']]),
    (polygon((W,H), [(2070,1220),(2370,1195),(2400,1590),(2130,1570),(1960,1430)]), [T['grass_a']]),
    (ellipse((W,H), 520, 1040, 245, 145), [T['grass_a']]),
    (ellipse((W,H), 1550, 1060, 210, 120), [T['grass_a']]),
]: tile_mask(img, m, vars)

# Clearings from subtler variants, no giant flat rectangles.
for m in [ellipse((W,H),1005,340,265,165), ellipse((W,H),1470,405,205,135), ellipse((W,H),910,850,205,135), ellipse((W,H),1320,925,245,165), ellipse((W,H),2200,785,220,150), ellipse((W,H),485,1410,255,150), ellipse((W,H),1980,1315,335,235), ellipse((W,H),1450,1305,260,185)]:
    tile_mask(img, m, [T['grass_a'], T['path_b'], T['grass_a']])

paths = [
    [(1940,1330),(1770,1300),(1600,1315),(1450,1300),(1310,1280),(1130,1090),(1010,900),(910,770),(760,570),(610,390)],
    [(1010,900),(1260,770),(1460,610),(1695,525),(1945,540)],
    [(1695,525),(1660,420),(1660,250),(1735,180),(1985,180)],
    [(1320,1290),(950,1350),(650,1450),(455,1415)],
    [(760,570),(910,365),(1080,300),(1240,360),(1470,405)],
    [(1780,1300),(1900,1060),(2070,860),(2195,710)],
    [(1450,1300),(1620,1230),(1840,1235),(1980,1320)],
]
for p in paths: tile_mask(img, line((W,H), p, 88), [T['path_b'], T['grass_b']])
for p in paths: tile_mask(img, line((W,H), p, 56), [T['path_a'], T['path_a'], T['path_b']])

# Lake, using normal water animation tiles. ground_autotile_24 is intentionally not used.
def build_pond(size=(760,430)):
    pw,ph=size; pond=blank(size)
    bank=polygon(size, [(55,205),(88,112),(175,58),(303,42),(425,57),(557,42),(682,112),(720,225),(662,330),(532,377),(392,365),(272,395),(142,344)])
    water=polygon(size, [(108,205),(140,128),(226,88),(335,76),(430,96),(545,82),(642,140),(676,218),(626,298),(510,333),(390,321),(280,352),(166,301)])
    tile_mask(pond, bank, [T['grass_c'], T['grass_b'], T['shore']])
    tile_mask(pond, water, [T['water_a'], T['water_b'], T['water_c']])
    # authored shore clusters
    for x,y in [(112,112),(176,78),(600,98),(652,198),(572,306),(216,324),(104,236),(354,78),(454,330)]: tile_rect(pond,x,y,32,16,[T['shore']])
    # dock from house/deck tiles, not custom drawing.
    tile_rect(pond, 320, 300, 128, 64, [T['wood'], T['deck']])
    tile_rect(pond, 352, 348, 64, 48, [T['wood']])
    # exact pack props around shoreline.
    for rel, pts in [
        ('Prefabs/Rocks/Sprites/rock_25.png', [(128,282),(624,288),(220,94),(638,130),(100,166),(520,352)]),
        ('Prefabs/Potted plants/Sprites/potted_plant_02.png', [(92,218),(662,216),(590,86),(165,110),(690,270),(284,365)]),
    ]:
        spr=Image.open(ROOT/rel).convert('RGBA')
        for x,y in pts: pond.alpha_composite(spr,(x-spr.width//2,y-spr.height//2))
    pond.putalpha(Image.composite(pond.getchannel('A'), Image.new('L', size, 0), bank))
    return pond
pond=build_pond(); img.alpha_composite(pond,(1608,108)); pond.save(OUT/'pond-base.png'); note('pond-base.png','composed only from pack water/shore/wood/rock/plant assets')

# Garden: dark plots from soil/path tiles, fenced with wood tilemap.
garden_x,garden_y,garden_w,garden_h=1248,1182,360,276
tile_rect(img,garden_x,garden_y,garden_w,garden_h,[T['grass_c'],T['grass_b']]); border_rect(img,garden_x,garden_y,garden_w,garden_h,T['wood'])
for row_y in [1230,1296,1362]:
    for col_x in [1320,1398,1476,1554]:
        tile_rect(img,col_x-32,row_y-24,64,48,[T['soil_dark']])
        border_rect(img,col_x-32,row_y-24,64,48,T['wood'])
tile_rect(img,1400,garden_y+garden_h-64,96,64,[T['path_a'],T['path_b']])
for x,y in [(1272,1206),(1584,1206),(1272,1434),(1584,1434)]: tile_rect(img,x,y,32,32,[T['leaf']])

# Built pads from stone/wood tilemap assets.
tile_rect(img,1816,1180,304,224,[T['wood'],T['deck']]); border_rect(img,1800,1164,336,256,T['deck'])
tile_rect(img,380,1360,208,112,[T['stone']]); border_rect(img,364,1344,240,144,T['path_a'])
tile_rect(img,1210,835,224,160,[T['stone']]); border_rect(img,1194,819,256,192,T['path_a'])
tile_rect(img,896,274,240,128,[T['stone'],T['path_b']]); border_rect(img,880,258,272,160,T['path_a'])
tile_rect(img,2112,720,192,112,[T['stone'],T['path_b']]); border_rect(img,2096,704,224,144,T['path_a'])

# Pack tile accents in authored clusters.
for cluster in [[(108,585),(132,602),(154,574)],[(610,246),(634,262)],[(730,700),(752,718),(776,704)],[(1040,1028),(1065,1044)],[(1665,1450),(1690,1470)],[(2280,1195),(2304,1212)],[(1520,1110),(1544,1128),(1568,1112)],[(1850,575),(1872,590)]]:
    for x,y in cluster: tile_rect(img,x,y,16,16,[T['leaf']])

img.save(OUT/'map-ground.png'); note('map-ground.png','hand-painted composition from pack tilemap/autotile assets only')

# Dock exported as a standalone tilemap-composed asset for Phaser overlay.
dock = Image.new('RGBA',(224,64),(0,0,0,0))
for y in range(0,64,16):
    for x in range(0,224,16): dock.alpha_composite(T['wood'] if (x//16+y//16)%3 else T['deck'], (x,y))
dock.save(OUT/'dock.png'); note('dock.png','composed from house_autotile wood/deck pack tiles')

(OUT/'ASSET_SOURCES.md').write_text('# Bb2D shipped asset sources\n\nAll runtime PNGs are copied, cropped, or composed from the user-provided Super_Retro_Collection asset pack. No SVG-generated gameplay/world assets are used in the shipped `public/gif` folder.\n\n' + '\n'.join(f'- `{name}`: {src}' for name,src in sorted(SOURCES)))
print('wrote pack-only assets, tilemap ground, normal-water pond, and source manifest')
