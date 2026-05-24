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

const GOAL = { wood: 6, herbs: 4, fish: 3, blooms: 3, hearts: 5, decorPlaced: 6, memories: 4 }

class Bb2DScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private items: WorldItem[] = []
  private ui!: Phaser.GameObjects.Text
  private objective!: Phaser.GameObjects.Text
  private prompt!: Phaser.GameObjects.Text
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
    this.load.image('pet-pengu', 'kenney/pengu.png')
    this.load.image('pet-mila', 'kenney/mila.png')
  }

  create() {
    this.cameras.main.setBackgroundColor('#142820')
    this.drawWorld()
    this.addInteractiveItems()
    this.addCharacters()
    this.addUI()
    this.bindControls()
    this.showIntro()
  }

  update(_: number, delta: number) {
    this.animateWorld(delta)
    if (!this.gameStarted || this.inPuzzle || this.endingShown) return

    const speed = 0.17 * delta
    let dx = 0
    let dy = 0
    if (this.cursors.left?.isDown || this.keys.A.isDown) dx -= speed
    if (this.cursors.right?.isDown || this.keys.D.isDown) dx += speed
    if (this.cursors.up?.isDown || this.keys.W.isDown) dy -= speed
    if (this.cursors.down?.isDown || this.keys.S.isDown) dy += speed

    this.player.x = Phaser.Math.Clamp(this.player.x + dx, 28, 932)
    this.player.y = Phaser.Math.Clamp(this.player.y + dy, 74, 608)
    this.updatePrompt()
    this.followCats(delta)
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

  private tile(frame: number, x: number, y: number, scale = 2) {
    return this.add.image(x, y, 'tiny-town', frame).setScale(scale)
  }

  private paint(frame: number, x: number, y: number, w: number, h: number, scale = 2, variants: number[] = []) {
    const step = 16 * scale
    for (let px = x + step / 2; px < x + w; px += step) {
      for (let py = y + step / 2; py < y + h; py += step) {
        const f = variants.length ? Phaser.Utils.Array.GetRandom([frame, ...variants]) : frame
        this.tile(f, px, py, scale)
      }
    }
  }

  private drawWorld() {
    const g = this.add.graphics()
    g.fillGradientStyle(0x19372d, 0x19372d, 0x254f40, 0x254f40, 1)
    g.fillRect(0, 0, 960, 640)

    this.paint(0, 0, 64, 960, 576, 2, [1])

    this.zone(36, 82, 365, 230, 0x315f43, 'Moon Forest', 77, 94)
    this.paint(0, 48, 110, 335, 182, 2, [1])
    this.zone(608, 91, 286, 178, 0x2b7890, 'Quiet Pond', 650, 105)
    this.paint(12, 628, 120, 242, 118, 2, [13, 24])
    this.zone(86, 405, 315, 155, 0x84613c, 'Garden', 127, 418)
    this.paint(12, 105, 435, 270, 96, 2, [13, 24])
    this.zone(594, 360, 262, 188, 0x8b6d4c, 'Home Base', 653, 380)
    this.paint(60, 612, 390, 224, 128, 2, [61])
    this.zone(420, 262, 130, 104, 0x44376a, 'Memory Shrine', 423, 242)
    this.zone(426, 90, 152, 82, 0x324b66, 'University', 458, 104)
    this.zone(440, 412, 130, 86, 0x5d3768, 'Rave Night', 463, 426)
    this.zone(770, 298, 128, 84, 0x6a5130, 'Dubai → Canada', 788, 312)

    this.tile(43, 736, 428, 4)
    this.tile(51, 736, 492, 4)
    this.tile(88, 486, 316, 3)
    this.tile(84, 738, 222, 3)
    this.tile(96, 700, 494, 3)

    this.add.circle(752, 180, 84, 0x4db2c7, 0.18)
    this.add.circle(752, 180, 54, 0x82dbef, 0.16)
    this.add.rectangle(725, 205, 92, 14, 0xf5e6af, 0.45)

    for (let i = 0; i < 20; i++) {
      const dot = this.add.circle(Phaser.Math.Between(30, 930), Phaser.Math.Between(80, 610), 2, 0xffe58a, 0.35)
      this.fireflies.push(dot)
    }
  }

  private zone(x: number, y: number, w: number, h: number, color: number, label: string, lx: number, ly: number) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, color, 0.18).setStrokeStyle(2, 0xffffff, 0.12)
    this.add.text(lx, ly, label, { fontFamily: 'monospace', fontSize: '14px', color: '#ffe9ad', backgroundColor: '#0e181699', padding: { x: 7, y: 3 } })
  }

  private addInteractiveItems() {
    for (let i = 0; i < 9; i++) {
      const x = 84 + (i % 3) * 97 + Phaser.Math.Between(-10, 10)
      const y = 137 + Math.floor(i / 3) * 58 + Phaser.Math.Between(-6, 6)
      const sprite = this.tree(x, y)
      this.items.push({ kind: 'tree', name: 'soft pine', zone: new Phaser.Geom.Rectangle(x - 26, y - 34, 52, 62), cooldown: 0, sprite })
    }

    ;[[335,155],[263,263],[356,287],[188,226],[112,288]].forEach(([x, y]) => {
      const sprite = this.flower(x, y)
      this.items.push({ kind: 'herb', name: 'wellness herbs', zone: new Phaser.Geom.Rectangle(x - 23, y - 24, 46, 48), cooldown: 0, sprite })
    })

    for (let i = 0; i < 6; i++) {
      const x = 135 + (i % 3) * 80
      const y = 456 + Math.floor(i / 3) * 55
      const crop = this.tile(12, x, y, 2.2)
      this.add.ellipse(x, y + 20, 52, 9, 0x3d291b, 0.35)
      this.items.push({ kind: 'crop', name: 'garden plot', zone: new Phaser.Geom.Rectangle(x - 30, y - 25, 60, 50), sprite: crop, stage: 0 })
    }

    this.items.push({ kind: 'pond', name: 'fishing spot', zone: new Phaser.Geom.Rectangle(610, 92, 285, 178), cooldown: 0 })
    this.items.push({ kind: 'puzzle', name: 'match-3 memory shrine', zone: new Phaser.Geom.Rectangle(420, 262, 130, 104) })
    this.items.push({ kind: 'house', name: 'home base', zone: new Phaser.Geom.Rectangle(594, 360, 262, 188) })

    this.memory(502, 132, 'University', 'Years of almost, then timing finally got smart.')
    this.memory(505, 455, 'Rave Night', 'Somebody bumped you together. Best collision physics ever.')
    this.memory(835, 338, 'Dubai Year', 'New city, new rhythm, same team.')
    this.memory(718, 520, 'Canada Home', 'Back home, building the next chapter soft and loud.')
  }

  private addCharacters() {
    this.person(690, 430, 0xf7d7bd, 0x2a201e, 0xff91ce, 'B')
    this.player = this.person(480, 525, 0xb87555, 0x17110f, 0x1d2430, 'N')
    this.pengu = this.cat(-90, -90, 0xb88955, 'Pengu')
    this.mila = this.cat(-90, -90, 0xd9cbb7, 'Mila')
    this.pengu.setVisible(false)
    this.mila.setVisible(false)
  }

  private addUI() {
    this.add.rectangle(480, 24, 960, 48, 0x0e1816, 0.88)
    this.add.text(16, 9, 'Bb2D', { fontFamily: 'monospace', fontSize: '24px', color: '#ffe7a8' })
    this.ui = this.add.text(102, 11, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ecffd8' })
    this.objective = this.add.text(728, 9, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd7ed', align: 'right' }).setOrigin(0, 0)
    this.prompt = this.add.text(16, 592, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#10201cdd', padding: { x: 8, y: 6 } })
    this.toast = this.add.text(480, 68, '', { fontFamily: 'monospace', fontSize: '15px', color: '#fff0c8', backgroundColor: '#21170ddd', padding: { x: 10, y: 6 }, align: 'center' }).setOrigin(0.5)
    this.refreshUI()
  }

  private showIntro() {
    this.overlay = this.add.container(0, 0).setName('intro')
    this.overlay.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.86))
    this.overlay.add(this.add.text(480, 126, 'Bb2D', { fontFamily: 'monospace', fontSize: '56px', color: '#ffe7a8' }).setOrigin(0.5))
    this.overlay.add(this.add.text(480, 184, 'A tiny cozy game about building home together.', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5))
    this.overlay.add(this.add.text(480, 265,
      'Gather wood, herbs, fish, blooms, memories, and hearts.\nDecorate the home base, unlock Pengu and Mila, then talk to B.\n\nMove: WASD/arrows   E: interact   F: fish   P: puzzle   B: decorate\n\nPress Enter or Space to start.',
      { fontFamily: 'monospace', fontSize: '16px', color: '#dfffe1', align: 'center', lineSpacing: 8 }
    ).setOrigin(0.5))
  }

  private dismissOverlay() {
    if (this.overlay && !this.inPuzzle) {
      this.overlay.destroy(true)
      this.overlay = undefined
      this.gameStarted = true
      this.say('Goal: prepare the home and collect enough memories for the finale.')
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
    item.cooldown = now + 1100
    this.pulse(item.sprite)
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
    item.cooldown = now + 900
    this.inv.fish++
    this.total.fish++
    const fishIcon = this.add.text(this.player.x + 12, this.player.y - 42, '🐟', { fontSize: '24px' }).setDepth(10)
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
    const card = this.add.container(0, 0)
    card.add(this.add.rectangle(480, 320, 560, 190, 0x120e18, 0.94).setStrokeStyle(3, 0xffc6e9))
    card.add(this.add.text(480, 270, title, { fontFamily: 'monospace', fontSize: '24px', color: '#ffe7a8' }).setOrigin(0.5))
    card.add(this.add.text(480, 325, body, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: 500 } }).setOrigin(0.5))
    card.add(this.add.text(480, 386, 'A memory goes into the house.', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd7ed' }).setOrigin(0.5))
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
    const spots = [[640,430],[690,420],[742,436],[632,485],[704,492],[774,485]]
    const [x, y] = spots[this.decorPlaced - 1]
    const colors = [0xffc6e9, 0xffe28a, 0x98f5c2, 0xc5b5ff, 0xffa38a, 0xa8e6ff]
    this.add.star(x, y, 5, 7, 16, colors[this.decorPlaced - 1]).setStrokeStyle(2, 0x513246)
    this.say(`Decoration ${this.decorPlaced}/${GOAL.decorPlaced} placed.`)
    this.refreshUI()
  }

  private openPuzzle() {
    if (!this.gameStarted || this.endingShown) return
    if (!this.nearItem('puzzle')) return this.say('Go to the Memory Shrine and press P or E.')
    if (this.inPuzzle) return
    this.inPuzzle = true
    const overlay = this.add.container(0, 0).setDepth(50).setName('puzzle')
    overlay.add(this.add.rectangle(480, 320, 960, 640, 0x07080d, 0.88))
    overlay.add(this.add.text(480, 72, 'Match-3 Memories', { fontFamily: 'monospace', fontSize: '30px', color: '#ffe7a8' }).setOrigin(0.5))
    overlay.add(this.add.text(480, 112, 'Click adjacent tiles. Every match gives +1 heart and +1 decor. ESC closes.', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5))

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
        const bg = this.add.rectangle(x, y, 54, 54, 0x293a52).setStrokeStyle(2, 0xffe7a8).setInteractive()
        const t = this.add.text(x, y, pattern[r][c], { fontFamily: 'sans-serif', fontSize: '28px' }).setOrigin(0.5).setInteractive()
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

    // Guaranteed move: swap the tree between the two DJ tiles with the DJ tile on its right.
    overlay.add(this.add.text(480, 505, 'Hint: swap the tree between the headphones with the headphone on its right. 🎧', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd7ed' }).setOrigin(0.5))
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
    const end = this.add.container(0, 0).setDepth(100)
    end.add(this.add.rectangle(480, 320, 960, 640, 0x08090d, 0.92))
    end.add(this.add.text(480, 92, 'Home Complete', { fontFamily: 'monospace', fontSize: '42px', color: '#ffe7a8' }).setOrigin(0.5))
    end.add(this.add.text(480, 190,
      'From university hallways to rave lights,\nfrom DJ nights to Dubai days,\nfrom Canada again to whatever comes next...\n\nWe keep building the soft little world.\nOne memory, one meal, one cat hair, one home at a time.\n\nHappy everything, B. ♡',
      { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', align: 'center', lineSpacing: 9, wordWrap: { width: 760 } }
    ).setOrigin(0.5))
    end.add(this.add.text(480, 492, 'Press R to play again', { fontFamily: 'monospace', fontSize: '15px', color: '#ffd7ed' }).setOrigin(0.5))
    for (let i = 0; i < 26; i++) {
      const heart = this.add.text(Phaser.Math.Between(90, 870), Phaser.Math.Between(80, 570), Phaser.Utils.Array.GetRandom(['♡','✦','✿']), { fontSize: `${Phaser.Math.Between(14, 28)}px`, color: '#ffc6e9' }).setAlpha(0.55)
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
    const base = 'Move WASD/arrows  E interact  F fish  P puzzle  B decorate  R restart'
    this.prompt.setText(item ? `${base}\nNear: ${item.name}` : base)
  }

  private refreshUI() {
    this.ui.setText(`wood ${this.total.wood}/${GOAL.wood}  herbs ${this.total.herbs}/${GOAL.herbs}  fish ${this.total.fish}/${GOAL.fish}  blooms ${this.total.blooms}/${GOAL.blooms}  hearts ${this.inv.hearts}/${GOAL.hearts}  decor ${this.decorPlaced}/${GOAL.decorPlaced}  memories ${this.inv.memories}/${GOAL.memories}`)
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
    this.tweens.add({ targets: target, scaleX: 1.07, scaleY: 1.07, yoyo: true, duration: 90 })
  }

  private memory(x: number, y: number, title: string, message: string) {
    const c = this.add.container(x, y)
    c.add(this.add.image(0, 0, 'tiny-town', 89).setScale(3))
    c.add(this.add.text(0, -11, title, { fontFamily: 'monospace', fontSize: '12px', color: '#fff3ba', align: 'center' }).setOrigin(0.5))
    c.add(this.add.text(0, 13, 'press E', { fontFamily: 'monospace', fontSize: '10px', color: '#ffd7ed' }).setOrigin(0.5))
    this.items.push({ kind: 'memory', name: title, zone: new Phaser.Geom.Rectangle(x - 61, y - 29, 122, 58), sprite: c, message })
  }

  private tree(x: number, y: number) {
    return this.tile(5, x, y, 2.6)
  }

  private flower(x: number, y: number) {
    return this.tile(1, x, y, 2.1)
  }

  private person(x: number, y: number, _skin: number, _hairColor: number, _shirt: number, badge: string) {
    const p = this.add.container(x, y)
    p.add(this.add.ellipse(0, 19, 30, 10, 0x000000, 0.22))
    p.add(this.add.image(0, 0, 'tiny-town', badge === 'B' ? 86 : 87).setScale(2.7))
    if (badge === 'B') this.items.push({ kind: 'wife', name: 'B', zone: new Phaser.Geom.Rectangle(x - 28, y - 42, 56, 76) })
    return p
  }

  private cat(x: number, y: number, _color: number, name: string) {
    const c = this.add.container(x, y)
    c.add(this.add.ellipse(25, 30, 40, 10, 0x000000, 0.18))
    c.add(this.add.image(24, 12, name === 'Pengu' ? 'pet-pengu' : 'pet-mila').setScale(0.34))
    c.add(this.add.text(0, 38, name, { fontFamily: 'monospace', fontSize: '10px', color: '#fff' }))
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
  width: 960,
  height: 640,
  pixelArt: true,
  backgroundColor: '#142820',
  scene: Bb2DScene,
}

new Phaser.Game(config)
