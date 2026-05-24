import Phaser from 'phaser'
import './style.css'

type ItemKind = 'tree' | 'herb' | 'pond' | 'crop' | 'memory' | 'house' | 'puzzle' | 'wife'

type WorldItem = {
  kind: ItemKind
  name: string
  zone: Phaser.Geom.Rectangle
  sprite?: Phaser.GameObjects.Image | Phaser.GameObjects.Container
  stage?: number
  cooldown?: number
  collected?: boolean
  message?: string
  marker?: Phaser.GameObjects.GameObject
}

type Inventory = {
  wood: number
  herbs: number
  fish: number
  blooms: number
  hearts: number
  decor: number
  memories: number
}

type SaveState = {
  inv: Inventory
  total: { wood: number, herbs: number, fish: number, blooms: number }
  decorPlaced: number
  collected: string[]
  cropStages: number[]
}

type Chapter = {
  n: number
  title: string
  objective: string
  hint: string
}

const SAVE_KEY = 'bb2d-save-v1'

const VIEW_W = 960
const VIEW_H = 640
const WORLD_W = 2400
const WORLD_H = 1600
const GOAL = { wood: 6, herbs: 4, fish: 3, blooms: 4, hearts: 7, decorPlaced: 6, memories: 6 }

class AudioKit {
  private ctx?: AudioContext
  private master?: GainNode
  private ambient?: { osc: OscillatorNode, gain: GainNode }[]
  private enabled = false

  start() {
    if (this.enabled) return
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    this.ctx = new AudioContextCtor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.13
    this.master.connect(this.ctx.destination)
    this.enabled = true
    this.startAmbient()
  }

  private startAmbient() {
    if (!this.ctx || !this.master || this.ambient) return
    this.ambient = [261.63, 329.63, 392.00].map((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = i === 1 ? 'triangle' : 'sine'
      osc.frequency.value = freq / 2
      gain.gain.value = 0.012
      osc.connect(gain)
      gain.connect(this.master!)
      osc.start()
      return { osc, gain }
    })
  }

  blip(kind: 'start' | 'gather' | 'fish' | 'memory' | 'decorate' | 'puzzle' | 'ending') {
    if (!this.ctx || !this.master) return
    const now = this.ctx.currentTime
    const seq: Record<typeof kind, number[]> = {
      start: [392, 523, 659],
      gather: [440, 554],
      fish: [330, 494, 660],
      memory: [523, 659, 784],
      decorate: [494, 622, 740],
      puzzle: [587, 784],
      ending: [392, 523, 659, 880],
    }
    seq[kind].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.07)
      gain.gain.linearRampToValueAtTime(kind === 'ending' ? 0.07 : 0.045, now + i * 0.07 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.22)
      osc.connect(gain)
      gain.connect(this.master!)
      osc.start(now + i * 0.07)
      osc.stop(now + i * 0.07 + 0.25)
    })
  }
}

