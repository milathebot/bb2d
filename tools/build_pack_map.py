from pathlib import Path
from PIL import Image, ImageDraw
import random

ROOT = Path('email_assets/extracted/Gif/Super_Retro_Collection/Resources')
OUT = Path('public/gif')
OUT.mkdir(parents=True, exist_ok=True)
TILE_ROOT = ROOT / 'Environments/TilePalette/Autotiles/root/single'


def crop_tile(rel: str, frame: int = 0) -> Image.Image:
    im = Image.open(TILE_ROOT / rel).convert('RGBA')
    return im.crop((0, frame * 16, 16, frame * 16 + 16))


def sprite(rel: str) -> Image.Image:
    return Image.open(ROOT / rel).convert('RGBA')

T = {
    'grass': crop_tile('ground_autotile_0.png'),
    'grass2': crop_tile('overworld_autotile_12.png'),
    'dark': crop_tile('overworld_autotile_23.png'),
    'forest': crop_tile('ground_autotile_17.png'),
    'dirt': crop_tile('ground_autotile_16.png'),
    'sand': crop_tile('ground_autotile_8.png'),
    'water': crop_tile('ground_autotile_24 1.png'),
    'water_edge': crop_tile('ground_autotile_25.png'),
    'stone': crop_tile('ground_autotile_10.png'),
    'wood': crop_tile('house_autotile_3_0.png'),
    'garden': crop_tile('overworld_autotile_40.png'),
    'flower': crop_tile('overworld_autotile_29.png'),
}

W, H, TS = 2400, 1600, 16
random.seed(19)

def dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    c1 = vx * wx + vy * wy
    if c1 <= 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    c2 = vx * vx + vy * vy
    if c2 <= c1:
        return ((px - bx) ** 2 + (py - by) ** 2) ** 0.5
    b = c1 / c2
    qx, qy = ax + b * vx, ay + b * vy
    return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5

def near_polyline(x, y, pts, width):
    return any(dist_to_segment(x, y, *a, *b) <= width for a, b in zip(pts, pts[1:]))

def in_ellipse(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

paths = [
    [(1940,1330),(1770,1300),(1600,1315),(1450,1300),(1310,1280),(1130,1090),(1010,900),(910,770),(760,570),(610,390)],
    [(1010,900),(1260,770),(1460,610),(1695,525),(1945,540)],
    [(1695,525),(1660,420),(1660,250),(1735,180),(1985,180)],
    [(1320,1290),(950,1350),(650,1450),(455,1415)],
    [(760,570),(910,365),(1080,300),(1240,360),(1470,405)],
    [(1780,1300),(1900,1060),(2070,860),(2195,710)],
    [(1450,1300),(1620,1230),(1840,1235),(1980,1320)],
]
clearings = [
    ('pond', 1988, 324, 430, 265), ('garden',1450,1305,295,215), ('home',1980,1315,390,275),
    ('shrine',1320,925,290,195), ('uni',1015,340,320,205), ('rave',485,1410,300,175),
    ('sky',2200,785,260,165), ('kitchen',1470,405,230,155), ('cat',910,850,230,150),
]
forest_masses = [(360,390,405,285),(850,850,245,150),(210,1450,300,145),(2260,1390,190,155),(520,1040,205,130)]
water = (1988, 315, 335, 178)
img = Image.new('RGBA', (W,H))

for y in range(0,H,TS):
    for x in range(0,W,TS):
        cx, cy = x + 8, y + 8
        tile = T['grass']
        for fx,fy,frx,fry in forest_masses:
            if in_ellipse(cx,cy,fx,fy,frx,fry):
                tile = T['grass']
        for name,ex,ey,erx,ery in clearings:
            if in_ellipse(cx,cy,ex,ey,erx,ery):
                if name == 'garden': tile = T['sand']
                elif name == 'home': tile = T['sand']
                elif name == 'pond': tile = T['grass']
                elif name == 'rave': tile = T['sand']
                elif name == 'sky': tile = T['sand']
                elif name == 'uni': tile = T['sand']
                else: tile = T['sand']
        if any(near_polyline(cx,cy,p,44) for p in paths):
            tile = T['dirt'] if random.random() > .04 else T['sand']
        if in_ellipse(cx,cy,*water):
            tile = T['water'] if random.random() > .06 else T['water_edge']
        img.alpha_composite(tile, (x,y))

# Add sparse tile accents from the pack, clustered on edges instead of confetti.
accent_points = [(110,120),(250,650),(620,675),(1040,1110),(1220,1160),(1670,1430),(2320,1510),(2380,660),(50,970),
                 (760,1040),(570,250),(720,460),(870,720),(1020,970),(1510,1130),(2300,1190)]
for i,(x,y) in enumerate(accent_points):
    tile = T['flower'] if i % 2 == 0 else T['garden']
    for dx,dy in [(0,0),(16,0),(0,16),(-16,0)][:1 + (i % 2)]:
        if 0 <= x+dx < W and 0 <= y+dy < H:
            img.alpha_composite(tile, (x+dx, y+dy))

img.save(OUT/'map-ground.png')

# Tile-painted pond overlay. Transparent outside; all visible terrain comes from the pack tiles.
pond = Image.new('RGBA', (760,430), (0,0,0,0))
mask_bank = Image.new('L', (760,430), 0)
d = ImageDraw.Draw(mask_bank)
d.ellipse((20,35,740,390), fill=255)
mask_water = Image.new('L', (760,430), 0)
dw = ImageDraw.Draw(mask_water)
dw.ellipse((72,70,690,335), fill=255)
dw.ellipse((162,116,598,282), fill=255)
for y in range(0,430,16):
    for x in range(0,760,16):
        cx,cy=x+8,y+8
        if mask_bank.getpixel((min(cx,759),min(cy,429))) > 0:
            pond.alpha_composite(T['grass'] if random.random() > .15 else T['sand'], (x,y))
        if mask_water.getpixel((min(cx,759),min(cy,429))) > 0:
            pond.alpha_composite(T['water'] if random.random() > .08 else T['water_edge'], (x,y))
# dock pixels from pack wood tile
for y in range(292,350,16):
    for x in range(318,442,16):
        pond.alpha_composite(T['wood'], (x,y))
# pack rocks/reeds accents
rock = sprite('Prefabs/Rocks/Sprites/rock_25.png')
plant = sprite('Prefabs/Potted plants/Sprites/potted_plant_02.png')
for x,y in [(138,280),(600,298),(210,78),(652,126),(94,140)]: pond.alpha_composite(rock, (x-rock.width//2, y-rock.height//2))
for x,y in [(96,205),(642,198),(596,82),(166,92),(680,276)]: pond.alpha_composite(plant, (x-plant.width//2, y-plant.height//2))
pond.putalpha(Image.composite(pond.getchannel('A'), Image.new('L', pond.size, 0), mask_bank))
pond.save(OUT/'pond-base.png')

# Re-copy pack tiles used directly by Phaser so source and shipped art stay honest.
T['grass'].save(OUT/'tile-grass.png')
T['dirt'].save(OUT/'tile-dirt.png')
T['water'].save(OUT/'tile-water.png')
T['forest'].save(OUT/'tile-forest.png')
T['wood'].save(OUT/'tile-wood.png')
print('wrote pack-painted map-ground.png and pond-base.png')
