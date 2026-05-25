from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path('email_assets/extracted/Gif/Super_Retro_Collection/Resources')
OUT = Path('public/gif')
OUT.mkdir(parents=True, exist_ok=True)
SINGLE = ROOT / 'Environments/TilePalette/Autotiles/root/single'
ATLAS = ROOT / 'Environments/TilePalette/Autotiles/root/atlas'

W, H, TS = 2400, 1600, 16


def crop_single(rel: str, frame: int = 0) -> Image.Image:
    im = Image.open(SINGLE / rel).convert('RGBA')
    return im.crop((0, frame * 16, 16, frame * 16 + 16))


def atlas(rel: str) -> Image.Image:
    return Image.open(ATLAS / rel).convert('RGBA')


def sprite(rel: str) -> Image.Image:
    return Image.open(ROOT / rel).convert('RGBA')

T = {
    # Clean fill tiles. These are deliberately low-noise so the map reads like a place, not confetti.
    'grass': crop_single('ground_autotile_0.png'),
    'grass2': crop_single('ground_autotile_17.png'),
    'dirt': crop_single('ground_autotile_16.png'),
    'sand': crop_single('ground_autotile_8.png'),
    'soil': crop_single('overworld_autotile_40.png'),
    'flower': crop_single('overworld_autotile_29.png'),
    'water': crop_single('ground_autotile_24 1.png'),
    'water_edge': crop_single('ground_autotile_25.png'),
    'stone': crop_single('ground_autotile_10.png'),
    'wood': crop_single('house_autotile_3_0.png'),
    'deck': crop_single('house_autotile_0_0.png'),
    'brick': crop_single('house_autotile_10_1.png'),
    'leaf': crop_single('ground_autotile_21.png'),
}

# Full autotile maps from the pack. Used as authored chunks at boundaries/pads so this is not just flat fills.
A = {
    'grass_edge': atlas('ground_autotile_17.png'),
    'path_edge': atlas('ground_autotile_1.png'),
    'water_edge': atlas('ground_autotile_25.png'),
    'stone_edge': atlas('ground_autotile_10.png'),
    'deck': atlas('house_autotile_0_0.png'),
    'wood_wall': atlas('house_autotile_3_0.png'),
}


def ellipse_mask(cx, cy, rx, ry):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((cx-rx, cy-ry, cx+rx, cy+ry), fill=255)
    return m


def rect_mask(x, y, w, h, r=0):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    if r:
        d.rounded_rectangle((x, y, x+w, y+h), radius=r, fill=255)
    else:
        d.rectangle((x, y, x+w, y+h), fill=255)
    return m