class Bb2DScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Image
  private facing: 'down' | 'up' | 'left' | 'right' = 'down'
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private items: WorldItem[] = []
  private ui!: Phaser.GameObjects.Text
  private objective!: Phaser.GameObjects.Text
  private prompt!: Phaser.GameObjects.Text
  private areaLabel!: Phaser.GameObjects.Text
  private toast!: Phaser.GameObjects.Text
  private overlay?: Phaser.GameObjects.Container
  private inPuzzle = false
  private gameStarted = false
  private endingShown = false
  private inv: Inventory = { wood: 0, herbs: 0, fish: 0, blooms: 0, hearts: 0, decor: 0, memories: 0 }
  private total = { wood: 0, herbs: 0, fish: 0, blooms: 0 }
  private decorPlaced = 0
  private pengu?: Phaser.GameObjects.Container
  private mila?: Phaser.GameObjects.Container
  private fireflies: Phaser.GameObjects.Arc[] = []
  private blockers: Phaser.Geom.Rectangle[] = []
  private minimap?: Phaser.GameObjects.Graphics
  private moveTarget?: Phaser.Math.Vector2
  private lastChapter = -1
  private loadedFromSave = false
  private audio = new AudioKit()

  constructor() { super('bb2d') }

  preload() {
    ;[
      'player','noot','cat-pengu','cat-mila','tree','tree2','herb','crop0','crop1','crop2','crop3','house','shrine','sign','memory','decor','fish',
      'university','dj-booth','skyline','kitchen','pond-detail','garden-bed','forest-detail','home-detail','lamp','bench',
      'tile-grass','tile-forest','tile-dirt','tile-water','tile-wood','heart-decor','home-rug',
      'water-sheet','water-ripple','waterfall','farm-soil0','farm-soil1','farm-tool',
      'farm-crop0','farm-crop1','farm-crop2','farm-crop3','farm-crop4','farm-crop5',
      'terrain-grass','terrain-path','terrain-dirt','terrain-grass-detail','terrain-dirt-round',
      'dock','rave-light-pink','rave-light-blue','memory-sparkle','ending-frame'
    ].forEach(name => this.load.image(`cozy-${name}`, `gif/${name}.png`))
    this.load.image('cozy-map-ground', 'gif/map-ground.png')
  }

  create() {
    this.items = []
    this.fireflies = []
    this.blockers = []
    this.cameras.main.setBackgroundColor('#142820')
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    this.drawWorld()
    this.addInteractiveItems()
    this.addCharacters()
    this.loadState()
    this.addUI()
    this.bindControls()

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09)
    this.cameras.main.setDeadzone(120, 80)
    this.cameras.main.setRoundPixels(true)

    this.showIntro()
  }

  update(_: number, delta: number) {
    this.animateWorld(delta)
    if (!this.gameStarted || this.inPuzzle || this.endingShown) return

    const speed = 0.19 * delta
    let dx = 0
    let dy = 0
    if (this.cursors.left?.isDown || this.keys.A.isDown) dx -= speed
    if (this.cursors.right?.isDown || this.keys.D.isDown) dx += speed
    if (this.cursors.up?.isDown || this.keys.W.isDown) dy -= speed
    if (this.cursors.down?.isDown || this.keys.S.isDown) dy += speed
    if (dx || dy) this.moveTarget = undefined
    if (!dx && !dy && this.moveTarget) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.moveTarget.x, this.moveTarget.y)
      if (dist < 8) this.moveTarget = undefined
      else {
        dx = ((this.moveTarget.x - this.player.x) / dist) * speed
        dy = ((this.moveTarget.y - this.player.y) / dist) * speed
      }
    }
    if (dx && dy) { dx *= 0.707; dy *= 0.707 }

    if (dx || dy) {
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left'
      else this.facing = dy > 0 ? 'down' : 'up'
      this.playerSprite.setFlipX(this.facing === 'left')
      this.playerSprite.y = Math.sin(this.time.now / 95) * 2
    } else {
      this.playerSprite.y = 0
    }

    const nextX = Phaser.Math.Clamp(this.player.x + dx, 32, WORLD_W - 32)
    const nextY = Phaser.Math.Clamp(this.player.y + dy, 82, WORLD_H - 32)
    if (!this.isBlocked(nextX, this.player.y)) this.player.x = nextX
    if (!this.isBlocked(this.player.x, nextY)) this.player.y = nextY
    this.updatePrompt()
    this.updateAreaLabel()
    this.followCats(delta)
    this.updateMinimap()
  }


  private bindControls() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,F,P,B,R,H,ENTER,SPACE,ESC') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard!.on('keydown-ENTER', () => this.dismissOverlay())
    this.input.keyboard!.on('keydown-SPACE', () => this.dismissOverlay())
    this.input.keyboard!.on('keydown-E', () => this.interact())
    this.input.keyboard!.on('keydown-F', () => this.fish())
    this.input.keyboard!.on('keydown-P', () => this.openPuzzle())
    this.input.keyboard!.on('keydown-B', () => this.decorate())
    this.input.keyboard!.on('keydown-R', () => this.restartGame())
    this.input.keyboard!.on('keydown-H', () => this.showJournal())
    this.input.keyboard!.on('keydown-ESC', () => this.closePuzzle())
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.gameStarted || this.inPuzzle || this.endingShown) return
      if (pointer.y < 82 || pointer.y > VIEW_H - 80) return
      this.moveTarget = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY)
    })
  }

  private fixed<T extends Phaser.GameObjects.GameObject>(obj: T) {
    const fixedObj = obj as T & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth
    fixedObj.setScrollFactor(0)
    fixedObj.setDepth(80)
    return obj
  }

  private asset(name: string, x: number, y: number, scale = 1) {
    return this.add.image(x, y, `cozy-${name}`).setScale(scale)
  }


  private block(x: number, y: number, w: number, h: number) {
    this.blockers.push(new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h))
  }

  private blockingAsset(name: string, x: number, y: number, scale: number, blockW: number, blockH: number, blockYOffset = 0) {
    const img = this.asset(name, x, y, scale)
    this.block(x, y + blockYOffset, blockW, blockH)
    return img
  }

  private isBlocked(x: number, y: number) {
    const feet = new Phaser.Geom.Rectangle(x - 13, y + 3, 26, 18)
    return this.blockers.some(b => Phaser.Geom.Intersects.RectangleToRectangle(feet, b))
  }

  private sign(x: number, y: number, label: string) {
    const s = this.add.container(x, y).setDepth(4)
    s.add(this.add.image(0, 0, 'cozy-sign').setScale(1.15))
    this.block(x, y + 6, 48, 34)
    s.add(this.add.text(0, -6, label, { fontFamily: 'monospace', fontSize: '11px', color: '#fff3ba', align: 'center', stroke: '#2a1a1e', strokeThickness: 3 }).setOrigin(0.5))
    return s
  }

  private zone(_x: number, _y: number, _w: number, _h: number, _color: number, label: string, lx: number, ly: number) {
    this.sign(lx, ly, label)
  }

  private path(points: [number, number][]) {
    const stamp = (x: number, y: number) => {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        if (Math.abs(ox) + Math.abs(oy) > 2) continue
        this.add.image(Math.round(x / 32) * 32 + ox * 32, Math.round(y / 32) * 32 + oy * 32, 'cozy-terrain-path').setScale(2).setDepth(0)
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[i + 1]
      const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2)
      const steps = Math.max(1, Math.floor(dist / 18))
      for (let j = 0; j <= steps; j++) stamp(Phaser.Math.Linear(x1, x2, j / steps), Phaser.Math.Linear(y1, y2, j / steps))
    }
  }

  private drawWorld() {
    this.add.image(WORLD_W / 2, WORLD_H / 2, 'cozy-map-ground').setDepth(-4)

    // Actual path tiles from the pack, not semi-transparent strokes.
    this.path([[1950, 1330], [1780, 1300], [1600, 1315], [1450, 1300], [1310, 1280], [1120, 1070], [1010, 900], [910, 770], [760, 570], [610, 390]])
    this.path([[1010, 900], [1260, 770], [1460, 610], [1700, 430], [1930, 340]])
    this.path([[1320, 1290], [950, 1350], [650, 1450], [455, 1415]])
    this.path([[760, 570], [910, 365], [1080, 300], [1240, 360]])
    this.path([[1780, 1300], [1900, 1060], [2070, 860], [2195, 710]])
    this.path([[1450, 1300], [1620, 1230], [1840, 1235]])

    // Quiet Pond gets an authored overlay here so it reads as a pond, not broken tile confetti.
    this.drawQuietPondBase()
    ;[[1815, 270, 1.8], [1990, 350, 2.2], [2155, 430, 1.7]].forEach(([x, y, scale]) => this.asset('water-ripple', x, y, scale).setDepth(1).setAlpha(0.45))
    this.asset('waterfall', 1695, 210, 2.2).setDepth(3)
    this.block(1970, 340, 690, 430)

    this.zone(70, 135, 670, 500, 0x183f2d, 'Moon Forest', 190, 178)
    this.asset('forest-detail', 390, 405, 1.9).setDepth(3)
    ;[[145,235],[245,520],[390,245],[560,355],[655,545],[300,390],[690,205],[105,520]].forEach(([x,y]) => this.blockingAsset('tree', x, y, 1.15, 52, 46, 20).setDepth(4))
    this.add.text(500, 190, 'quiet trail', { fontFamily: 'monospace', fontSize: '13px', color: '#dfffe1', stroke: '#122019', strokeThickness: 3 }).setDepth(5)

    this.zone(1640, 110, 670, 460, 0x1f6880, 'Quiet Pond', 1760, 154)
    this.asset('pond-detail', 2020, 360, 2.2).setDepth(3)
    this.asset('dock', 1888, 522, 1).setDepth(4)
    this.block(1888, 522, 210, 38)
    this.blockingAsset('bench', 2180, 488, 1.25, 74, 32, 8).setDepth(4)

    this.zone(1240, 1160, 430, 340, 0x7b5935, 'Garden', 1345, 1198)
    this.asset('garden-bed', 1492, 1308, 2.35).setDepth(2)
    this.blockingAsset('lamp', 1345, 1188, 1.25, 32, 34, 12).setDepth(4)
    this.blockingAsset('farm-tool', 1640, 1192, 1.25, 34, 34, 0).setDepth(4)

    this.zone(1800, 1120, 560, 390, 0x7d6042, 'Home Base', 1908, 1160)
    this.blockingAsset('house', 1920, 1240, 1.75, 142, 96, 28).setDepth(4)
    this.blockingAsset('home-detail', 2095, 1320, 1.95, 110, 66, 18).setDepth(4)
    this.asset('home-rug', 1835, 1400, 1.25).setDepth(4)
    this.blockingAsset('bench', 1745, 1430, 1.2, 72, 32, 8).setDepth(4)
    this.blockingAsset('lamp', 2210, 1385, 1.25, 32, 34, 12).setDepth(4)

    this.zone(1120, 760, 420, 320, 0x44376a, 'Memory Shrine', 1210, 800)
    this.blockingAsset('shrine', 1330, 920, 1.65, 86, 70, 18).setDepth(4)
    this.asset('heart-decor', 1235, 970, 0.9).setDepth(4)
    this.blockingAsset('lamp', 1130, 980, 1.05, 28, 32, 10).setDepth(4)
    this.blockingAsset('lamp', 1475, 980, 1.05, 28, 32, 10).setDepth(4)

    this.zone(790, 160, 480, 300, 0x324b66, 'University', 915, 202)
    this.blockingAsset('university', 1005, 345, 1.55, 170, 92, 28).setDepth(3)
    ;[[870, 424], [935, 424], [1000, 424], [1065, 424], [1130, 424]].forEach(([x, y]) => this.add.image(x, y, 'cozy-terrain-path').setScale(2).setDepth(3))
    ;[[830,410],[1170,410],[795,250],[1210,250]].forEach(([x,y]) => this.blockingAsset('lamp', x, y, 0.95, 26, 30, 10).setDepth(4))

    this.zone(235, 1280, 460, 260, 0x5d3768, 'Rave Night', 350, 1320)
    this.blockingAsset('dj-booth', 480, 1420, 1.65, 90, 50, 14).setDepth(4)
    ;[[285,1380],[650,1380],[380,1300],[560,1300]].forEach(([x,y], i) => {
      const light = this.asset(i % 2 ? 'rave-light-blue' : 'rave-light-pink', x, y, 1).setDepth(3)
      light.setFlipX(i % 2 === 1)
      this.tweens.add({ targets: light, alpha: 0.55, scaleX: 1.08, yoyo: true, repeat: -1, duration: 900 + i * 160 })
    })

    this.zone(2020, 630, 350, 280, 0x6a5130, 'Dubai → Canada', 2115, 670)
    this.blockingAsset('skyline', 2210, 790, 1.45, 120, 62, 18).setDepth(3)
    this.add.text(2180, 920, 'same team, new skyline', { fontFamily: 'monospace', fontSize: '13px', color: '#fff3ba', stroke: '#2a1a1e', strokeThickness: 3 }).setOrigin(0.5).setDepth(5)

    this.zone(1295, 250, 320, 250, 0x315b62, 'Kitchen Date', 1385, 288)
    this.blockingAsset('kitchen', 1490, 405, 1.85, 90, 62, 16).setDepth(4)
    this.asset('heart-decor', 1355, 425, 0.85).setDepth(4)

    this.zone(760, 720, 320, 220, 0x315b46, 'Cat Grove', 840, 755)
    this.blockingAsset('tree2', 910, 865, 1.25, 54, 42, 18).setDepth(4)
    this.asset('heart-decor', 815, 860, 0.72).setDepth(4)

    for (let i = 0; i < 75; i++) {
      const dot = this.add.circle(Phaser.Math.Between(90, WORLD_W - 90), Phaser.Math.Between(120, WORLD_H - 90), Phaser.Math.Between(1, 3), 0xffe58a, Phaser.Math.FloatBetween(0.16, 0.45)).setDepth(6)
      this.fireflies.push(dot)
    }

    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(45, WORLD_W - 45)
      const y = Phaser.Utils.Array.GetRandom([105, WORLD_H - 54, Phaser.Math.Between(640, 1040)])
      if ((x > 1180 && y > 1060) || (x > 1630 && y < 580)) continue
      this.blockingAsset(Phaser.Math.Between(0, 1) ? 'tree' : 'tree2', x, y, Phaser.Math.FloatBetween(0.72, 1.0), 44, 36, 18).setAlpha(0.78).setDepth(2)
    }
  }

  private drawQuietPondBase() {
    const g = this.add.graphics().setDepth(1)
    // Patch over the old tiled pond area with matching ground first.
    g.fillStyle(0xee9e58, 1)
    g.fillRoundedRect(1595, 82, 770, 500, 28)
    g.fillStyle(0x5fa32d, 1)
    g.fillCircle(1660, 112, 128)
    g.fillCircle(2318, 128, 106)
    g.fillCircle(2305, 530, 92)

    // Sand bank and water body. Big simple silhouettes read better than noisy tile patches.
    g.fillStyle(0xeecf91, 1)
    g.fillEllipse(1988, 324, 710, 410)
    g.fillStyle(0x3597c6, 1)
    g.fillEllipse(1988, 316, 620, 320)
    g.fillStyle(0x2070b2, 0.82)
    g.fillEllipse(2008, 318, 445, 220)
    g.fillStyle(0x79d6e5, 0.38)
    ;[[1820,245,128,9],[1970,205,154,8],[2135,273,142,8],[1870,355,124,8],[2050,395,172,8],[2180,345,94,7]].forEach(([x, y, w, h]) => g.fillRoundedRect(x, y, w, h, 4))

    // Reeds and rocks around the bank so the pond has bespoke identity.
    g.fillStyle(0x375f2d, 1)
    ;[[1718,392],[2255,272],[2160,492],[1772,176],[2055,520]].forEach(([x, y]) => {
      for (let i = -2; i <= 2; i++) g.fillRect(x + i * 7, y - 34 - Math.abs(i) * 4, 4, 38 + Math.abs(i) * 4)
      g.fillStyle(0xddb95c, 1)
      g.fillCircle(x - 14, y - 38, 5); g.fillCircle(x + 14, y - 41, 5)
      g.fillStyle(0x375f2d, 1)
    })
    g.fillStyle(0x7b5c44, 1)
    ;[[1708,218],[2242,440],[1906,132],[2115,146],[1838,484],[2290,335]].forEach(([x, y]) => g.fillEllipse(x, y, 32, 18))
  }

  private addInteractiveItems() {
    const treeSpots = [
      [150,245],[295,220],[440,275],[610,345],[255,505],[430,510],[690,225],[690,540],
      [760,790],[930,980],[1340,640],[1460,760],[1640,1030],[2260,1120],[2290,1480],[80,1480]
    ]
    treeSpots.forEach(([x, y]) => {
      const sprite = this.tree(x, y)
      this.items.push({ kind: 'tree', name: 'soft pine', zone: new Phaser.Geom.Rectangle(x - 38, y - 52, 76, 96), cooldown: 0, sprite })
    })

    ;[[540,535],[350,410],[180,565],[1110,940],[1340,930],[1460,1360],[1790,505],[2150,260],[700,1210],[650,1380]].forEach(([x, y]) => {
      const sprite = this.flower(x, y)
      this.items.push({ kind: 'herb', name: 'wellness herbs', zone: new Phaser.Geom.Rectangle(x - 30, y - 30, 60, 60), cooldown: 0, sprite })
    })

    for (let i = 0; i < 12; i++) {
      const x = 1375 + (i % 4) * 78
      const y = 1245 + Math.floor(i / 4) * 66
      this.asset(i % 2 ? 'farm-soil1' : 'farm-soil0', x, y + 12, 1.18).setDepth(2)
      const crop = this.asset('farm-crop0', x, y, 1.45).setDepth(4)
      this.items.push({ kind: 'crop', name: 'farm plot', zone: new Phaser.Geom.Rectangle(x - 34, y - 30, 68, 62), sprite: crop, stage: 0 })
    }

    this.items.push({ kind: 'pond', name: 'fishing dock', zone: new Phaser.Geom.Rectangle(1640, 110, 670, 460), cooldown: 0 })
    this.items.push({ kind: 'puzzle', name: 'match-3 memory shrine', zone: new Phaser.Geom.Rectangle(1120, 760, 420, 320) })
    this.items.push({ kind: 'house', name: 'home base', zone: new Phaser.Geom.Rectangle(1800, 1120, 560, 390) })

    this.memory(1005, 345, 'University', 'Years of almost, then timing finally got smart.')
    this.memory(480, 1420, 'Rave Night', 'Somebody bumped you together. Best collision physics ever.')
    this.memory(2210, 790, 'Dubai Year', 'New city, new rhythm, same team.')
    this.memory(1920, 1240, 'Canada Home', 'Back home, building the next chapter soft and loud.')
    this.memory(1490, 405, 'Kitchen Date', 'Food, wellness, cats, and somehow exactly the right life.')
    this.memory(910, 865, 'Pengu & Mila', 'Two tiny supervisors joined the build and immediately improved management.')
  }

  private addCharacters() {
    this.person(1995, 1335, 0xb87555, 0x17110f, 0x1d2430, 'Noot')
    this.player = this.person(1855, 1375, 0xf7d7bd, 0x2a201e, 0xff91ce, 'B')
    this.pengu = this.cat(-90, -90, 0xb88955, 'Pengu')
    this.mila = this.cat(-90, -90, 0xd9cbb7, 'Mila')
    this.pengu.setVisible(false)
    this.mila.setVisible(false)
  }

  private addUI() {
    this.fixed(this.add.rectangle(480, 24, 960, 48, 0x0e1816, 0.90))
    this.fixed(this.add.text(16, 9, 'Bb2D', { fontFamily: 'monospace', fontSize: '24px', color: '#ffe7a8' }))
    this.ui = this.fixed(this.add.text(102, 11, '', { fontFamily: 'monospace', fontSize: '13px', color: '#ecffd8' }))
    this.objective = this.fixed(this.add.text(704, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd7ed', align: 'right' }))
    this.areaLabel = this.fixed(this.add.text(16, 62, '', { fontFamily: 'monospace', fontSize: '13px', color: '#ffe7a8', backgroundColor: '#0e1816bb', padding: { x: 8, y: 5 } }))
    this.prompt = this.fixed(this.add.text(16, 586, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#10201cdd', padding: { x: 8, y: 6 } }))
    this.toast = this.fixed(this.add.text(480, 78, '', { fontFamily: 'monospace', fontSize: '15px', color: '#fff0c8', backgroundColor: '#21170ddd', padding: { x: 10, y: 6 }, align: 'center' }).setOrigin(0.5))
    this.minimap = this.fixed(this.add.graphics())
    this.addTouchButtons()
    this.refreshUI()
    this.updateAreaLabel()
    this.updateMinimap()
  }

  private addTouchButtons() {
    const buttons: [string, number, () => void][] = [
      ['E', 680, () => this.interact()],
      ['F', 742, () => this.fish()],
      ['P', 804, () => this.openPuzzle()],
      ['B', 848, () => this.decorate()],
      ['H', 906, () => this.showJournal()],
    ]
    buttons.forEach(([label, x, action]) => {
      const bg = this.fixed(this.add.rectangle(x, 594, 48, 48, 0x21170d, 0.82).setStrokeStyle(2, 0xffe7a8, 0.85).setInteractive({ useHandCursor: true }))
      const txt = this.fixed(this.add.text(x, 594, label, { fontFamily: 'monospace', fontSize: '20px', color: '#ffe7a8' }).setOrigin(0.5))
      bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation()
        this.moveTarget = undefined
        action()
      })
      txt.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation()
        this.moveTarget = undefined
        action()
      })
    })
  }

  private showIntro() {
    this.overlay = this.add.container(0, 0).setName('intro').setScrollFactor(0).setDepth(120)
    this.overlay.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.92).setScrollFactor(0))
    const card = this.add.container(480, 320).setScrollFactor(0)
    card.add(this.add.image(-270, 145, 'cozy-cat-pengu').setScale(3.2).setAngle(-6))
    card.add(this.add.image(270, 145, 'cozy-cat-mila').setScale(3.2).setAngle(6))
    card.add(this.add.image(-180, -122, 'cozy-memory-sparkle').setScale(1.15))
    card.add(this.add.image(180, -122, 'cozy-memory-sparkle').setScale(1.15))
    card.add(this.add.image(0, 18, 'cozy-home-rug').setScale(4.2).setAlpha(0.32))
    card.add(this.add.image(-70, 34, 'cozy-player').setScale(3.0))
    card.add(this.add.image(70, 34, 'cozy-noot').setScale(3.0))
    card.add(this.add.text(0, -190, 'Bb2D', { fontFamily: 'monospace', fontSize: '62px', color: '#ffe7a8', stroke: '#21131a', strokeThickness: 6 }).setOrigin(0.5))
    card.add(this.add.text(0, -134, 'A tiny cozy adventure for BB.', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5))
    card.add(this.add.text(0, -60,
      'Have a wonderful adventure BB <3. Wandr the paths, collect memories,\ngather resources, solve the shrine puzzle, grow flowers,\ndecorate home, unlock Pengu and Mila,\nand talk to Noot when the house feels ready.',
      { fontFamily: 'monospace', fontSize: '16px', color: '#dfffe1', align: 'center', lineSpacing: 8 }
    ).setOrigin(0.5))
    card.add(this.add.text(0, 205, 'Move: WASD/arrows or tap   E: interact   F: fish   P: puzzle   B: decorate', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd7ed' }).setOrigin(0.5))
    const start = this.add.text(0, 248, this.loadedFromSave ? 'Press Enter or Space to continue' : 'Press Enter or Space to start', { fontFamily: 'monospace', fontSize: '18px', color: '#ffe7a8', backgroundColor: '#21170ddd', padding: { x: 14, y: 8 } }).setOrigin(0.5)
    card.add(start)
    this.overlay.add(card)
    this.tweens.add({ targets: start, alpha: 0.62, yoyo: true, repeat: -1, duration: 900 })
    card.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Image && child.texture.key === 'cozy-memory-sparkle') this.tweens.add({ targets: child, angle: 10, scale: 1.32, yoyo: true, repeat: -1, duration: 1100 })
    })
  }

  private dismissOverlay() {
    if (this.overlay && !this.inPuzzle) {
      this.overlay.destroy(true)
      this.overlay = undefined
      this.audio.start()
      this.audio.blip('start')
      this.gameStarted = true
      this.say(this.currentChapter().hint)
    }
  }

  private interact() {
    if (!this.gameStarted || this.endingShown) return
    const item = this.nearItem()
    if (!item) return this.say('Move near something and press E.')
    if (item.kind === 'tree') return this.gather(item, 'wood')
    if (item.kind === 'herb') return this.gather(item, 'herbs')
    if (item.kind === 'crop') return this.tendCrop(item)
    if (item.kind === 'memory') return this.collectMemory(item)
    if (item.kind === 'puzzle') return this.openPuzzle()
    if (item.kind === 'house') return this.decorate()
    if (item.kind === 'wife') return this.tryEnding()
  }

  private gather(item: WorldItem, res: 'wood' | 'herbs') {
    if (this.currentChapter().n < 1) return this.say('First: find a sparkling memory. Then Pengu will approve forestry.')
    const now = this.time.now
    if ((item.cooldown ?? 0) > now) return this.say(res === 'wood' ? 'This tree needs a breather.' : 'Those herbs need a moment to regrow.')
    this.audio.blip('gather')
    this.inv[res]++
    this.total[res]++
    item.cooldown = now + 950
    this.pulse(item.sprite)
    this.floatText(item.sprite ?? this.player, res === 'wood' ? '+wood' : '+herb')
    this.say(res === 'wood' ? '+1 wood. Future furniture, obviously.' : '+1 herb. Wellness inventory upgraded.')
    this.advanceChapter()
    this.saveState()
    this.refreshUI()
  }

  private tendCrop(item: WorldItem) {
    if (this.currentChapter().n < 3) return this.say('The garden unlocks after the pond chapter. Very linear, very professional.')
    item.stage = Math.min((item.stage ?? 0) + 1, 5)
    if (item.sprite instanceof Phaser.GameObjects.Image) item.sprite.setTexture(`cozy-farm-crop${item.stage}`)
    if (item.stage === 5) {
      this.audio.blip('gather')
      this.inv.blooms++
      this.total.blooms++
      item.stage = 0
      this.time.delayedCall(350, () => { if (item.sprite instanceof Phaser.GameObjects.Image) item.sprite.setTexture('cozy-farm-crop0') })
      this.floatText(item.sprite ?? this.player, '+harvest')
      this.say('+1 bloom. Proper farming system, finally.')
    } else {
      const steps = ['Soil hoed.', 'Seeds planted.', 'Watered.', 'Sprouting.', 'Almost harvestable.']
      this.say(steps[item.stage - 1] ?? 'Growing.')
    }
    this.advanceChapter()
    this.saveState()
    this.refreshUI()
  }

  private fish() {
    if (!this.gameStarted || this.endingShown) return
    if (this.currentChapter().n < 2) return this.say('Pond later. Pengu wants forest supplies first.')
    const item = this.nearItem('pond')
    if (!item) return this.say('Stand by the pond and press F to fish.')
    const now = this.time.now
    if ((item.cooldown ?? 0) > now) return this.say('Let the pond settle for a second.')
    item.cooldown = now + 850
    this.audio.blip('fish')
    this.inv.fish++
    this.total.fish++
    const fishIcon = this.add.image(this.player.x + 12, this.player.y - 42, 'cozy-fish').setDepth(20)
    this.tweens.add({ targets: fishIcon, y: fishIcon.y - 28, alpha: 0, duration: 900, onComplete: () => fishIcon.destroy() })
    this.say('+1 fish. Quiet pond, good luck.')
    this.advanceChapter()
    this.saveState()
    this.refreshUI()
  }

  private collectMemory(item: WorldItem) {
    if (item.collected) return this.say(item.message ?? 'Already remembered.')
    this.audio.blip('memory')
    item.collected = true
    this.inv.memories++
    this.inv.hearts++
    if (item.sprite instanceof Phaser.GameObjects.Container) item.sprite.setAlpha(0.55)
    item.marker?.destroy()
    this.say(`${item.name} remembered. +1 heart.`)
    this.showMemoryCard(item.name, item.message ?? '')
    this.checkUnlocks()
    this.advanceChapter()
    this.saveState()
    this.refreshUI()
  }

  private showMemoryCard(title: string, body: string) {
    const card = this.add.container(0, 0).setDepth(110).setScrollFactor(0)
    card.add(this.add.rectangle(480, 320, 590, 205, 0x120e18, 0.95).setStrokeStyle(3, 0xffc6e9).setScrollFactor(0))
    card.add(this.add.text(480, 266, title, { fontFamily: 'monospace', fontSize: '24px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    card.add(this.add.text(480, 326, body, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5).setScrollFactor(0))
    card.add(this.add.text(480, 392, 'A memory goes into the house.', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd7ed' }).setOrigin(0.5).setScrollFactor(0))
    this.time.delayedCall(2300, () => card.destroy(true))
  }

  private decorate() {
    if (!this.gameStarted || this.endingShown) return
    if (this.currentChapter().n < 5) return this.say('Home decorating unlocks after the shrine starts giving decor.')
    if (!this.nearItem('house')) return this.say('Decorating happens at home. Press B inside the base.')
    if (this.decorPlaced >= GOAL.decorPlaced) return this.say('The home is fully decorated. Talk to Noot when the goals are done.')
    if (this.inv.decor <= 0 && (this.inv.wood < 2 || this.inv.herbs < 1 || this.inv.fish < 1)) {
      return this.say('Need 1 decor token or 2 wood + 1 herb + 1 fish.')
    }
    if (this.inv.decor > 0) this.inv.decor--
    else { this.inv.wood -= 2; this.inv.herbs--; this.inv.fish-- }
    this.audio.blip('decorate')
    this.decorPlaced++
    this.placeDecor(this.decorPlaced)
    this.warmHome()
    this.say(`Decoration ${this.decorPlaced}/${GOAL.decorPlaced} placed.`)
    this.advanceChapter()
    this.saveState()
    this.refreshUI()
  }

  private openPuzzle() {
    if (!this.gameStarted || this.endingShown) return
    if (this.currentChapter().n < 4) return this.say('The shrine wakes up after the garden blooms.')
    if (!this.nearItem('puzzle')) return this.say('Go to the Memory Shrine and press P or E.')
    if (this.inPuzzle) return
    this.inPuzzle = true
    const overlay = this.add.container(0, 0).setDepth(120).setScrollFactor(0).setName('puzzle')
    overlay.add(this.add.rectangle(480, 320, 960, 640, 0x07080d, 0.88).setScrollFactor(0))
    overlay.add(this.add.text(480, 72, 'Match-3 Memories', { fontFamily: 'monospace', fontSize: '30px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    overlay.add(this.add.text(480, 112, 'Click adjacent tiles. Make any row or column of 3+. ESC closes.', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0))

    const size = 6
    const icons = ['🎧', '🌲', '🐟', '🌸', '🥟', '🐾']
    const cells: string[][] = []
    const board: Phaser.GameObjects.Text[][] = []
    const boxes: Phaser.GameObjects.Rectangle[][] = []
    let selected: { r: number, c: number } | null = null
    let resolving = false

    const randomIcon = () => Phaser.Utils.Array.GetRandom(icons)
    const swapCells = (a: { r: number, c: number }, b: { r: number, c: number }) => {
      const tmp = cells[a.r][a.c]
      cells[a.r][a.c] = cells[b.r][b.c]
      cells[b.r][b.c] = tmp
    }
    const findMatches = () => {
      const matched: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
      let count = 0
      for (let r = 0; r < size; r++) {
        let runStart = 0
        for (let c = 1; c <= size; c++) {
          if (c < size && cells[r][c] === cells[r][runStart]) continue
          const run = c - runStart
          if (run >= 3) for (let x = runStart; x < c; x++) if (!matched[r][x]) { matched[r][x] = true; count++ }
          runStart = c
        }
      }
      for (let c = 0; c < size; c++) {
        let runStart = 0
        for (let r = 1; r <= size; r++) {
          if (r < size && cells[r][c] === cells[runStart][c]) continue
          const run = r - runStart
          if (run >= 3) for (let y = runStart; y < r; y++) if (!matched[y][c]) { matched[y][c] = true; count++ }
          runStart = r
        }
      }
      return { matched, count }
    }
    const hasLegalMove = () => {
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const here = { r, c }
        const candidates = [{ r: r + 1, c }, { r, c: c + 1 }].filter(p => p.r < size && p.c < size)
        for (const there of candidates) {
          swapCells(here, there)
          const legal = findMatches().count > 0
          swapCells(here, there)
          if (legal) return true
        }
      }
      return false
    }
    const fillFreshBoard = () => {
      for (let attempt = 0; attempt < 200; attempt++) {
        for (let r = 0; r < size; r++) {
          cells[r] = []
          for (let c = 0; c < size; c++) {
            let pick = randomIcon()
            let guard = 0
            while (guard++ < 20 && ((c >= 2 && cells[r][c - 1] === pick && cells[r][c - 2] === pick) || (r >= 2 && cells[r - 1][c] === pick && cells[r - 2][c] === pick))) pick = randomIcon()
            cells[r][c] = pick
          }
        }
        if (hasLegalMove()) return
      }
    }
    const syncBoard = () => {
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) board[r][c].setText(cells[r][c]).setScale(1).setAlpha(1)
    }
    const clearSelection = () => {
      selected = null
      boxes.flat().forEach(b => b.setStrokeStyle(2, 0xffe7a8))
    }
    const collapseAndRefill = () => {
      const { matched, count } = findMatches()
      if (!count) return false
      const matchedIcons: string[] = []
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (matched[r][c]) {
        matchedIcons.push(cells[r][c])
        board[r][c].setText('✨')
        this.tweens.add({ targets: board[r][c], scale: 1.3, alpha: 0.4, yoyo: true, duration: 120 })
      }
      rewardMatch(matchedIcons)
      this.time.delayedCall(180, () => {
        for (let c = 0; c < size; c++) {
          const kept: string[] = []
          for (let r = size - 1; r >= 0; r--) if (!matched[r][c]) kept.push(cells[r][c])
          for (let r = size - 1; r >= 0; r--) cells[r][c] = kept[size - 1 - r] ?? randomIcon()
        }
        let guard = 0
        while (findMatches().count > 0 && guard++ < 10) {
          const next = findMatches().matched
          for (let c = 0; c < size; c++) {
            const kept: string[] = []
            for (let r = size - 1; r >= 0; r--) if (!next[r][c]) kept.push(cells[r][c])
            for (let r = size - 1; r >= 0; r--) cells[r][c] = kept[size - 1 - r] ?? randomIcon()
          }
        }
        if (!hasLegalMove()) fillFreshBoard()
        syncBoard()
        resolving = false
      })
      return true
    }
    const rewardMatch = (matchedIcons: string[]) => {
      this.audio.blip('puzzle')
      const unique = [...new Set(matchedIcons)]
      const awards: string[] = []
      const bonus = matchedIcons.length >= 4 ? 1 : 0
      unique.forEach(icon => {
        if (icon === '🌲') { this.inv.wood += 1 + bonus; this.total.wood += 1 + bonus; awards.push(`+${1 + bonus} wood`) }
        else if (icon === '🐟') { this.inv.fish += 1 + bonus; this.total.fish += 1 + bonus; awards.push(`+${1 + bonus} fish`) }
        else if (icon === '🌸') { this.inv.blooms += 1 + bonus; this.total.blooms += 1 + bonus; awards.push(`+${1 + bonus} bloom`) }
        else if (icon === '🥟') { this.inv.herbs += 1 + bonus; this.total.herbs += 1 + bonus; this.inv.decor++; awards.push(`+${1 + bonus} herb`, '+1 decor') }
        else if (icon === '🎧') { this.inv.decor += 1 + bonus; awards.push(`+${1 + bonus} decor`) }
        else if (icon === '🐾') { this.inv.hearts += 1 + bonus; awards.push(`+${1 + bonus} heart`) }
      })
      if (!awards.length) { this.inv.decor++; awards.push('+1 decor') }
      this.checkUnlocks()
      this.advanceChapter()
      this.saveState()
      this.refreshUI()
      this.say(`Match reward: ${awards.slice(0, 3).join(', ')}${awards.length > 3 ? '...' : ''}`)
    }

    fillFreshBoard()
    for (let r = 0; r < size; r++) {
      board[r] = []
      boxes[r] = []
      for (let c = 0; c < size; c++) {
        const x = 292 + c * 62
        const y = 154 + r * 56
        const bg = this.add.rectangle(x, y, 54, 50, 0x293a52).setStrokeStyle(2, 0xffe7a8).setInteractive().setScrollFactor(0)
        const t = this.add.text(x, y, cells[r][c], { fontFamily: 'sans-serif', fontSize: '27px' }).setOrigin(0.5).setInteractive().setScrollFactor(0)
        overlay.add([bg, t])
        boxes[r][c] = bg
        board[r][c] = t
        const click = () => {
          if (resolving) return
          if (!selected) {
            selected = { r, c }
            boxes[r][c].setStrokeStyle(4, 0xff91ce)
            return
          }
          const next = { r, c }
          const adj = Math.abs(selected.r - next.r) + Math.abs(selected.c - next.c) === 1
          if (!adj) {
            clearSelection()
            selected = next
            boxes[r][c].setStrokeStyle(4, 0xff91ce)
            return
          }
          const prev = selected
          swapCells(prev, next)
          syncBoard()
          if (findMatches().count === 0) {
            swapCells(prev, next)
            syncBoard()
            this.say('No match. Try another swap.')
            clearSelection()
            return
          }
          resolving = true
          clearSelection()
          collapseAndRefill()
        }
        bg.on('pointerdown', click)
        t.on('pointerdown', click)
      }
    }
    overlay.add(this.add.text(480, 522, 'Tip: any 3+ in a row or column counts. The board refills with new moves now.', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd7ed' }).setOrigin(0.5).setScrollFactor(0))
  }

  private closePuzzle() {
    const puzzle = this.children.getByName('puzzle') as Phaser.GameObjects.Container | null
    if (puzzle) puzzle.destroy(true)
    this.inPuzzle = false
  }

  private tryEnding() {
    const missing = this.missingGoals()
    if (missing.length) return this.say(`Almost. Still need: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`)
    this.showEnding()
  }

  private missingGoals() {
    const missing: string[] = []
    if (this.total.wood < GOAL.wood) missing.push(`${GOAL.wood - this.total.wood} wood`)
    if (this.total.herbs < GOAL.herbs) missing.push(`${GOAL.herbs - this.total.herbs} herbs`)
    if (this.total.fish < GOAL.fish) missing.push(`${GOAL.fish - this.total.fish} fish`)
    if (this.total.blooms < GOAL.blooms) missing.push(`${GOAL.blooms - this.total.blooms} blooms`)
    if (this.inv.hearts < GOAL.hearts) missing.push(`${GOAL.hearts - this.inv.hearts} hearts`)
    if (this.decorPlaced < GOAL.decorPlaced) missing.push(`${GOAL.decorPlaced - this.decorPlaced} decor`)
    if (this.inv.memories < GOAL.memories) missing.push(`${GOAL.memories - this.inv.memories} memories`)
    return missing
  }

  private showEnding() {
    this.audio.blip('ending')
    this.endingShown = true
    const end = this.add.container(0, 0).setDepth(130).setScrollFactor(0)
    end.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.94).setScrollFactor(0))
    end.add(this.add.text(480, 66, 'Home Complete', { fontFamily: 'monospace', fontSize: '42px', color: '#ffe7a8', stroke: '#21131a', strokeThickness: 5 }).setOrigin(0.5).setScrollFactor(0))
    const photo = this.add.container(480, 214).setScrollFactor(0)
    photo.add(this.add.image(0, 0, 'cozy-ending-frame').setScale(1))
    photo.add(this.add.image(-80, -12, 'cozy-player').setScale(2.5))
    photo.add(this.add.image(8, -12, 'cozy-noot').setScale(2.5))
    photo.add(this.add.image(96, 38, 'cozy-cat-pengu').setScale(2.05))
    photo.add(this.add.image(138, 38, 'cozy-cat-mila').setScale(2.05))
    photo.add(this.add.image(-136, 32, 'cozy-heart-decor').setScale(0.9))
    end.add(photo)
    end.add(this.add.text(480, 380,
      'From university hallways to rave lights,\nfrom Dubai days to Canada home,\nfrom wellness walks to kitchen dates,\nfrom Pengu and Mila judging every choice...\n\nWe keep building the soft little world.\nOne memory, one meal, one cat hair, one home at a time.\n\nHappy everything, B. ♡',
      { fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', align: 'center', lineSpacing: 7, wordWrap: { width: 760 } }
    ).setOrigin(0.5).setScrollFactor(0))
    end.add(this.add.text(480, 590, 'Press R to play again', { fontFamily: 'monospace', fontSize: '15px', color: '#ffd7ed' }).setOrigin(0.5).setScrollFactor(0))
    for (let i = 0; i < 34; i++) {
      const heart = this.add.image(Phaser.Math.Between(90, 870), Phaser.Math.Between(80, 570), i % 3 === 0 ? 'cozy-memory-sparkle' : 'cozy-heart-decor').setScale(Phaser.Math.FloatBetween(0.28, 0.58)).setAlpha(0.55).setScrollFactor(0)
      end.add(heart)
      this.tweens.add({ targets: heart, y: heart.y - Phaser.Math.Between(14, 42), angle: Phaser.Math.Between(-12, 12), alpha: 0.18, yoyo: true, repeat: -1, duration: Phaser.Math.Between(1400, 2600) })
    }
    this.tweens.add({ targets: photo, y: 205, yoyo: true, repeat: -1, duration: 1800 })
  }

  private checkUnlocks() {
    if (this.inv.hearts >= 1 && this.pengu && !this.pengu.visible) {
      this.pengu.setVisible(true)
      this.say('Pengu joined: feisty, sweet, judging the furniture.')
    }
    if (this.inv.hearts >= 3 && this.mila && !this.mila.visible) {
      this.mila.setVisible(true)
      this.say('Mila joined: tiny cloud, maximum opinions.')
    }
  }

  private nearItem(kind?: ItemKind) {
    const hits = this.items.filter(i => (!kind || i.kind === kind) && Phaser.Geom.Rectangle.Contains(i.zone, this.player.x, this.player.y))
    if (kind) return hits[0]
    const priority: Record<ItemKind, number> = { wife: 0, memory: 1, puzzle: 2, crop: 3, pond: 4, herb: 5, tree: 6, house: 7 }
    return hits.sort((a, b) => priority[a.kind] - priority[b.kind])[0]
  }

  private updatePrompt() {
    const item = this.nearItem()
    const base = 'WASD/arrows/tap move  E interact  F fish  P puzzle  B decorate  H journal  R reset'
    this.prompt.setText(item ? `${base}\nNear: ${item.name}` : base)
  }

  private updateAreaLabel() {
    const p = this.player
    const areas: [string, Phaser.Geom.Rectangle][] = [
      ['Moon Forest', new Phaser.Geom.Rectangle(70, 135, 670, 500)],
      ['Quiet Pond', new Phaser.Geom.Rectangle(1640, 110, 670, 460)],
      ['Garden', new Phaser.Geom.Rectangle(1240, 1160, 430, 340)],
      ['Home Base', new Phaser.Geom.Rectangle(1800, 1120, 560, 390)],
      ['Memory Shrine', new Phaser.Geom.Rectangle(1120, 760, 420, 320)],
      ['University', new Phaser.Geom.Rectangle(790, 160, 480, 300)],
      ['Rave Night', new Phaser.Geom.Rectangle(235, 1280, 460, 260)],
      ['Dubai → Canada', new Phaser.Geom.Rectangle(2020, 630, 350, 280)],
      ['Kitchen Date', new Phaser.Geom.Rectangle(1295, 250, 320, 250)],
      ['Cat Grove', new Phaser.Geom.Rectangle(760, 720, 320, 220)],
    ]
    const area = areas.find(([, r]) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y))?.[0] ?? 'Wandering the soft little world'
    this.areaLabel.setText(area)
  }

  private currentChapter(): Chapter {
    const missing = this.missingGoals()
    if (!missing.length) return { n: 6, title: 'Finale: Home Complete', objective: 'Talk to Noot at Home Base.', hint: 'Everything is ready. Go talk to Noot at Home Base.' }
    if (this.inv.memories < 1) return { n: 0, title: 'Chapter 1: First Spark', objective: 'Find and collect any sparkling memory.', hint: 'Follow a sparkle marker and press E to collect the first memory.' }
    if (this.total.wood < 4 || this.total.herbs < 2) return { n: 1, title: 'Chapter 2: Pengu’s Forest Errand', objective: `Gather forest supplies: wood ${Math.min(this.total.wood, 4)}/4, herbs ${Math.min(this.total.herbs, 2)}/2.`, hint: 'Pengu is awake. Gather wood and herbs in Moon Forest.' }
    if (this.total.fish < 2) return { n: 2, title: 'Chapter 3: Quiet Pond', objective: `Catch fish at the dock: ${Math.min(this.total.fish, 2)}/2.`, hint: 'The pond is open. Stand by the dock and press F.' }
    if (this.total.blooms < 2) return { n: 3, title: 'Chapter 4: Garden Bloom', objective: `Grow two blooms in the garden: ${Math.min(this.total.blooms, 2)}/2.`, hint: 'The garden is ready. Tend crops until they bloom.' }
    if (this.inv.decor < 2 || this.inv.hearts < 4) return { n: 4, title: 'Chapter 5: Shrine Puzzle', objective: `Solve shrine matches for warmth: hearts ${Math.min(this.inv.hearts, 4)}/4, decor tokens ${Math.min(this.inv.decor, 2)}/2.`, hint: 'The shrine is awake. Match icons to earn useful rewards.' }
    return { n: 5, title: 'Chapter 6: Make It Home', objective: `Collect remaining memories and decorate: decor ${this.decorPlaced}/${GOAL.decorPlaced}, memories ${this.inv.memories}/${GOAL.memories}.`, hint: 'Now finish the house. Collect any remaining memories and place decor at Home Base.' }
  }

  private advanceChapter() {
    const chapter = this.currentChapter()
    if (chapter.n > this.lastChapter) {
      this.lastChapter = chapter.n
      this.say(`${chapter.title}: ${chapter.hint}`)
      this.audio.blip(chapter.n >= 6 ? 'ending' : 'memory')
    }
  }

  private showJournal() {
    if (this.overlay && this.overlay.name === 'journal') { this.overlay.destroy(true); this.overlay = undefined; return }
    if (this.overlay && this.overlay.name !== 'intro') return
    const ch = this.currentChapter()
    const missing = this.missingGoals()
    const journal = this.add.container(0, 0).setName('journal').setScrollFactor(0).setDepth(125)
    journal.add(this.add.rectangle(480, 320, 720, 430, 0x08090d, 0.94).setStrokeStyle(3, 0xffe7a8).setScrollFactor(0))
    journal.add(this.add.text(480, 150, ch.title, { fontFamily: 'monospace', fontSize: '26px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    journal.add(this.add.text(480, 212, ch.objective, { fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', align: 'center', wordWrap: { width: 610 } }).setOrigin(0.5).setScrollFactor(0))
    journal.add(this.add.text(480, 292, `Full ending needs: ${missing.length ? missing.slice(0, 6).join(', ') : 'nothing. Go talk to Noot.'}`, { fontFamily: 'monospace', fontSize: '14px', color: '#dfffe1', align: 'center', wordWrap: { width: 620 } }).setOrigin(0.5).setScrollFactor(0))
    journal.add(this.add.text(480, 394, 'Press H to close. Press R for a new run.', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd7ed' }).setOrigin(0.5).setScrollFactor(0))
    this.overlay = journal
  }

  private placeDecor(index: number) {
    const spots = [[1785,1235],[1845,1210],[1915,1290],[2010,1260],[2115,1340],[1775,1405],[1870,1430],[2045,1425],[2200,1450]]
    const [x, y] = spots[index - 1] ?? spots[spots.length - 1]
    this.asset('decor', x, y, 0.9).setDepth(5)
  }

  private warmHome() {
    if (this.decorPlaced % 2 !== 0 && this.decorPlaced < GOAL.decorPlaced) return
    const burst = this.add.image(1920, 1210, 'cozy-memory-sparkle').setScale(this.decorPlaced >= GOAL.decorPlaced ? 2.2 : 1.35).setDepth(8)
    this.tweens.add({ targets: burst, scale: burst.scaleX + 0.7, alpha: 0, duration: 900, onComplete: () => burst.destroy() })
    if (this.decorPlaced >= GOAL.decorPlaced) this.say('Home is glowing. Mm. That is the point.')
  }

  private saveState() {
    const state: SaveState = {
      inv: { ...this.inv },
      total: { ...this.total },
      decorPlaced: this.decorPlaced,
      collected: this.items.filter(i => i.kind === 'memory' && i.collected).map(i => i.name),
      cropStages: this.items.filter(i => i.kind === 'crop').map(i => i.stage ?? 0),
    }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch {}
  }

  private loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const state = JSON.parse(raw) as SaveState
      this.inv = { ...this.inv, ...state.inv }
      this.total = { ...this.total, ...state.total }
      this.decorPlaced = Math.min(state.decorPlaced ?? 0, GOAL.decorPlaced)
      const collected = new Set(state.collected ?? [])
      this.items.filter(i => i.kind === 'memory').forEach(i => {
        if (!collected.has(i.name)) return
        i.collected = true
        if (i.sprite instanceof Phaser.GameObjects.Container) i.sprite.setAlpha(0.55)
        i.marker?.destroy()
      })
      this.items.filter(i => i.kind === 'crop').forEach((i, idx) => {
        i.stage = state.cropStages?.[idx] ?? 0
        if (i.sprite instanceof Phaser.GameObjects.Image) i.sprite.setTexture(`cozy-farm-crop${i.stage}`)
      })
      for (let i = 1; i <= this.decorPlaced; i++) this.placeDecor(i)
      if (this.inv.hearts >= 1) this.pengu?.setVisible(true)
      if (this.inv.hearts >= 3) this.mila?.setVisible(true)
      this.lastChapter = this.currentChapter().n
      this.loadedFromSave = true
    } catch { localStorage.removeItem(SAVE_KEY) }
  }

  private updateMinimap() {
    if (!this.minimap) return
    const m = this.minimap
    const x = 786
    const y = 82
    const w = 150
    const h = 100
    const sx = w / WORLD_W
    const sy = h / WORLD_H
    m.clear()
    m.fillStyle(0x0e1816, 0.86)
    m.fillRoundedRect(x, y, w, h, 8)
    m.lineStyle(2, 0xffe7a8, 0.65)
    m.strokeRoundedRect(x, y, w, h, 8)
    const areas: [Phaser.Geom.Rectangle, number][] = [
      [new Phaser.Geom.Rectangle(70, 135, 670, 500), 0x2e8a55],
      [new Phaser.Geom.Rectangle(1640, 110, 670, 460), 0x47b9d6],
      [new Phaser.Geom.Rectangle(1240, 1160, 430, 340), 0xc58a4b],
      [new Phaser.Geom.Rectangle(1800, 1120, 560, 390), 0xffd37a],
      [new Phaser.Geom.Rectangle(1120, 760, 420, 320), 0xb38cff],
      [new Phaser.Geom.Rectangle(790, 160, 480, 300), 0x9fc7ff],
      [new Phaser.Geom.Rectangle(235, 1280, 460, 260), 0xff69b4],
      [new Phaser.Geom.Rectangle(2020, 630, 350, 280), 0xffc36e],
      [new Phaser.Geom.Rectangle(1295, 250, 320, 250), 0x8fe6d1],
      [new Phaser.Geom.Rectangle(760, 720, 320, 220), 0x9cdeb5],
    ]
    areas.forEach(([r, color]) => {
      m.fillStyle(color, 0.55)
      m.fillRect(x + r.x * sx, y + r.y * sy, Math.max(3, r.width * sx), Math.max(3, r.height * sy))
    })
    const cam = this.cameras.main.worldView
    m.lineStyle(1, 0xffffff, 0.75)
    m.strokeRect(x + cam.x * sx, y + cam.y * sy, cam.width * sx, cam.height * sy)
    m.fillStyle(0xff91ce, 1)
    m.fillCircle(x + this.player.x * sx, y + this.player.y * sy, 3)
  }

  private refreshUI() {
    const ch = this.currentChapter()
    this.ui.setText(`Ch ${ch.n + 1}: ${ch.title.replace(/^Chapter \d+: /, '').replace(/^Finale: /, '')}  |  Wood ${this.total.wood}/${GOAL.wood} Herb ${this.total.herbs}/${GOAL.herbs} Fish ${this.total.fish}/${GOAL.fish} Bloom ${this.total.blooms}/${GOAL.blooms}`)
    this.objective.setText(`${ch.objective}\nH: journal   ♡ ${this.inv.hearts}/${GOAL.hearts}  Decor ${this.decorPlaced}/${GOAL.decorPlaced}  Mem ${this.inv.memories}/${GOAL.memories}`)
  }

  private say(text: string) {
    this.toast.setText(text)
    this.tweens.killTweensOf(this.toast)
    this.toast.setAlpha(1)
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 2600, duration: 700 })
  }

  private pulse(target?: Phaser.GameObjects.GameObject) {
    if (!target) return
    this.tweens.add({ targets: target, scaleX: 1.12, scaleY: 1.12, yoyo: true, duration: 100 })
  }

  private floatText(target: Phaser.GameObjects.GameObject, text: string) {
    const anyTarget = target as unknown as { x: number, y: number }
    const t = this.add.text(anyTarget.x, anyTarget.y - 36, text, { fontFamily: 'monospace', fontSize: '14px', color: '#fff3ba', stroke: '#1b1112', strokeThickness: 3 }).setOrigin(0.5).setDepth(20)
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 850, onComplete: () => t.destroy() })
  }

  private memory(x: number, y: number, title: string, message: string) {
    const c = this.add.container(x, y).setDepth(5)
    c.add(this.add.image(0, 0, 'cozy-memory').setScale(1))
    c.add(this.add.text(0, -11, title, { fontFamily: 'monospace', fontSize: '12px', color: '#fff3ba', align: 'center', stroke: '#21131a', strokeThickness: 3 }).setOrigin(0.5))
    c.add(this.add.text(0, 13, 'press E', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd7ed', stroke: '#21131a', strokeThickness: 3 }).setOrigin(0.5))
    const marker = this.add.image(x, y - 42, 'cozy-memory-sparkle').setScale(0.85).setDepth(7)
    this.tweens.add({ targets: marker, y: y - 52, alpha: 0.55, yoyo: true, repeat: -1, duration: 950 })
    this.items.push({ kind: 'memory', name: title, zone: new Phaser.Geom.Rectangle(x - 61, y - 45, 122, 86), sprite: c, marker, message })
  }

  private tree(x: number, y: number) {
    return this.asset('tree', x, y, 0.9).setDepth(4)
  }

  private flower(x: number, y: number) {
    return this.asset('herb', x, y, 1).setDepth(4)
  }

  private person(x: number, y: number, _skin: number, _hairColor: number, _shirt: number, badge: string) {
    const p = this.add.container(x, y).setDepth(10)
    p.add(this.add.ellipse(0, 19, 30, 10, 0x000000, 0.22))
    const sprite = this.add.image(0, 0, badge === 'B' ? 'cozy-player' : 'cozy-noot').setScale(1.65)
    p.add(sprite)
    if (badge === 'B') this.playerSprite = sprite
    if (badge === 'Noot') {
      p.add(this.add.text(0, -42, 'Noot', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd7ed', stroke: '#21131a', strokeThickness: 3 }).setOrigin(0.5))
      this.items.push({ kind: 'wife', name: 'Noot', zone: new Phaser.Geom.Rectangle(x - 48, y - 62, 96, 124) })
      this.block(x, y + 10, 34, 24)
    }
    return p
  }

  private cat(x: number, y: number, _color: number, name: string) {
    const c = this.add.container(x, y).setDepth(9)
    c.add(this.add.ellipse(2, 18, 32, 9, 0x000000, 0.18))
    const pet = this.add.image(0, 0, name === 'Pengu' ? 'cozy-cat-pengu' : 'cozy-cat-mila').setScale(1.45)
    c.add(pet)
    c.add(this.add.text(-16, 22, name, { fontFamily: 'monospace', fontSize: '10px', color: '#fff', stroke: '#1b1112', strokeThickness: 3 }))
    return c
  }

  private followCats(delta: number) {
    const follow = (cat: Phaser.GameObjects.Container | undefined, dist: number) => {
      if (!cat?.visible) return
      cat.x += (this.player.x - dist - cat.x) * 0.0025 * delta
      cat.y += (this.player.y + 34 - cat.y) * 0.0025 * delta
    }
    follow(this.pengu, 50)
    follow(this.mila, 88)
  }

  private animateWorld(delta: number) {
    this.fireflies.forEach((f, i) => {
      f.x += Math.sin((this.time.now + i * 177) / 800) * 0.012 * delta
      f.y += Math.cos((this.time.now + i * 131) / 900) * 0.010 * delta
    })
  }

  private restartGame() {
    try { localStorage.removeItem(SAVE_KEY) } catch {}
    this.scene.restart()
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: VIEW_W,
  height: VIEW_H,
  pixelArt: true,
  backgroundColor: '#142820',
  scene: Bb2DScene,
}

new Phaser.Game(config)
