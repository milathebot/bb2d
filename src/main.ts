import Phaser from 'phaser'
import './style.css'

type ItemKind = 'tree' | 'herb' | 'pond' | 'crop' | 'memory' | 'house' | 'puzzle'

type WorldItem = {
  kind: ItemKind
  name: string
  zone: Phaser.Geom.Rectangle
  sprite?: Phaser.GameObjects.GameObject
  used?: boolean
  stage?: number
}

class Bb2DScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private items: WorldItem[] = []
  private ui!: Phaser.GameObjects.Text
  private prompt!: Phaser.GameObjects.Text
  private toast!: Phaser.GameObjects.Text
  private inPuzzle = false
  private inv = { wood: 0, herbs: 0, fish: 0, blooms: 0, hearts: 0, decor: 0 }
  private unlockedPengu = false
  private unlockedMila = false
  private decorPlaced = 0
  private catPengu?: Phaser.GameObjects.Container
  private catMila?: Phaser.GameObjects.Container

  constructor() { super('bb2d') }

  create() {
    this.cameras.main.setBackgroundColor('#172f27')
    this.addWorld()
    this.addPlayer()
    this.addCats()
    this.addUI()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,F,P,B,ESC') as Record<string, Phaser.Input.Keyboard.Key>

    this.input.keyboard!.on('keydown-E', () => this.interact())
    this.input.keyboard!.on('keydown-F', () => this.fish())
    this.input.keyboard!.on('keydown-P', () => this.openPuzzle())
    this.input.keyboard!.on('keydown-B', () => this.decorate())
    this.input.keyboard!.on('keydown-ESC', () => this.closePuzzle())

    this.say('Welcome to Bb2D. Gather, farm, fish, solve puzzles, and build a little home together.')
  }

  update(_: number, delta: number) {
    if (this.inPuzzle) return
    const speed = 0.16 * delta
    let dx = 0, dy = 0
    if (this.cursors.left?.isDown || this.keys.A.isDown) dx -= speed
    if (this.cursors.right?.isDown || this.keys.D.isDown) dx += speed
    if (this.cursors.up?.isDown || this.keys.W.isDown) dy -= speed
    if (this.cursors.down?.isDown || this.keys.S.isDown) dy += speed
    this.player.x = Phaser.Math.Clamp(this.player.x + dx, 30, 930)
    this.player.y = Phaser.Math.Clamp(this.player.y + dy, 70, 610)
    this.updatePrompt()
    this.updateCats(delta)
  }

  private addWorld() {
    const g = this.add.graphics()
    g.fillStyle(0x235741).fillRect(0, 0, 960, 640)
    g.fillStyle(0x2f6b4a).fillRoundedRect(40, 80, 360, 230, 24) // forest
    g.fillStyle(0x2b7890).fillRoundedRect(620, 95, 270, 170, 36) // pond
    g.fillStyle(0x7b5a34).fillRoundedRect(95, 405, 300, 155, 18) // farm
    g.fillStyle(0x8a6844).fillRoundedRect(600, 365, 245, 175, 18) // home
    g.fillStyle(0x413665).fillRoundedRect(430, 270, 110, 90, 18) // puzzle

    this.label(80, 92, 'Moon Forest')
    this.label(655, 105, 'Quiet Pond')
    this.label(125, 416, 'Garden')
    this.label(654, 380, 'Home Base')
    this.label(423, 248, 'Memory Puzzle')

    // Trees
    for (let i = 0; i < 9; i++) {
      const x = 85 + (i % 3) * 95 + Phaser.Math.Between(-12, 12)
      const y = 135 + Math.floor(i / 3) * 58 + Phaser.Math.Between(-8, 8)
      this.tree(x, y)
      this.items.push({ kind: 'tree', name: 'soft pine', zone: new Phaser.Geom.Rectangle(x - 24, y - 32, 48, 58) })
    }
    // Herbs/food
    ;[[330,155],[260,260],[355,285],[190,225]].forEach(([x,y]) => {
      this.flower(x,y)
      this.items.push({ kind: 'herb', name: 'wellness herbs', zone: new Phaser.Geom.Rectangle(x-22,y-22,44,44) })
    })
    // Crops
    for (let i = 0; i < 6; i++) {
      const x = 135 + (i % 3) * 78, y = 455 + Math.floor(i / 3) * 55
      const crop = this.add.rectangle(x, y, 34, 28, 0x5a3a24).setStrokeStyle(2, 0x2c2017)
      this.items.push({ kind: 'crop', name: 'garden plot', zone: new Phaser.Geom.Rectangle(x-28,y-24,56,48), sprite: crop, stage: 0 })
    }
    this.items.push({ kind: 'pond', name: 'fishing spot', zone: new Phaser.Geom.Rectangle(625, 100, 260, 160) })
    this.items.push({ kind: 'puzzle', name: 'match-3 memory shrine', zone: new Phaser.Geom.Rectangle(425, 265, 120, 105) })
    this.items.push({ kind: 'house', name: 'home base', zone: new Phaser.Geom.Rectangle(595, 360, 260, 190) })

    this.memoryPost(500, 115, 'University\nwhere the story quietly started')
    this.memoryPost(505, 410, 'Rave night\nsomeone bumped us together')
    this.memoryPost(810, 315, 'Dubai → Canada\nhome is wherever we build it')
  }

  private addPlayer() {
    this.player = this.add.container(480, 520)
    const shadow = this.add.ellipse(0, 18, 30, 10, 0x000000, 0.25)
    const body = this.add.rectangle(0, 3, 22, 28, 0x1d2430).setStrokeStyle(2, 0x0b0e13)
    const head = this.add.circle(0, -18, 13, 0xb87555).setStrokeStyle(2, 0x2a1711)
    const hair = this.add.rectangle(0, -27, 22, 8, 0x17110f)
    const beard = this.add.rectangle(0, -10, 18, 9, 0x1a1110)
    this.player.add([shadow, body, head, hair, beard])
  }

  private addCats() {
    this.catPengu = this.cat(-80, -80, 0xb8874f, 'Pengu')
    this.catMila = this.cat(-80, -80, 0xd4c6b2, 'Mila')
    this.catPengu.setVisible(false)
    this.catMila.setVisible(false)
  }

  private addUI() {
    this.add.rectangle(480, 24, 960, 48, 0x0e1816, 0.82)
    this.add.text(16, 11, 'Bb2D', { fontFamily: 'monospace', fontSize: '22px', color: '#ffe7a8' })
    this.ui = this.add.text(104, 12, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ecffd8' })
    this.prompt = this.add.text(16, 596, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', backgroundColor: '#10201ccc', padding: { x: 8, y: 6 } })
    this.toast = this.add.text(480, 68, '', { fontFamily: 'monospace', fontSize: '15px', color: '#fff0c8', backgroundColor: '#21170dcc', padding: { x: 10, y: 6 } }).setOrigin(0.5)
    this.add.text(480, 575, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffd7ed', align: 'center', backgroundColor: '#241325cc', padding: { x: 10, y: 6 } }).setOrigin(0.5)
    this.refreshUI()
  }

  private interact() {
    const item = this.nearItem()
    if (!item) return this.say('Move near something and press E.')
    if (item.kind === 'tree') {
      this.inv.wood++
      this.say('+1 wood. The forest is helping with the house.')
    }
    if (item.kind === 'herb') {
      this.inv.herbs++
      this.say('+1 wellness herb. Very her-coded.')
    }
    if (item.kind === 'crop') {
      item.stage = ((item.stage ?? 0) + 1) % 4
      const colors = [0x5a3a24, 0x3d7d36, 0x79b947, 0xffc86b]
      ;(item.sprite as Phaser.GameObjects.Rectangle).fillColor = colors[item.stage]
      if (item.stage === 3) { this.inv.blooms++; this.say('+1 bloom. Garden delivered.') }
      else this.say(item.stage === 1 ? 'Seeds planted.' : 'Watered. Almost there.')
    }
    if (item.kind === 'puzzle') this.openPuzzle()
    if (item.kind === 'house') this.decorate()
    this.checkUnlocks()
    this.refreshUI()
  }

  private fish() {
    const item = this.nearItem('pond')
    if (!item) return this.say('Stand by the pond and press F to fish.')
    this.inv.fish++
    this.say('+1 fish. Quiet pond, good luck.')
    this.refreshUI()
  }

  private decorate() {
    if (!this.nearItem('house')) return this.say('Decorating happens at home. Press B inside the base.')
    if (this.inv.decor <= 0 && this.inv.wood < 2 && this.inv.herbs < 1 && this.inv.fish < 1) return this.say('Need decor tokens or 2 wood + 1 herb + 1 fish.')
    if (this.inv.decor > 0) this.inv.decor--
    else { this.inv.wood -= 2; this.inv.herbs--; this.inv.fish-- }
    this.decorPlaced++
    const x = 625 + (this.decorPlaced % 5) * 38
    const y = 415 + Math.floor(this.decorPlaced / 5) * 34
    this.add.star(x, y, 5, 6, 14, [0xffc6e9,0xffe28a,0x98f5c2,0xc5b5ff][this.decorPlaced % 4]).setStrokeStyle(2, 0x513246)
    this.say('New decoration placed. The base is getting softer.')
    this.refreshUI()
  }

  private openPuzzle() {
    if (!this.nearItem('puzzle') && !this.keys.P.isDown) return this.say('Go to the memory shrine or press P nearby.')
    if (this.inPuzzle) return
    this.inPuzzle = true
    const overlay = this.add.container(0, 0).setName('puzzle')
    overlay.add(this.add.rectangle(480, 320, 960, 640, 0x08080c, 0.82))
    overlay.add(this.add.text(480, 86, 'Match-3 Memories', { fontFamily: 'monospace', fontSize: '28px', color: '#ffe7a8' }).setOrigin(0.5))
    overlay.add(this.add.text(480, 122, 'Click two adjacent tiles. Make a match to earn decor + hearts. ESC closes.', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5))
    const icons = ['🎧','🌲','🐟','🌸','🥟']
    const board: Phaser.GameObjects.Text[][] = []
    let selected: { r: number, c: number } | null = null
    const drawTile = (r: number, c: number, v: string) => {
      const x = 330 + c * 62, y = 170 + r * 62
      const bg = this.add.rectangle(x, y, 54, 54, 0x2b3d54).setStrokeStyle(2, 0xffe7a8)
      const t = this.add.text(x, y, v, { fontFamily: 'sans-serif', fontSize: '28px' }).setOrigin(0.5).setInteractive()
      overlay.add([bg, t])
      t.on('pointerdown', () => {
        if (!selected) { selected = { r, c }; bg.setStrokeStyle(4, 0xff91ce); return }
        const adj = Math.abs(selected.r-r)+Math.abs(selected.c-c) === 1
        if (adj) {
          const a = board[selected.r][selected.c].text
          board[selected.r][selected.c].setText(board[r][c].text)
          board[r][c].setText(a)
          const matched = this.resolveMatches(board, icons)
          if (matched) {
            this.inv.decor++; this.inv.hearts++
            this.say('Memory match made. +1 decor, +1 heart.')
            this.checkUnlocks(); this.refreshUI()
          }
        }
        selected = null
        overlay.each((obj: Phaser.GameObjects.GameObject) => { if (obj instanceof Phaser.GameObjects.Rectangle) obj.setStrokeStyle(2, 0xffe7a8) })
      })
      return t
    }
    for (let r = 0; r < 5; r++) {
      board[r] = []
      for (let c = 0; c < 5; c++) board[r][c] = drawTile(r, c, icons[(r + c + Phaser.Math.Between(0, 2)) % icons.length])
    }
  }

  private resolveMatches(board: Phaser.GameObjects.Text[][], icons: string[]) {
    let found = false
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (board[r][c].text === board[r][c+1].text && board[r][c].text === board[r][c+2].text) {
        found = true; for (let k = 0; k < 3; k++) board[r][c+k].setText(Phaser.Utils.Array.GetRandom(icons))
      }
    }
    for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) {
      if (board[r][c].text === board[r+1][c].text && board[r][c].text === board[r+2][c].text) {
        found = true; for (let k = 0; k < 3; k++) board[r+k][c].setText(Phaser.Utils.Array.GetRandom(icons))
      }
    }
    return found
  }

  private closePuzzle() {
    const overlay = this.children.getByName('puzzle') as Phaser.GameObjects.Container | null
    if (overlay) overlay.destroy(true)
    this.inPuzzle = false
  }

  private checkUnlocks() {
    if (!this.unlockedPengu && this.inv.hearts >= 1) {
      this.unlockedPengu = true; this.catPengu?.setVisible(true); this.say('Pengu unlocked: feisty, sweet, already judging the furniture.')
    }
    if (!this.unlockedMila && this.inv.hearts >= 3) {
      this.unlockedMila = true; this.catMila?.setVisible(true); this.say('Mila unlocked: chonky little cloud acquired.')
    }
  }

  private nearItem(kind?: ItemKind) {
    return this.items.find(i => (!kind || i.kind === kind) && Phaser.Geom.Rectangle.Contains(i.zone, this.player.x, this.player.y))
  }

  private updatePrompt() {
    const item = this.nearItem()
    const base = 'Move: WASD/arrows  Interact: E  Fish: F  Puzzle: P  Decorate: B'
    this.prompt.setText(item ? `${base}\nNear: ${item.name}` : base)
  }

  private refreshUI() {
    this.ui.setText(`wood ${this.inv.wood}  herbs ${this.inv.herbs}  fish ${this.inv.fish}  blooms ${this.inv.blooms}  hearts ${this.inv.hearts}  decor ${this.inv.decor}`)
  }

  private say(text: string) {
    this.toast.setText(text)
    this.tweens.killTweensOf(this.toast)
    this.toast.setAlpha(1)
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 2600, duration: 900 })
  }

  private label(x: number, y: number, text: string) {
    this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '14px', color: '#ffe7a8', backgroundColor: '#10201caa', padding: { x: 6, y: 3 } })
  }

  private memoryPost(x: number, y: number, text: string) {
    this.add.rectangle(x, y, 120, 54, 0x2b203a).setStrokeStyle(2, 0xffc6e9)
    this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '11px', color: '#ffd7ed', align: 'center' }).setOrigin(0.5)
  }

  private tree(x: number, y: number) {
    this.add.rectangle(x, y + 17, 12, 28, 0x6b4324)
    this.add.circle(x, y, 28, 0x214f35).setStrokeStyle(2, 0x153824)
    this.add.circle(x - 15, y + 6, 16, 0x2f6b42)
    this.add.circle(x + 15, y + 8, 17, 0x2f6b42)
  }

  private flower(x: number, y: number) {
    this.add.circle(x, y, 10, 0xff91ce)
    this.add.circle(x - 9, y + 2, 7, 0xffd1e9)
    this.add.circle(x + 9, y + 2, 7, 0xffd1e9)
    this.add.rectangle(x, y + 16, 4, 22, 0x3d7d36)
  }

  private cat(x: number, y: number, color: number, name: string) {
    const c = this.add.container(x, y)
    c.add([this.add.ellipse(0, 10, 36, 20, color), this.add.circle(18, 2, 12, color), this.add.triangle(12, -8, 0, 0, 8, -12, 16, 0, color), this.add.triangle(24, -8, 0, 0, 8, -12, 16, 0, color), this.add.text(-18, 24, name, { fontFamily: 'monospace', fontSize: '10px', color: '#fff' })])
    return c
  }

  private updateCats(delta: number) {
    const follow = (cat: Phaser.GameObjects.Container | undefined, dist: number) => {
      if (!cat?.visible) return
      const targetX = this.player.x - dist
      const targetY = this.player.y + 30
      cat.x += (targetX - cat.x) * 0.0025 * delta
      cat.y += (targetY - cat.y) * 0.0025 * delta
    }
    follow(this.catPengu, 48); follow(this.catMila, 86)
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 640,
  pixelArt: true,
  backgroundColor: '#172f27',
  scene: Bb2DScene,
}

new Phaser.Game(config)
