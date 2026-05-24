from pathlib import Path
import math, random, struct, zlib

OUT = Path('public/gif')
OUT.mkdir(parents=True, exist_ok=True)


def rgba(hexv, a=255):
    return ((hexv >> 16) & 255, (hexv >> 8) & 255, hexv & 255, a)

class Img:
    def __init__(self, w, h, bg=(0,0,0,0)):
        self.w, self.h = w, h
        self.p = bytearray(bg * (w*h))
    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y*self.w + x)*4
            a = c[3]
            if a == 255:
                self.p[i:i+4] = bytes(c)
            elif a:
                inv = 255 - a
                r0,g0,b0,a0 = self.p[i:i+4]
                self.p[i] = (c[0]*a + r0*inv)//255
                self.p[i+1] = (c[1]*a + g0*inv)//255
                self.p[i+2] = (c[2]*a + b0*inv)//255
                self.p[i+3] = min(255, a + a0)
    def rect(self, x, y, w, h, c):
        for yy in range(max(0,y), min(self.h,y+h)):
            for xx in range(max(0,x), min(self.w,x+w)):
                self.set(xx, yy, c)
    def outline_rect(self, x,y,w,h,c,t=1):
        self.rect(x,y,w,t,c); self.rect(x,y+h-t,w,t,c); self.rect(x,y,t,h,c); self.rect(x+w-t,y,t,h,c)
    def ellipse(self, cx, cy, rx, ry, c):
        x0,x1=max(0,int(cx-rx)),min(self.w-1,int(cx+rx))
        y0,y1=max(0,int(cy-ry)),min(self.h-1,int(cy+ry))
        for y in range(y0,y1+1):
            dy=((y-cy)/ry)**2
            for x in range(x0,x1+1):
                if ((x-cx)/rx)**2 + dy <= 1:
                    self.set(x,y,c)
    def line(self, x1,y1,x2,y2,c,t=1):
        steps=max(abs(x2-x1),abs(y2-y1),1)
        for i in range(steps+1):
            x=round(x1+(x2-x1)*i/steps); y=round(y1+(y2-y1)*i/steps)
            self.rect(x-t//2,y-t//2,t,t,c)
    def poly(self, pts, c):
        miny=max(0,min(y for _,y in pts)); maxy=min(self.h-1,max(y for _,y in pts))
        for y in range(miny,maxy+1):
            xs=[]
            for (x1,y1),(x2,y2) in zip(pts, pts[1:]+pts[:1]):
                if y1 == y2: continue
                if (y >= min(y1,y2)) and (y < max(y1,y2)):
                    xs.append(x1 + (y-y1)*(x2-x1)/(y2-y1))
            xs.sort()
            for a,b in zip(xs[0::2], xs[1::2]):
                self.rect(math.floor(a), y, math.ceil(b-a), 1, c)
    def save(self, path):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)
            raw.extend(self.p[y*self.w*4:(y+1)*self.w*4])
        def chunk(tag, data):
            return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data)&0xffffffff)
        data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', self.w,self.h,8,6,0,0,0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
        Path(path).write_bytes(data)

# --- full-map composition: calmer ground, authored clearings, paths, boundaries ---
W,H=2400,1600
m=Img(W,H,rgba(0x244b35))
random.seed(7)
# low-noise grass mottling
for y in range(0,H,16):
    for x in range(0,W,16):
        col=random.choice([0x28523a,0x234932,0x2b573d,0x254d36])
        m.rect(x,y,16,16,rgba(col))
# forest masses and edges
for cx,cy,rx,ry in [(360,390,360,260),(860,850,210,130),(210,1450,260,125),(2260,1390,170,135),(530,1040,185,120)]:
    m.ellipse(cx,cy,rx,ry,rgba(0x1b3929))
    m.ellipse(cx,cy,rx-28,ry-22,rgba(0x20442f))
# area clearings
clearings=[(1988,324,410,250,0x315742),(1450,1305,270,210,0x5f4b2d),(1980,1315,360,260,0x635036),(1320,925,260,185,0x3d355d),(1015,340,300,190,0x32455f),(485,1410,285,170,0x493258),(2200,785,250,160,0x5d4a31),(1470,405,215,145,0x315457),(910,850,210,140,0x2b513b)]
for cx,cy,rx,ry,col in clearings:
    m.ellipse(cx,cy,rx,ry,rgba(col))
    m.ellipse(cx,cy,rx-24,ry-18,rgba(col+0x020202 if col < 0xfdfdfd else col))
