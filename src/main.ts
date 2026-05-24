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
const WORLD_W = 1920
const WORLD_H = 1280
const GOAL = { wood: 8, herbs: 5, fish: 4, blooms: 4, hearts: 6, decorPlaced: 8, memories: 5 }

class Bb2DScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Sprite
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

  constructor() { super('bb2d') }

  preload() {
    this.load.spritesheet('tiny-town', 'kenney/tiny-town.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('player-sheet', 'ninja/characters/player.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('b-sheet', 'ninja/characters/b.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('pet-sheet', 'ninja/pets/pet-dog.png', { frameWidth: 16, frameHeight: 16 })
    this.load.image('pet-pengu', 'kenney/pengu.png')
    this.load.image('pet-mila', 'kenney/mila.png')
  }

  create() {
    this.items = []
    this.fireflies = []
    this.cameras.main.setBackgroundColor('#142820')
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    this.drawWorld()
    this.createAnimations()
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
      this.playerSprite.play(`player-${this.facing}`, true)
    } else {
      this.playerSprite.stop()
    }

    this.player.x = Phaser.Math.Clamp(this.player.x + dx, 32, WORLD_W - 32)
    this.player.y = Phaser.Math.Clamp(this.player.y + dy, 82, WORLD_H - 32)
    this.updatePrompt()
    this.updateAreaLabel()
    this.followCats(delta)
  }

  private createAnimations() {
    const make = (sheet: string, prefix: string) => {
      const rows: Record<'down' | 'up' | 'left' | 'right', number> = { down: 0, up: 1, left: 2, right: 3 }
      Object.entries(rows).forEach(([dir, row]) => {
        this.anims.create({
          key: `${prefix}-${dir}`,
          frames: this.anims.generateFrameNumbers(sheet, { start: row * 4, end: row * 4 + 3 }),
          frameRate: 7,
          repeat: -1,
        })
      })
    }
    make('player-sheet', 'player')
    make('b-sheet', 'b')
    this.anims.create({ key: 'pet-walk', frames: this.anims.generateFrameNumbers('pet-sheet', { start: 0, end: 1 }), frameRate: 4, repeat: -1 })
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

  private tile(frame: number, x: number, y: number, scale = 2) {
    return this.add.image(x, y, 'tiny-town', frame).setScale(scale)
  }

  private paint(frame: number, x: number, y: number, w: number, h: number, scale = 2, variants: number[] = []) {
    const step = 16 * scale
    for (let px = x + step / 2; px < x + w; px += step) {
      for (let py = y + step / 2; py < y + h; py += step) {
        const f = variants.length ? Phaser.Utils.Array.GetRandom([frame, ...variants]) : frame
        this.tile(f, px, py, scale).setDepth(0)
      }
    }
  }

  private sign(x: number, y: number, label: string) {
    const s = this.add.container(x, y).setDepth(4)
    s.add(this.add.image(0, 0, 'tiny-town', 89).setScale(2.2))
    s.add(this.add.text(0, -6, label, { fontFamily: 'monospace', fontSize: '11px', color: '#fff3ba', align: 'center', stroke: '#2a1a1e', strokeThickness: 3 }).setOrigin(0.5))
    return s
  }

  private zone(x: number, y: number, w: number, h: number, color: number, label: string, lx: number, ly: number) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.12).setStrokeStyle(2, 0xffffff, 0.10).setDepth(1)
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
    const g = this.add.graphics().setDepth(-2)
    g.fillGradientStyle(0x17342b, 0x17342b, 0x275442, 0x275442, 1)
    g.fillRect(0, 0, WORLD_W, WORLD_H)

    this.paint(0, 0, 64, WORLD_W, WORLD_H - 64, 2, [0, 1, 1])
    this.path([[1480, 940], [1260, 860], [1040, 665], [820, 620], [620, 775], [360, 890]])
    this.path([[1040, 665], [1190, 430], [1540, 300]])
    this.path([[1040, 665], [850, 400], [540, 260]])

    this.zone(110, 130, 520, 410, 0x315f43, 'Moon Forest', 210, 164)
    this.paint(0, 130, 170, 480, 330, 2, [1])

    this.zone(1240, 150, 520, 360, 0x2b7890, 'Quiet Pond', 1358, 185)
    this.paint(12, 1280, 205, 420, 250, 2, [13, 24])
    this.add.circle(1510, 330, 150, 0x4db2c7, 0.18).setDepth(2)
    this.add.circle(1510, 330, 96, 0x82dbef, 0.16).setDepth(2)
    this.tile(84, 1442, 438, 3).setDepth(3)

    this.zone(210, 820, 510, 300, 0x84613c, 'Garden', 300, 850)
    this.paint(12, 255, 880, 430, 175, 2, [13, 24])

    this.zone(1260, 780, 480, 340, 0x8b6d4c, 'Home Base', 1378, 820)
    this.paint(60, 1305, 855, 380, 210, 2, [61])
    this.tile(43, 1480, 890, 5).setDepth(3)
    this.tile(51, 1480, 990, 5).setDepth(3)
    this.tile(96, 1410, 1000, 3).setDepth(3)

    this.zone(870, 520, 330, 260, 0x44376a, 'Memory Shrine', 926, 548)
    this.tile(88, 1038, 662, 4).setDepth(3)

    this.zone(405, 190, 300, 180, 0x324b66, 'University', 500, 220)
    this.zone(690, 910, 300, 180, 0x5d3768, 'Rave Night', 774, 938)
    this.zone(1510, 560, 300, 180, 0x6a5130, 'Dubai → Canada', 1572, 590)
    this.zone(1020, 990, 300, 170, 0x315b62, 'Kitchen Date', 1095, 1018)

    for (let i = 0; i < 42; i++) {
      const dot = this.add.circle(Phaser.Math.Between(90, WORLD_W - 90), Phaser.Math.Between(120, WORLD_H - 90), 2, 0xffe58a, 0.35).setDepth(6)
      this.fireflies.push(dot)
    }

    // Border trees make the world feel enclosed without adding collision headaches.
    for (let i = 0; i < 24; i++) {
      this.tile(5, Phaser.Math.Between(30, WORLD_W - 30), Phaser.Utils.Array.GetRandom([92, WORLD_H - 42]), 2.5).setAlpha(0.75).setDepth(2)
    }
  }

  private addInteractiveItems() {
    const treeSpots = [
      [205,240],[320,205],[455,250],[555,345],[255,420],[415,455],[150,350],[590,200],
      [650,720],[780,700],[1115,475],[1215,585],[1715,790],[1800,1040]
    ]
    treeSpots.forEach(([x, y]) => {
      const sprite = this.tree(x, y)
      this.items.push({ kind: 'tree', name: 'soft pine', zone: new Phaser.Geom.Rectangle(x - 30, y - 42, 60, 78), cooldown: 0, sprite })
    })

    ;[[520,465],[350,375],[210,500],[960,720],[1140,720],[1040,1030],[1680,660],[610,1015]].forEach(([x, y]) => {
      const sprite = this.flower(x, y)
      this.items.push({ kind: 'herb', name: 'wellness herbs', zone: new Phaser.Geom.Rectangle(x - 28, y - 28, 56, 56), cooldown: 0, sprite })
    })

    for (let i = 0; i < 8; i++) {
      const x = 300 + (i % 4) * 90
      const y = 930 + Math.floor(i / 4) * 70
      const crop = this.tile(12, x, y, 2.4)
      this.add.ellipse(x, y + 22, 56, 10, 0x3d291b, 0.35).setDepth(2)
      this.items.push({ kind: 'crop', name: 'garden plot', zone: new Phaser.Geom.Rectangle(x - 34, y - 28, 68, 56), sprite: crop, stage: 0 })
    }

    this.items.push({ kind: 'pond', name: 'fishing spot', zone: new Phaser.Geom.Rectangle(1240, 150, 520, 360), cooldown: 0 })
    this.items.push({ kind: 'puzzle', name: 'match-3 memory shrine', zone: new Phaser.Geom.Rectangle(870, 520, 330, 260) })
    this.items.push({ kind: 'house', name: 'home base', zone: new Phaser.Geom.Rectangle(1260, 780, 480, 340) })

    this.memory(560, 285, 'University', 'Years of almost, then timing finally got smart.')
    this.memory(835, 1012, 'Rave Night', 'Somebody bumped you together. Best collision physics ever.')
    this.memory(1660, 640, 'Dubai Year', 'New city, new rhythm, same team.')
    this.memory(1515, 1070, 'Canada Home', 'Back home, building the next chapter soft and loud.')
    this.memory(1165, 1088, 'Kitchen Date', 'Food, wellness, chaos, and somehow exactly the right life.')
  }

  private addCharacters() {
    this.person(1530, 925, 0xf7d7bd, 0x2a201e, 0xff91ce, 'B')
    this.player = this.person(1460, 1005, 0xb87555, 0x17110f, 0x1d2430, 'N')
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
    this.refreshUI()
    this.updateAreaLabel()
  }

  private showIntro() {
    this.overlay = this.add.container(0, 0).setName('intro').setScrollFactor(0).setDepth(120)
    this.overlay.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.88).setScrollFactor(0))
    this.overlay.add(this.add.text(480, 108, 'Bb2D', { fontFamily: 'monospace', fontSize: '58px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    this.overlay.add(this.add.text(480, 164, 'A tiny cozy game about building home together.', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0))
    this.overlay.add(this.add.text(480, 268,
      'The world is bigger now: wander, follow paths, collect memories,\nfish at the pond, grow the garden, decorate your home,\nand bring Pengu and Mila along for the ending.\n\nMove: WASD/arrows   E: interact   F: fish   P: puzzle   B: decorate\n\nPress Enter or Space to start.',
      { fontFamily: 'monospace', fontSize: '16px', color: '#dfffe1', align: 'center', lineSpacing: 8 }
    ).setOrigin(0.5).setScrollFactor(0))
  }

  private dismissOverlay() {
    if (this.overlay && !this.inPuzzle) {
      this.overlay.destroy(true)
      this.overlay = undefined
      this.gameStarted = true
      this.say('Follow the paths. Prepare home, collect memories, then talk to B.')
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
    this.inv[res]++
    this.total[res]++
    item.cooldown = now + 950
    this.pulse(item.sprite)
    this.floatText(item.sprite ?? this.player, res === 'wood' ? '+wood' : '+herb')
    this.say(res === 'wood' ? '+1 wood. Future furniture, obviously.' : '+1 herb. Wellness inventory upgraded.')
    this.refreshUI()
  }

  private tendCrop(item: WorldItem) {
    item.stage = Math.min((item.stage ?? 0) + 1, 3)
    if (item.sprite instanceof Phaser.GameObjects.Image) item.sprite.setFrame([12, 25, 26, 27][item.stage])
    if (item.stage === 3) {
      this.inv.blooms++
      this.total.blooms++
      item.stage = 0
      this.time.delayedCall(250, () => { if (item.sprite instanceof Phaser.GameObjects.Image) item.sprite.setFrame(12) })
      this.floatText(item.sprite ?? this.player, '+bloom')
      this.say('+1 bloom. Garden delivered.')
    } else {
      this.say(item.stage === 1 ? 'Seeds planted.' : 'Watered. Almost blooming.')
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
    this.inv.fish++
    this.total.fish++
    const fishIcon = this.add.text(this.player.x + 12, this.player.y - 42, '🐟', { fontSize: '24px' }).setDepth(20)
    this.tweens.add({ targets: fishIcon, y: fishIcon.y - 28, alpha: 0, duration: 900, onComplete: () => fishIcon.destroy() })
    this.say('+1 fish. Quiet pond, good luck.')
    this.refreshUI()
  }

  private collectMemory(item: WorldItem) {
    if (item.collected) return this.say(item.message ?? 'Already remembered.')
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
    if (this.decorPlaced >= GOAL.decorPlaced) return this.say('The home is fully decorated. Talk to B when the goals are done.')
    if (this.inv.decor <= 0 && (this.inv.wood < 2 || this.inv.herbs < 1 || this.inv.fish < 1)) {
      return this.say('Need 1 decor token or 2 wood + 1 herb + 1 fish.')
    }
    if (this.inv.decor > 0) this.inv.decor--
    else { this.inv.wood -= 2; this.inv.herbs--; this.inv.fish-- }
    this.decorPlaced++
    const spots = [[1360,925],[1420,910],[1505,930],[1580,925],[1345,1015],[1430,1032],[1530,1010],[1620,1030]]
    const [x, y] = spots[this.decorPlaced - 1]
    this.add.star(x, y, 5, 7, 18, Phaser.Display.Color.RandomRGB(180, 255).color).setStrokeStyle(2, 0x513246).setDepth(5)
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
    overlay.add(this.add.text(480, 112, 'Click adjacent tiles. Every match gives +1 heart and +1 decor. ESC closes.', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0))

    const pattern = [
      ['🎧', '🎧', '🌲', '🎧', '🐟'],
      ['🌸', '🐟', '🥟', '🌲', '🎧'],
      ['🥟', '🌸', '🎧', '🐟', '🌲'],
      ['🎧', '🥟', '🌸', '🌲', '🐟'],
      ['🐟', '🌲', '🎧', '🥟', '🌸'],
    ]
    const board: Phaser.GameObjects.Text[][] = []
    const boxes: Phaser.GameObjects.Rectangle[][] = []
    let selected: { r: number, c: number } | null = null

    const resetBoard = () => {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) board[r][c].setText(pattern[r][c])
    }
    const resolve = () => {
      const matched: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(false))
      let found = false
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        const v = board[r][c].text
        if (v === board[r][c + 1].text && v === board[r][c + 2].text) { matched[r][c] = matched[r][c + 1] = matched[r][c + 2] = true; found = true }
      }
      for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) {
        const v = board[r][c].text
        if (v === board[r + 1][c].text && v === board[r + 2][c].text) { matched[r][c] = matched[r + 1][c] = matched[r + 2][c] = true; found = true }
      }
      if (!found) return false
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (matched[r][c]) {
        board[r][c].setText('✨')
        this.tweens.add({ targets: board[r][c], scale: 1.3, yoyo: true, duration: 120 })
      }
      this.time.delayedCall(220, resetBoard)
      this.inv.decor++
      this.inv.hearts++
      this.checkUnlocks()
      this.refreshUI()
      this.say('Memory match made. +1 decor, +1 heart.')
      return true
    }
    const setSelected = (r: number, c: number) => {
      boxes.flat().forEach(b => b.setStrokeStyle(2, 0xffe7a8))
      boxes[r][c].setStrokeStyle(4, 0xff91ce)
      selected = { r, c }
    }
    for (let r = 0; r < 5; r++) {
      board[r] = []
      boxes[r] = []
      for (let c = 0; c < 5; c++) {
        const x = 330 + c * 62
        const y = 162 + r * 62
        const bg = this.add.rectangle(x, y, 54, 54, 0x293a52).setStrokeStyle(2, 0xffe7a8).setInteractive().setScrollFactor(0)
        const t = this.add.text(x, y, pattern[r][c], { fontFamily: 'sans-serif', fontSize: '28px' }).setOrigin(0.5).setInteractive().setScrollFactor(0)
        overlay.add([bg, t])
        boxes[r][c] = bg
        board[r][c] = t
        const click = () => {
          if (!selected) return setSelected(r, c)
          const adj = Math.abs(selected.r - r) + Math.abs(selected.c - c) === 1
          if (!adj) return setSelected(r, c)
          const a = board[selected.r][selected.c].text
          board[selected.r][selected.c].setText(board[r][c].text)
          board[r][c].setText(a)
          if (!resolve()) {
            board[r][c].setText(board[selected.r][selected.c].text)
            board[selected.r][selected.c].setText(a)
            this.say('No match. Try another swap.')
          }
          selected = null
          boxes.flat().forEach(b => b.setStrokeStyle(2, 0xffe7a8))
        }
        bg.on('pointerdown', click)
        t.on('pointerdown', click)
      }
    }
    overlay.add(this.add.text(480, 505, 'Hint: swap the tree between the headphones with the headphone on its right. 🎧', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd7ed' }).setOrigin(0.5).setScrollFactor(0))
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
    this.endingShown = true
    const end = this.add.container(0, 0).setDepth(130).setScrollFactor(0)
    end.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.93).setScrollFactor(0))
    end.add(this.add.text(480, 88, 'Home Complete', { fontFamily: 'monospace', fontSize: '42px', color: '#ffe7a8' }).setOrigin(0.5).setScrollFactor(0))
    end.add(this.add.text(480, 190,
      'From university hallways to rave lights,\nfrom DJ nights to Dubai days,\nfrom Canada again to whatever comes next...\n\nWe keep building the soft little world.\nOne memory, one meal, one cat hair, one home at a time.\n\nHappy everything, B. ♡',
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
      ['Moon Forest', new Phaser.Geom.Rectangle(110, 130, 520, 410)],
      ['Quiet Pond', new Phaser.Geom.Rectangle(1240, 150, 520, 360)],
      ['Garden', new Phaser.Geom.Rectangle(210, 820, 510, 300)],
      ['Home Base', new Phaser.Geom.Rectangle(1260, 780, 480, 340)],
      ['Memory Shrine', new Phaser.Geom.Rectangle(870, 520, 330, 260)],
      ['University', new Phaser.Geom.Rectangle(405, 190, 300, 180)],
      ['Rave Night', new Phaser.Geom.Rectangle(690, 910, 300, 180)],
      ['Dubai → Canada', new Phaser.Geom.Rectangle(1510, 560, 300, 180)],
      ['Kitchen Date', new Phaser.Geom.Rectangle(1020, 990, 300, 170)],
    ]
    const area = areas.find(([, r]) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y))?.[0] ?? 'Wandering the soft little world'
    this.areaLabel.setText(area)
  }

  private refreshUI() {
    this.ui.setText(`W ${this.total.wood}/${GOAL.wood}  H ${this.total.herbs}/${GOAL.herbs}  F ${this.total.fish}/${GOAL.fish}  Bl ${this.total.blooms}/${GOAL.blooms}  ♡ ${this.inv.hearts}/${GOAL.hearts}  Dec ${this.decorPlaced}/${GOAL.decorPlaced}  Mem ${this.inv.memories}/${GOAL.memories}`)
    const missing = this.missingGoals()
    this.objective.setText(missing.length ? `Goal: prepare home\nNeed: ${missing.slice(0, 2).join(', ')}` : 'Goal ready:\ntalk to B')
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
    c.add(this.add.image(0, 0, 'tiny-town', 89).setScale(3))
    c.add(this.add.text(0, -11, title, { fontFamily: 'monospace', fontSize: '12px', color: '#fff3ba', align: 'center', stroke: '#21131a', strokeThickness: 3 }).setOrigin(0.5))
    c.add(this.add.text(0, 13, 'press E', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd7ed', stroke: '#21131a', strokeThickness: 3 }).setOrigin(0.5))
    this.items.push({ kind: 'memory', name: title, zone: new Phaser.Geom.Rectangle(x - 61, y - 29, 122, 58), sprite: c, message })
  }

  private tree(x: number, y: number) {
    return this.tile(5, x, y, 2.8).setDepth(4)
  }

  private flower(x: number, y: number) {
    return this.tile(1, x, y, 2.2).setDepth(4)
  }

  private person(x: number, y: number, _skin: number, _hairColor: number, _shirt: number, badge: string) {
    const p = this.add.container(x, y).setDepth(10)
    p.add(this.add.ellipse(0, 19, 30, 10, 0x000000, 0.22))
    const sheet = badge === 'B' ? 'b-sheet' : 'player-sheet'
    const sprite = this.add.sprite(0, 0, sheet, 0).setScale(2.25)
    p.add(sprite)
    if (badge === 'N') this.playerSprite = sprite
    if (badge === 'B') {
      sprite.play('b-down')
      p.add(this.add.text(0, -42, 'B', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd7ed', stroke: '#21131a', strokeThickness: 3 }).setOrigin(0.5))
      this.items.push({ kind: 'wife', name: 'B', zone: new Phaser.Geom.Rectangle(x - 40, y - 52, 80, 104) })
    }
    return p
  }

  private cat(x: number, y: number, _color: number, name: string) {
    const c = this.add.container(x, y).setDepth(9)
    c.add(this.add.ellipse(2, 13, 24, 7, 0x000000, 0.18))
    const pet = this.add.sprite(0, 0, 'pet-sheet', name === 'Pengu' ? 0 : 1).setScale(1.25)
    pet.play('pet-walk')
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