def line_mask(points, width):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    d.line(points, fill=255, width=width, joint='curve')
    for x, y in points:
        d.ellipse((x-width//2, y-width//2, x+width//2, y+width//2), fill=255)
    return m


def paste_tile_mask(img, mask, tile):
    for y in range(0, H, TS):
        for x in range(0, W, TS):
            if mask.getpixel((min(x+8, W-1), min(y+8, H-1))) > 0:
                img.alpha_composite(tile, (x, y))


def paste_pattern_mask(img, mask, tile_a, tile_b=None, period=7):
    tile_b = tile_b or tile_a
    for y in range(0, H, TS):
        for x in range(0, W, TS):
            if mask.getpixel((min(x+8, W-1), min(y+8, H-1))) > 0:
                tile = tile_b if ((x//TS + y//TS) % period == 0) else tile_a
                img.alpha_composite(tile, (x, y))


def paste_atlas_chunk(img, x, y, rel, crop=(0, 0, 64, 64), scale=1):
    chunk = A[rel].crop(crop)
    if scale != 1:
        chunk = chunk.resize((chunk.width * scale, chunk.height * scale), Image.Resampling.NEAREST)
    img.alpha_composite(chunk, (int(x), int(y)))


def paste_tile_rect(img, x, y, w, h, tile):
    for yy in range(y, y+h, TS):
        for xx in range(x, x+w, TS):
            img.alpha_composite(tile, (xx, yy))


def border_rect(img, x, y, w, h, tile):
    paste_tile_rect(img, x, y, w, TS, tile)
    paste_tile_rect(img, x, y+h-TS, w, TS, tile)
    paste_tile_rect(img, x, y, TS, h, tile)
    paste_tile_rect(img, x+w-TS, y, TS, h, tile)


def draw_poly_water(size=(760, 430)):
    pw, ph = size
    pond = Image.new('RGBA', size, (0, 0, 0, 0))
    bank = Image.new('L', size, 0)
    water = Image.new('L', size, 0)
    d = ImageDraw.Draw(bank)
    dw = ImageDraw.Draw(water)
    # Irregular but readable lake silhouette, not a noisy oval tile patch.
    bank_poly = [(55,205),(88,112),(175,58),(303,42),(425,57),(557,42),(682,112),(720,225),(662,330),(532,377),(392,365),(272,395),(142,344)]
    water_poly = [(105,206),(132,128),(220,88),(335,78),(428,96),(545,82),(641,140),(675,218),(626,298),(510,333),(388,321),(280,352),(165,301)]
    d.polygon(bank_poly, fill=255)
    dw.polygon(water_poly, fill=255)
    # rounded joins
    for x,y,r in [(155,130,58),(600,160,62),(240,310,64),(500,300,66),(370,196,150)]:
        dw.ellipse((x-r,y-r,x+r,y+r), fill=255)
    for x,y,r in [(120,120,78),(650,185,82),(190,335,88),(545,330,90),(382,212,210)]:
        d.ellipse((x-r,y-r,x+r,y+r), fill=255)
    # shore ring first
    for y in range(0, ph, TS):
        for x in range(0, pw, TS):
            px, py = min(x+8, pw-1), min(y+8, ph-1)
            if bank.getpixel((px,py)):
                pond.alpha_composite(T['grass2'], (x,y))
            if water.getpixel((px,py)):
                pond.alpha_composite(T['water'], (x,y))
    # shoreline highlights from actual water-edge tile.
    for x, y in [(112,112),(176,78),(600,98),(652,198),(572,306),(216,324),(104,236),(354,78),(454,330)]:
        for dx in (0, 16):
            pond.alpha_composite(T['water_edge'], (x+dx, y))
    # wooden dock and approach, built from house/deck tiles.
    for y in range(300, 364, TS):
        for x in range(320, 448, TS):
            pond.alpha_composite(T['wood'], (x,y))
    for y in range(348, 396, TS):
        for x in range(352, 416, TS):
            pond.alpha_composite(T['wood'], (x,y))
    # pack rocks/plants as bank accents.
    rock = sprite('Prefabs/Rocks/Sprites/rock_25.png')
    plant = sprite('Prefabs/Potted plants/Sprites/potted_plant_02.png')
    for x,y in [(128,282),(624,288),(220,94),(638,130),(100,166),(520,352)]:
        pond.alpha_composite(rock, (x-rock.width//2, y-rock.height//2))
    for x,y in [(92,218),(662,216),(590,86),(165,110),(690,270),(284,365)]:
        pond.alpha_composite(plant, (x-plant.width//2, y-plant.height//2))
    # transparent outside bank
    pond.putalpha(Image.composite(pond.getchannel('A'), Image.new('L', pond.size, 0), bank))
    return pond

# Base grass world.
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for y in range(0, H, TS):
    for x in range(0, W, TS):
        img.alpha_composite(T['grass'], (x, y))

# Forest masses are real darker grass/leaf tiles around edges, with clear central travel lanes.
for mask in [ellipse_mask(330, 385, 370, 250), ellipse_mask(865, 850, 255, 175), ellipse_mask(255, 1420, 330, 155), ellipse_mask(2250, 1390, 240, 170), ellipse_mask(510, 1040, 240, 150)]:
    paste_tile_mask(img, mask, T['grass2'])

# Area clearings and pads. Kept small and purposeful instead of giant orange carpets.
clearings = [
    ellipse_mask(1005, 340, 260, 165),       # university
    ellipse_mask(1470, 405, 205, 135),       # kitchen
    ellipse_mask(910, 850, 205, 135),        # cats
    ellipse_mask(1320, 925, 245, 165),       # shrine
    ellipse_mask(2200, 785, 220, 150),       # skyline
    ellipse_mask(485, 1410, 255, 150),       # rave
    ellipse_mask(1980, 1315, 335, 235),      # home
    ellipse_mask(1450, 1305, 260, 185),      # garden
]
for m in clearings:
    paste_pattern_mask(img, m, T['grass'], T['sand'], period=23)

# Paths as broad dirt roads with grass edging. This gives Runescape/Stardew readability.
paths = [
    [(1940,1330),(1770,1300),(1600,1315),(1450,1300),(1310,1280),(1130,1090),(1010,900),(910,770),(760,570),(610,390)],
    [(1010,900),(1260,770),(1460,610),(1695,525),(1945,540)],
    [(1695,525),(1660,420),(1660,250),(1735,180),(1985,180)],
    [(1320,1290),(950,1350),(650,1450),(455,1415)],
    [(760,570),(910,365),(1080,300),(1240,360),(1470,405)],
    [(1780,1300),(1900,1060),(2070,860),(2195,710)],
    [(1450,1300),(1620,1230),(1840,1235),(1980,1320)],
]
for p in paths:
    paste_tile_mask(img, line_mask(p, 78), T['sand'])
for p in paths:
    paste_pattern_mask(img, line_mask(p, 54), T['dirt'], T['sand'], period=17)

# Professional-looking pond clearing and lake overlay are baked into map-ground too.
pond_world = draw_poly_water()
img.alpha_composite(pond_world, (1608, 108))

# Home/base deck pad.
paste_tile_rect(img, 1816, 1180, 304, 224, T['wood'])
border_rect(img, 1800, 1164, 336, 256, T['deck'])

# Garden: proper fenced/rowed field immediately next to home.
garden_x, garden_y, garden_w, garden_h = 1248, 1182, 360, 276
paste_tile_rect(img, garden_x, garden_y, garden_w, garden_h, T['grass2'])
border_rect(img, garden_x, garden_y, garden_w, garden_h, T['wood'])
# neat soil beds with walk lanes
for row_y in [1230, 1296, 1362]:
    for col_x in [1320, 1398, 1476, 1554]:
        paste_tile_rect(img, col_x-30, row_y-22, 60, 44, T['soil'])
        border_rect(img, col_x-32, row_y-24, 64, 48, T['dirt'])
# gate/path lane
paste_tile_rect(img, 1400, garden_y+garden_h-16, 96, 16, T['dirt'])
paste_tile_rect(img, 1400, garden_y+garden_h-64, 96, 64, T['dirt'])
# flower corners
for x,y in [(1272,1206),(1584,1206),(1272,1434),(1584,1434)]:
    paste_tile_rect(img, x, y, 32, 32, T['flower'])

# Rave/stone/shrine pads use tile assets rather than flat colored boxes.
paste_tile_rect(img, 380, 1360, 208, 112, T['stone'])
border_rect(img, 364, 1344, 240, 144, T['brick'])
paste_tile_rect(img, 1210, 835, 224, 160, T['stone'])
border_rect(img, 1194, 819, 256, 192, T['brick'])

# University/city pads.
paste_tile_rect(img, 896, 274, 240, 128, T['stone'])
border_rect(img, 880, 258, 272, 160, T['brick'])
paste_tile_rect(img, 2112, 720, 192, 112, T['stone'])
border_rect(img, 2096, 704, 224, 144, T['brick'])

# Sparse natural accents in clusters, not confetti.
for cluster in [
    [(108,585),(132,602),(154,574)], [(610,246),(634,262)], [(730,700),(752,718),(776,704)],
    [(1040,1028),(1065,1044)], [(1665,1450),(1690,1470)], [(2280,1195),(2304,1212)],
    [(1520,1110),(1544,1128),(1568,1112)], [(1850,575),(1872,590)]
]:
    for x,y in cluster:
        paste_tile_rect(img, x, y, 16, 16, T['flower'])

img.save(OUT / 'map-ground.png')
draw_poly_water().save(OUT / 'pond-base.png')

# Direct Phaser debug/source tiles.
T['grass'].save(OUT/'tile-grass.png')
T['dirt'].save(OUT/'tile-dirt.png')
T['water'].save(OUT/'tile-water.png')
T['grass2'].save(OUT/'tile-forest.png')
T['wood'].save(OUT/'tile-wood.png')
print('wrote redesigned RPG tile map-ground.png and pond-base.png')