# wide dirt paths
paths=[[(1950,1330),(1780,1300),(1600,1315),(1450,1300),(1310,1280),(1120,1070),(1010,900),(910,770),(760,570),(610,390)],
[(1010,900),(1260,770),(1460,610),(1695,525),(1945,540)],[(1695,525),(1660,420),(1660,250),(1735,180)],
[(1320,1290),(950,1350),(650,1450),(455,1415)],[(760,570),(910,365),(1080,300),(1240,360)],[(1780,1300),(1900,1060),(2070,860),(2195,710)],[(1450,1300),(1620,1230),(1840,1235)]]
for pts in paths:
    for (x1,y1),(x2,y2) in zip(pts,pts[1:]):
        # Broad dirt trails, not boardwalk planks. The Phaser tile stamps add texture later.
        m.line(x1,y1,x2,y2,rgba(0x4f412c),86)
        m.line(x1,y1,x2,y2,rgba(0x76613e),64)
        m.line(x1,y1,x2,y2,rgba(0x9a8054),38)
# decorative borders, rocks/flowers clustered, not confetti
for x,y in [(90,120),(230,650),(610,680),(1030,1110),(1220,1160),(1670,1430),(2320,1510),(2380,660),(45,970)]:
    m.ellipse(x,y,36,20,rgba(0x183323))
for x,y in [(1740,560),(1835,575),(2240,525),(2260,210),(1660,500),(2040,610)]:
    m.ellipse(x,y,18,11,rgba(0x6e7368))
# pond shadow beneath overlay
m.ellipse(1988,324,390,218,rgba(0x193b3e))
m.save(OUT/'map-ground.png')

# --- authored pond base ---
p=Img(760,430,(0,0,0,0))
p.ellipse(380,205,360,185,rgba(0x4e7042,255))
p.ellipse(380,205,330,160,rgba(0x6f8a54,255))
p.ellipse(380,188,300,132,rgba(0x3d8bb1,255))
p.ellipse(380,188,255,105,rgba(0x2f6e9e,255))
p.ellipse(380,188,172,66,rgba(0x245988,255))
# banks and shallows
for cx,cy,rx,ry in [(130,260,80,30),(610,250,92,34),(410,315,130,38),(245,88,95,26)]: p.ellipse(cx,cy,rx,ry,rgba(0x89a468))
# dock cutout/approach shadow
p.rect(318,292,124,58,rgba(0x72533a,255)); p.rect(328,292,104,46,rgba(0xa1784f,255))
for x in range(332,430,18): p.line(x,294,x,334,rgba(0x5b3e2e),3)
p.line(328,294,432,294,rgba(0x5b3e2e),3); p.line(328,334,432,334,rgba(0x5b3e2e),3)
# ripples
for cx,cy,rx,ry in [(305,145,44,10),(465,188,58,12),(395,235,38,8),(540,126,36,8),(230,210,32,7)]:
    p.line(cx-rx,cy,cx+rx,cy,rgba(0xb8e3e7,145),2)
# reeds / rocks
for x,y in [(92,205),(112,217),(642,198),(660,214),(595,80),(160,90),(680,280),(198,306)]:
    p.line(x,y,x-6,y-30,rgba(0x365b28),4); p.line(x+8,y,x+12,y-28,rgba(0x4c762e),4)
for x,y in [(156,283),(602,300),(210,80),(655,128),(100,142)]: p.ellipse(x,y,22,13,rgba(0x6e7368))
p.save(OUT/'pond-base.png')

# --- semantically correct set-piece sprites ---
def campus():
    im=Img(144,96,(0,0,0,0)); im.ellipse(72,84,66,10,rgba(0,80)); im.rect(20,30,104,50,rgba(0x8aa2bf)); im.rect(12,48,120,32,rgba(0x6f86a5)); im.poly([(12,48),(72,12),(132,48)],rgba(0x425574)); im.rect(66,52,12,28,rgba(0x2d3348));
    for x in [32,50,90,108]: im.rect(x,56,10,10,rgba(0xf5df9c)); im.rect(x,68,10,8,rgba(0x2f405a))
    im.rect(54,40,36,7,rgba(0xd6c899)); im.rect(62,26,20,14,rgba(0xb7c9d9)); return im
campus().save(OUT/'university.png')

