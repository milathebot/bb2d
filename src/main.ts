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

const VIEW_W = 960
const VIEW_H = 640
const WORLD_W = 2400
const WORLD_H = 1600
const GOAL = { wood: 10, herbs: 6, fish: 5, blooms: 6, hearts: 7, decorPlaced: 9, memories: 6 }

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
  private audio = new AudioKit()

  constructor() { super('bb2d') }

  preload() {
    ;[
      'player','noot','cat-pengu','cat-mila','tree','herb','crop0','crop1','crop2','crop3','house','shrine','sign','memory','decor','fish',
      'university','dj-booth','skyline','kitchen','pond-detail','garden-bed','forest-detail','home-detail','lamp','bench',
      'tile-grass','tile-forest','tile-dirt','tile-water','tile-wood','heart-decor','home-rug',
      'water-sheet','water-ripple','waterfall','farm-soil0','farm-soil1','farm-tool',
      'farm-crop0','farm-crop1','farm-crop2','farm-crop3','farm-crop4','farm-crop5'
    ].forEach(name => this.load.image(`cozy-${name}`, `gif/${name}.png`))
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
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,F,P,B,R,ENTER,SPACE,ESC') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard!.on('keydown-ENTER', () => this.dismissOverlay())
    this.input.keyboard!.on('keydown-SPACE', () => this.dismissOverlay())
    this.input.keyboard!.on('keydown-E', () => this.interact())
    this.input.keyboard!.on('keydown-F', () => this.fish())
    this.input.keyboard!.on('keydown-P', () => this.openPuzzle())
    this.input.keyboard!.on('keydown-B', () => this.decorate())
    this.input.keyboard!.on('keydown-R', () => this.restartGame())
    this.input.keyboard!.on('keydown-ESC', () => this.closePuzzle())
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

  private tiled(name: string, x: number, y: number, w: number, h: number, scale = 2, alpha = 1) {
    return this.add.tileSprite(x + w / 2, y + h / 2, w, h, `cozy-${name}`).setTileScale(scale).setAlpha(alpha).setDepth(-1)
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

  private zone(x: number, y: number, w: number, h: number, color: number, label: string, lx: number, ly: number) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.10).setStrokeStyle(2, 0xfff1bd, 0.10).setDepth(1)
    this.sign(lx, ly, label)
  }

  private path(points: [number, number][]) {
    const g = this.add.graphics().setDepth(1)
    g.lineStyle(40, 0x8a6842, 0.22)
    g.beginPath()
    g.moveTo(points[0][0], points[0][1])
    points.slice(1).forEach(([x, y]) => g.lineTo(x, y))
    g.strokePath()
    g.lineStyle(24, 0xd2b07c, 0.35)
    g.beginPath()
    g.moveTo(points[0][0], points[0][1])
    points.slice(1).forEach(([x, y]) => g.lineTo(x, y))
    g.strokePath()
  }

  private drawWorld() {
    const g = this.add.graphics().setDepth(-4)
    g.fillGradientStyle(0x10231d, 0x142820, 0x2c573f, 0x214335, 1)
    g.fillRect(0, 0, WORLD_W, WORLD_H)

    // Base ground plus uneven terrain patches so the world stops reading as wallpaper.
    this.tiled('tile-grass', 0, 64, WORLD_W, WORLD_H - 64, 2.7, 0.50)
    ;[
      ['tile-forest', 40, 120, 760, 560, 2.5, 0.74],
      ['tile-dirt', 1230, 1075, 850, 470, 2.2, 0.66],
      ['tile-wood', 1690, 1100, 610, 420, 2.15, 0.52],
      ['tile-dirt', 650, 1240, 540, 280, 2.1, 0.38],
      ['tile-forest', 980, 260, 520, 330, 2.4, 0.40],
    ].forEach(([name, x, y, w, h, sc, a]) => this.tiled(name as string, x as number, y as number, w as number, h as number, sc as number, a as number))

    // Real water sheets from the pack, not a blue rectangle pretending to be a pond.
    this.add.tileSprite(1970, 315, 640, 390, 'cozy-water-sheet').setTileScale(2.4).setDepth(0).setAlpha(0.95)
    this.add.tileSprite(1970, 315, 600, 350, 'cozy-water-ripple').setTileScale(3.5).setDepth(1).setAlpha(0.35)
    this.asset('waterfall', 1695, 210, 2.2).setDepth(3)
    this.block(1970, 315, 650, 390)

    // Navigable path network with detours. Areas are scattered, home+garden are paired.
    this.path([[1920, 1325], [1650, 1320], [1420, 1290], [1180, 1110], [995, 870], [845, 580], [600, 390]])
    this.path([[995, 870], [1240, 760], [1460, 600], [1705, 420], [1910, 320]])
    this.path([[1180, 1110], [860, 1260], [620, 1395], [430, 1440]])
    this.path([[845, 580], [1030, 350], [1270, 360]])
    this.path([[1650, 1320], [1860, 1030], [2055, 850], [2210, 690]])

    this.zone(70, 135, 670, 500, 0x183f2d, 'Moon Forest', 190, 178)
    this.asset('forest-detail', 390, 405, 1.9).setDepth(3)
    ;[[145,235],[245,520],[390,245],[560,355],[655,545],[300,390],[690,205],[105,520]].forEach(([x,y]) => this.blockingAsset('tree', x, y, 1.15, 52, 46, 20).setDepth(4))
    this.add.text(500, 190, 'quiet trail', { fontFamily: 'monospace', fontSize: '13px', color: '#dfffe1', stroke: '#122019', strokeThickness: 3 }).setDepth(5)

    this.zone(1640, 110, 670, 460, 0x1f6880, 'Quiet Pond', 1760, 154)
    this.asset('pond-detail', 2020, 360, 2.2).setDepth(3)
    this.add.rectangle(1888, 522, 205, 34, 0x9a7044, 0.95).setDepth(4)
    this.add.rectangle(1888, 521, 170, 14, 0xd3a66b, 0.95).setDepth(4)
    this.block(1888, 522, 210, 38)
    this.blockingAsset('bench', 2180, 488, 1.25, 74, 32, 8).setDepth(4)

    this.zone(1290, 1110, 410, 360, 0x7b5935, 'Garden', 1390, 1148)
    this.asset('garden-bed', 1492, 1308, 2.35).setDepth(2)
    this.blockingAsset('lamp', 1345, 1188, 1.25, 32, 34, 12).setDepth(4)
    this.blockingAsset('farm-tool', 1640, 1192, 1.25, 34, 34, 0).setDepth(4)

    this.zone(1720, 1120, 580, 390, 0x7d6042, 'Home Base', 1848, 1160)
    this.blockingAsset('house', 1920, 1240, 1.75, 142, 96, 28).setDepth(4)
    this.blockingAsset('home-detail', 2095, 1320, 1.95, 110, 66, 18).setDepth(4)
    this.asset('home-rug', 1835, 1400, 1.25).setDepth(4)
    this.blockingAsset('bench', 1745, 1430, 1.2, 72, 32, 8).setDepth(4)
    this.blockingAsset('lamp', 2210, 1385, 1.25, 32, 34, 12).setDepth(4)

    this.zone(910, 720, 440, 340, 0x44376a, 'Memory Shrine', 1000, 760)
    this.blockingAsset('shrine', 1160, 890, 1.65, 86, 70, 18).setDepth(4)
    this.asset('heart-decor', 1065, 940, 0.9).setDepth(4)
    this.blockingAsset('lamp', 960, 950, 1.05, 28, 32, 10).setDepth(4)
    this.blockingAsset('lamp', 1305, 950, 1.05, 28, 32, 10).setDepth(4)

    this.zone(760, 160, 480, 300, 0x324b66, 'University', 885, 202)
    this.blockingAsset('university', 1005, 345, 1.55, 170, 92, 28).setDepth(3)
    this.add.rectangle(1010, 425, 360, 18, 0xb8c7d9, 0.35).setDepth(3)
    ;[[830,410],[1170,410],[795,250],[1210,250]].forEach(([x,y]) => this.blockingAsset('lamp', x, y, 0.95, 26, 30, 10).setDepth(4))

    this.zone(235, 1280, 460, 260, 0x5d3768, 'Rave Night', 350, 1320)
    this.blockingAsset('dj-booth', 480, 1420, 1.65, 90, 50, 14).setDepth(4)
    ;[[285,1380],[650,1380],[380,1300],[560,1300]].forEach(([x,y], i) => {
      const beam = this.add.triangle(x, y, 0, 0, i % 2 ? -55 : 55, 115, i % 2 ? 45 : -45, 115, i % 2 ? 0x61d4ff : 0xff69b4, 0.24).setDepth(3)
      this.tweens.add({ targets: beam, alpha: 0.08, yoyo: true, repeat: -1, duration: 900 + i * 160 })
    })

    this.zone(2020, 610, 350, 300, 0x6a5130, 'Dubai → Canada', 2115, 650)
    this.blockingAsset('skyline', 2210, 770, 1.45, 120, 62, 18).setDepth(3)
    this.add.text(2180, 900, 'same team, new skyline', { fontFamily: 'monospace', fontSize: '13px', color: '#fff3ba', stroke: '#2a1a1e', strokeThickness: 3 }).setOrigin(0.5).setDepth(5)

    this.zone(1050, 300, 360, 260, 0x315b62, 'Kitchen Date', 1145, 338)
    this.blockingAsset('kitchen', 1250, 455, 1.85, 90, 62, 16).setDepth(4)
    this.asset('heart-decor', 1110, 475, 0.85).setDepth(4)

    this.zone(1160, 560, 320, 220, 0x315b46, 'Cat Grove', 1240, 595)
    this.blockingAsset('tree2', 1310, 705, 1.25, 54, 42, 18).setDepth(4)
    this.asset('heart-decor', 1215, 700, 0.72).setDepth(4)

    for (let i = 0; i < 75; i++) {
      const dot = this.add.circle(Phaser.Math.Between(90, WORLD_W - 90), Phaser.Math.Between(120, WORLD_H - 90), Phaser.Math.Between(1, 3), 0xffe58a, Phaser.Math.FloatBetween(0.16, 0.45)).setDepth(6)
      this.fireflies.push(dot)
    }

    for (let i = 0; i < 34; i++) {
      const x = Phaser.Math.Between(45, WORLD_W - 45)
      const y = Phaser.Utils.Array.GetRandom([105, WORLD_H - 54, Phaser.Math.Between(640, 1040)])
      if ((x > 1180 && y > 1060) || (x > 1630 && y < 580)) continue
      this.blockingAsset(Phaser.Math.Between(0, 1) ? 'tree' : 'tree2', x, y, Phaser.Math.FloatBetween(0.72, 1.0), 44, 36, 18).setAlpha(0.78).setDepth(2)
    }
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
    this.items.push({ kind: 'puzzle', name: 'match-3 memory shrine', zone: new Phaser.Geom.Rectangle(910, 720, 440, 340) })
    this.items.push({ kind: 'house', name: 'home base', zone: new Phaser.Geom.Rectangle(1720, 1120, 580, 390) })

    this.memory(1005, 345, 'University', 'Years of almost, then timing finally got smart.')
    this.memory(480, 1420, 'Rave Night', 'Somebody bumped you together. Best collision physics ever.')
    this.memory(2210, 770, 'Dubai Year', 'New city, new rhythm, same team.')
    this.memory(1920, 1240, 'Canada Home', 'Back home, building the next chapter soft and loud.')
    this.memory(1250, 455, 'Kitchen Date', 'Food, wellness, cats, and somehow exactly the right life.')
    this.memory(1295, 700, 'Pengu & Mila', 'Two tiny supervisors joined the build and immediately improved management.')
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
    this.refreshUI()
    this.updateAreaLabel()
    this.updateMinimap()
  }

  private showIntro() {
    this.overlay = this.add.container(0, 0).setName('intro').setScrollFactor(0).setDepth(120)
    this.overlay.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.88).setScrollFactor(0))
    this.overlay.add(this.add.text(480, 108, 'Bb2D', { fontFamily: 'monospace', fontSize: '58px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    this.overlay.add(this.add.text(480, 164, 'A tiny cozy game about building home together.', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0))
    this.overlay.add(this.add.text(480, 268,
      'You are B. Wander the paths, collect memories,\nfish at the pond, grow the garden, decorate your home,\nand bring Pengu and Mila along for the ending.\n\nMove: WASD/arrows   E: interact   F: fish   P: puzzle   B: decorate\n\nPress Enter or Space to start.',
      { fontFamily: 'monospace', fontSize: '16px', color: '#dfffe1', align: 'center', lineSpacing: 8 }
    ).setOrigin(0.5).setScrollFactor(0))
  }

  private dismissOverlay() {
    if (this.overlay && !this.inPuzzle) {
      this.overlay.destroy(true)
      this.overlay = undefined
      this.audio.start()
      this.audio.blip('start')
      this.gameStarted = true
      this.say('Loop: gather, fish, garden, puzzle, decorate, collect memories, then talk to Noot.')
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
    const now = this.time.now
    if ((item.cooldown ?? 0) > now) return this.say(res === 'wood' ? 'This tree needs a breather.' : 'Those herbs need a moment to regrow.')
    this.audio.blip('gather')
    this.inv[res]++
    this.total[res]++
    item.cooldown = now + 950
    this.pulse(item.sprite)
    this.floatText(item.sprite ?? this.player, res === 'wood' ? '+wood' : '+herb')
    this.say(res === 'wood' ? '+1 wood. Future furniture, obviously.' : '+1 herb. Wellness inventory upgraded.')
    this.refreshUI()
  }

  private tendCrop(item: WorldItem) {
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
    this.refreshUI()
  }

  private fish() {
    if (!this.gameStarted || this.endingShown) return
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
    this.refreshUI()
  }

  private collectMemory(item: WorldItem) {
    if (item.collected) return this.say(item.message ?? 'Already remembered.')
    this.audio.blip('memory')
    item.collected = true
    this.inv.memories++
    this.inv.hearts++
    if (item.sprite instanceof Phaser.GameObjects.Container) item.sprite.setAlpha(0.55)
    this.say(`${item.name} remembered. +1 heart.`)
    this.showMemoryCard(item.name, item.message ?? '')
    this.checkUnlocks()
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
    if (!this.nearItem('house')) return this.say('Decorating happens at home. Press B inside the base.')
    if (this.decorPlaced >= GOAL.decorPlaced) return this.say('The home is fully decorated. Talk to Noot when the goals are done.')
    if (this.inv.decor <= 0 && (this.inv.wood < 2 || this.inv.herbs < 1 || this.inv.fish < 1)) {
      return this.say('Need 1 decor token or 2 wood + 1 herb + 1 fish.')
    }
    if (this.inv.decor > 0) this.inv.decor--
    else { this.inv.wood -= 2; this.inv.herbs--; this.inv.fish-- }
    this.audio.blip('decorate')
    this.decorPlaced++
    const spots = [[1785,1235],[1845,1210],[1915,1290],[2010,1260],[2115,1340],[1775,1405],[1870,1430],[2045,1425],[2200,1450]]
    const [x, y] = spots[this.decorPlaced - 1]
    this.asset('decor', x, y, 0.9).setDepth(5)
    this.say(`Decoration ${this.decorPlaced}/${GOAL.decorPlaced} placed.`)
    this.refreshUI()
  }

  private openPuzzle() {
    if (!this.gameStarted || this.endingShown) return
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
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (matched[r][c]) {
        board[r][c].setText('✨')
        this.tweens.add({ targets: board[r][c], scale: 1.3, alpha: 0.4, yoyo: true, duration: 120 })
      }
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
    const rewardMatch = () => {
      this.audio.blip('puzzle')
      this.inv.decor++
      this.inv.hearts++
      this.checkUnlocks()
      this.refreshUI()
      this.say('Memory match made. +1 decor, +1 heart.')
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
          rewardMatch()
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
    end.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.93).setScrollFactor(0))
    end.add(this.add.text(480, 88, 'Home Complete', { fontFamily: 'monospace', fontSize: '42px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    end.add(this.add.text(480, 190,
      'From university hallways to rave lights,\nfrom Dubai days to Canada home,\nfrom wellness walks to kitchen dates,\nfrom Pengu and Mila judging every choice...\n\nWe keep building the soft little world.\nOne memory, one meal, one cat hair, one home at a time.\n\nHappy everything, B. ♡',
      { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', align: 'center', lineSpacing: 9, wordWrap: { width: 760 } }
    ).setOrigin(0.5).setScrollFactor(0))
    end.add(this.add.text(480, 492, 'Press R to play again', { fontFamily: 'monospace', fontSize: '15px', color: '#ffd7ed' }).setOrigin(0.5).setScrollFactor(0))
    for (let i = 0; i < 26; i++) {
      const heart = this.add.text(Phaser.Math.Between(90, 870), Phaser.Math.Between(80, 570), Phaser.Utils.Array.GetRandom(['♡','✦','✿']), { fontSize: `${Phaser.Math.Between(14, 28)}px`, color: '#ffc6e9' }).setAlpha(0.55).setScrollFactor(0)
      end.add(heart)
      this.tweens.add({ targets: heart, y: heart.y - Phaser.Math.Between(12, 34), alpha: 0.15, yoyo: true, repeat: -1, duration: Phaser.Math.Between(1400, 2400) })
    }
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
    const base = 'WASD/arrows move  E interact  F fish  P puzzle  B decorate  R restart'
    this.prompt.setText(item ? `${base}\nNear: ${item.name}` : base)
  }

  private updateAreaLabel() {
    const p = this.player
    const areas: [string, Phaser.Geom.Rectangle][] = [
      ['Moon Forest', new Phaser.Geom.Rectangle(70, 135, 670, 500)],
      ['Quiet Pond', new Phaser.Geom.Rectangle(1640, 110, 670, 460)],
      ['Garden', new Phaser.Geom.Rectangle(1290, 1110, 410, 360)],
      ['Home Base', new Phaser.Geom.Rectangle(1720, 1120, 580, 390)],
      ['Memory Shrine', new Phaser.Geom.Rectangle(910, 720, 440, 340)],
      ['University', new Phaser.Geom.Rectangle(760, 160, 480, 300)],
      ['Rave Night', new Phaser.Geom.Rectangle(235, 1280, 460, 260)],
      ['Dubai → Canada', new Phaser.Geom.Rectangle(2020, 610, 350, 300)],
      ['Kitchen Date', new Phaser.Geom.Rectangle(1050, 300, 360, 260)],
      ['Cat Grove', new Phaser.Geom.Rectangle(1160, 560, 320, 220)],
    ]
    const area = areas.find(([, r]) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y))?.[0] ?? 'Wandering the soft little world'
    this.areaLabel.setText(area)
  }

  private nextObjective(missing: string[]) {
    if (this.inv.memories < GOAL.memories) return 'collect memory cards'
    if (this.total.wood < GOAL.wood || this.total.herbs < GOAL.herbs) return 'gather forest resources'
    if (this.total.fish < GOAL.fish) return 'fish at Quiet Pond'
    if (this.total.blooms < GOAL.blooms) return 'grow Garden blooms'
    if (this.inv.hearts < GOAL.hearts) return 'solve shrine matches'
    if (this.decorPlaced < GOAL.decorPlaced) return 'decorate Home Base'
    return missing[0] ?? 'talk to Noot'
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
      [new Phaser.Geom.Rectangle(1290, 1110, 410, 360), 0xc58a4b],
      [new Phaser.Geom.Rectangle(1720, 1120, 580, 390), 0xffd37a],
      [new Phaser.Geom.Rectangle(910, 720, 440, 340), 0xb38cff],
      [new Phaser.Geom.Rectangle(760, 160, 480, 300), 0x9fc7ff],
      [new Phaser.Geom.Rectangle(235, 1280, 460, 260), 0xff69b4],
      [new Phaser.Geom.Rectangle(2020, 610, 350, 300), 0xffc36e],
      [new Phaser.Geom.Rectangle(1050, 300, 360, 260), 0x8fe6d1],
      [new Phaser.Geom.Rectangle(1160, 560, 320, 220), 0x9cdeb5],
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
    this.ui.setText(`Wood ${this.total.wood}/${GOAL.wood}  Herb ${this.total.herbs}/${GOAL.herbs}  Fish ${this.total.fish}/${GOAL.fish}  Bloom ${this.total.blooms}/${GOAL.blooms}  ♡ ${this.inv.hearts}/${GOAL.hearts}  Decor ${this.decorPlaced}/${GOAL.decorPlaced}  Mem ${this.inv.memories}/${GOAL.memories}`)
    const missing = this.missingGoals()
    const next = this.nextObjective(missing)
    this.objective.setText(missing.length ? `Next: ${next}\nNeed: ${missing.slice(0, 2).join(', ')}` : 'Ready: talk to Noot\nat Home Base')
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
    this.items.push({ kind: 'memory', name: title, zone: new Phaser.Geom.Rectangle(x - 61, y - 29, 122, 58), sprite: c, message })
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