def dj():
    im=Img(112,72,(0,0,0,0)); im.ellipse(56,62,54,8,rgba(0,80)); im.rect(16,34,80,24,rgba(0x2a2238)); im.outline_rect(16,34,80,24,rgba(0xff80c9),2); im.rect(24,28,64,8,rgba(0x4b385f));
    for x in [34,78]: im.ellipse(x,46,14,10,rgba(0x11151f)); im.ellipse(x,46,6,4,rgba(0x8ce8ff))
    im.line(30,20,12,4,rgba(0xff77d4),4); im.line(82,20,104,4,rgba(0x78d8ff),4); im.rect(52,18,8,16,rgba(0xffe7a8)); return im
dj().save(OUT/'dj-booth.png')

def skyline():
    im=Img(160,90,(0,0,0,0)); im.ellipse(80,80,74,9,rgba(0,70));
    buildings=[(8,44,20,34,0xc2945a),(34,30,18,48,0xd9b16e),(58,16,14,62,0xe2c27c),(80,36,26,42,0xb7c9d9),(112,24,18,54,0x8fb2cf),(136,42,16,36,0xd6a35f)]
    for x,y,w,h,c in buildings: im.rect(x,y,w,h,rgba(c)); im.outline_rect(x,y,w,h,rgba(0x4b3a32),1)
    im.line(65,16,65,4,rgba(0xe2c27c),3); im.rect(0,78,160,5,rgba(0x6e8ca8)); im.rect(82,68,70,8,rgba(0xffffff,190)); return im
skyline().save(OUT/'skyline.png')

def kitchen():
    im=Img(96,72,(0,0,0,0)); im.ellipse(48,62,44,8,rgba(0,70)); im.rect(12,18,72,40,rgba(0x9b6f4c)); im.rect(18,24,24,22,rgba(0xf4d9a7)); im.rect(50,23,24,24,rgba(0x2d3348)); im.rect(54,27,16,12,rgba(0x95d9e8)); im.rect(22,48,50,8,rgba(0x6b4432)); im.rect(40,11,28,10,rgba(0xffe7a8)); im.rect(68,42,8,8,rgba(0xff91ce)); return im
kitchen().save(OUT/'kitchen.png')

def garden():
    im=Img(96,56,(0,0,0,0)); im.rect(8,12,80,34,rgba(0x6d4a2d)); im.outline_rect(8,12,80,34,rgba(0xb58a5a),3);
    for x in [22,40,58,76]:
      im.line(x,14,x,44,rgba(0x4a2f22),2); im.ellipse(x,26,7,5,rgba(0xff91ce)); im.ellipse(x,36,6,5,rgba(0xffe58a))
    return im
garden().save(OUT/'garden-bed.png')

def shrine():
    im=Img(80,92,(0,0,0,0)); im.ellipse(40,84,36,7,rgba(0,75)); im.rect(16,66,48,12,rgba(0x80684c)); im.rect(24,32,32,36,rgba(0x7d6aae)); im.poly([(16,34),(40,12),(64,34)],rgba(0xb37de8)); im.rect(36,46,8,20,rgba(0xffe7a8)); im.rect(10,70,60,5,rgba(0xffc6e9)); im.rect(20,78,40,5,rgba(0x56406f)); return im
shrine().save(OUT/'shrine.png')

def sign():
    im=Img(72,58,(0,0,0,0)); im.ellipse(36,52,30,5,rgba(0,80)); im.rect(32,30,8,20,rgba(0x65442f)); im.rect(8,10,56,24,rgba(0x8b5f3e)); im.outline_rect(8,10,56,24,rgba(0xffe7a8),2); im.rect(15,17,42,3,rgba(0xffe7a8)); im.rect(20,25,32,3,rgba(0xffe7a8)); return im
sign().save(OUT/'sign.png')

def bench():
    im=Img(64,36,(0,0,0,0)); im.ellipse(32,31,28,4,rgba(0,80));
    for y in [10,18]: im.rect(8,y,48,5,rgba(0x8b5f3e)); im.outline_rect(8,y,48,5,rgba(0x4a2f22),1)
    im.rect(14,22,5,9,rgba(0x4a2f22)); im.rect(45,22,5,9,rgba(0x4a2f22)); return im
bench().save(OUT/'bench.png')

def pond_detail():
    im=Img(72,52,(0,0,0,0)); im.ellipse(25,38,22,10,rgba(0x6e7368));
    for x in [42,50,58]: im.line(x,42,x-5,12,rgba(0x365b28),4); im.line(x+4,42,x+8,16,rgba(0x4c762e),3)
    im.ellipse(26,34,14,6,rgba(0x8b9184)); return im
pond_detail().save(OUT/'pond-detail.png')

print('wrote visual polish assets')
