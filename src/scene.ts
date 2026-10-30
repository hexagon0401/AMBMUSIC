import { Companion, type Activity } from './companion';
import { CHUNK_WIDTH, Journey, TerrainGenerator, biome, readSceneConfig, freshSeed, lerp, SCENE_STORAGE, type BiomeId, type Blend, type SceneConfig, type Theme } from './terrain';
export type { Activity, Theme };
export type Quality = 'auto' | 'low' | 'high';
type Options = { config?: SceneConfig; onChange?: (state: SceneConfig, transitioning: boolean) => void };
type TextTile = { canvas: HTMLCanvasElement; width: number; height: number };
type Diagnostics = { quality: Quality; effectiveQuality: Quality; chunks: number; glyphCaches: number; renderedFrames: number; averageRenderMs: number; p95RenderMs: number; time: number; state: SceneConfig; blend: Blend; dpr: number; effectScale: number; fontSize: number; frameRate: number; layerBuilds: number; cacheBytes: number };
const TILE = CHUNK_WIDTH;
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

/** Native-DPR text tiles and cached silhouettes: the live loop only composites layers. */
export class RiverScene {
  private landscape = document.createElement('canvas');
  private companion = document.createElement('canvas');
  private foreground = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private sprite: CanvasRenderingContext2D;
  private front: CanvasRenderingContext2D;
  private friend = new Companion();
  private generator: TerrainGenerator;
  private journey: Journey;
  private tiles = new Map<string, TextTile>();
  private masks = new Map<string, Path2D>();
  private usedTiles = new Set<string>();
  private usedMasks = new Set<string>();
  private observer: ResizeObserver;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private fontSize = 10;
  private cellWidth = 6;
  private rowHeight = 9;
  private bank = 0;
  private time = 0;
  private lastTime = 0;
  private lastPaint = 0;
  private lastSpriteY = NaN;
  private lastSpritePhase = '';
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  private activity: Activity = 'fish';
  private quality: Quality = 'auto';
  private stateKey = '';
  private renderedFrames = 0;
  private timings: number[] = [];
  private frameTimes: number[] = [];
  private layerBuilds = 0;
  private onVisibility = () => { this.lastTime = this.lastPaint = 0; };

  constructor(private host: HTMLElement, private onFailure: () => void, private theme: Theme = 'dark', private options: Options = {}) {
    const ctx = this.landscape.getContext('2d');
    const sprite = this.companion.getContext('2d');
    const front = this.foreground.getContext('2d');
    if (!ctx || !sprite || !front) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx; this.sprite = sprite; this.front = front;
    this.landscape.className = 'landscape-canvas'; this.companion.className = 'companion-canvas'; this.foreground.className = 'foreground-canvas';
    this.landscape.dataset.renderLayer = 'landscape'; this.foreground.dataset.renderLayer = 'foreground';
    this.landscape.setAttribute('role', 'img'); this.companion.setAttribute('role', 'img');
    this.companion.setAttribute('aria-label', '검은 점눈과 짧은 네 다리를 가진 노란 픽셀 친구가 작은 금빛 배에서 낚시하고 있습니다.');
    this.foreground.setAttribute('aria-hidden', 'true');
    this.journey = new Journey(options.config ?? readSceneConfig()); this.generator = new TerrainGenerator(this.journey.config.seed);
    host.append(this.landscape, this.companion, this.foreground);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize(); this.notify(); this.raf = requestAnimationFrame(this.tick);
  }
  get config(): SceneConfig { return { ...this.journey.config, biome: this.journey.blend.to }; }
  setActivity(activity: Activity) { this.activity = activity; this.companion.dataset.pose = activity; this.dirty = true; this.lastSpritePhase = ''; }
  setMotion(enabled: boolean) { this.motion = enabled; this.lastTime = this.lastPaint = 0; this.dirty = true; }
  setQuality(quality: Quality) { this.quality = quality; this.invalidate(); }
  setTheme(theme: Theme) { this.theme = theme; this.invalidate(); }
  setLandscape(id: BiomeId) { this.journey.select(id); this.generator.clear(); this.invalidate(); this.notify(); }
  setAutoJourney(enabled: boolean) { this.journey.setAuto(enabled); this.dirty = true; this.notify(); }
  regenerate() { this.journey.config = { ...this.journey.config, seed: freshSeed() }; this.generator = new TerrainGenerator(this.journey.config.seed); this.invalidate(); this.notify(); }
  private get paper() { return this.theme === 'dark' ? '#222222' : '#f4f3ed'; }
  private get inks() { return this.theme === 'dark' ? ['#70716f', '#a8a9a5', '#e0e0d9'] : ['#a0a39a', '#6c7267', '#30382f']; }
  private invalidate() { this.tiles.clear(); this.masks.clear(); this.dirty = true; this.lastSpritePhase = ''; }
  private notify() {
    const state = this.config, blend = this.journey.blend;
    const transition = blend.from !== blend.to;
    const key = `${state.biome}:${state.seed}:${state.autoJourney}:${transition}`;
    if (key === this.stateKey) return;
    this.stateKey = key; this.host.dataset.biome = state.biome; this.host.dataset.seed = String(state.seed); this.host.dataset.transitioning = String(transition);
    this.landscape.setAttribute('aria-label', `${biome(state.biome).name}. 선명한 흑백 ASCII 구름과 수면, 검은 숲 실루엣이 겹쳐진 풍경.`);
    try { localStorage.setItem(SCENE_STORAGE, JSON.stringify(state)); } catch { /* Optional browser storage. */ }
    this.options.onChange?.(state, transition);
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(3, Math.max(1, devicePixelRatio));
    if (this.width === Math.round(width) && this.height === Math.round(height) && this.dpr === dpr) return;
    this.width = Math.round(width); this.height = Math.round(height); this.dpr = dpr;
    // Geometry adapts to the viewport; font size is always expressed in CSS pixels.
    this.fontSize = this.width < 600 ? 11 : 10;
    this.cellWidth = this.fontSize * 0.6;
    this.rowHeight = this.width < 600 ? 10 : 9;
    this.bank = Math.round(this.height * 0.755);
    for (const canvas of [this.landscape, this.companion, this.foreground]) {
      canvas.width = Math.round(this.width * dpr); canvas.height = Math.round(this.height * dpr);
      const context = canvas.getContext('2d')!;
      context.setTransform(dpr, 0, 0, dpr, 0, 0); context.imageSmoothingEnabled = false;
    }
    this.host.style.backgroundColor = this.paper;
    this.front.clearRect(0, 0, this.width, this.height);
    this.invalidate();
  }
  private snap(value: number) { return Math.round(value * this.dpr) / this.dpr; }
  private texture(key: string, height: number, render: (ctx: CanvasRenderingContext2D) => void): TextTile {
    this.usedTiles.add(key);
    const existing = this.tiles.get(key); if (existing) return existing;
    const canvas = document.createElement('canvas'); canvas.dataset.renderLayer = 'ascii-tile';
    canvas.width = Math.round(TILE * this.dpr); canvas.height = Math.round(Math.ceil(height) * this.dpr);
    const context = canvas.getContext('2d')!;
    context.scale(this.dpr, this.dpr); context.font = `${this.fontSize}px ${MONO}`;
    context.textBaseline = 'alphabetic'; context.imageSmoothingEnabled = false;
    if ('letterSpacing' in context) context.letterSpacing = `${this.cellWidth - context.measureText('M').width}px`;
    render(context);
    const tile = { canvas, width: TILE, height: Math.ceil(height) };
    this.tiles.set(key, tile); this.layerBuilds++; return tile;
  }
  private hash(x: number, y: number, salt = 0) {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ this.generator.seed ^ salt;
    n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296;
  }
  private drawRows(ctx: CanvasRenderingContext2D, height: number, index: number, sample: (wx: number, y: number) => number, salt: number) {
    const columns = Math.ceil(TILE / this.cellWidth);
    const glyphs = salt >= 1100 ? '.:;-=+~' : '.:;-=+*01il';
    for (let y = this.rowHeight; y < height; y += this.rowHeight) {
      const rows = [Array(columns).fill(' '), Array(columns).fill(' '), Array(columns).fill(' ')];
      for (let column = 0; column < columns; column++) {
        const wx = index * TILE + column * this.cellWidth;
        const density = sample(wx, y);
        if (density <= 0) continue;
        const r = this.hash(Math.floor(wx / this.cellWidth), Math.floor(y / this.rowHeight), salt);
        if (r > Math.min(1, density)) continue;
        const shade = density > 0.78 ? 2 : density > 0.43 ? 1 : 0;
        rows[shade][column] = glyphs[Math.min(glyphs.length - 1, Math.floor((r * 0.55 + density * 0.45) * glyphs.length))];
      }
      rows.forEach((row, shade) => {
        if (!row.some((char) => char !== ' ')) return;
        ctx.fillStyle = this.inks[shade]; ctx.fillText(row.join(''), 0, y);
      });
    }
  }
  private drawSky(blend: Blend) {
    const kind = blend.amount > 0.5 ? blend.to : blend.from;
    const cloudCover = lerp(biome(blend.from).cloud, biome(blend.to).cloud, blend.amount);
    for (let layer = 0; layer < 2; layer++) {
      const shift = this.time * (layer ? 4.5 : 1.6);
      const first = Math.floor(-shift / TILE), last = Math.floor((this.width - shift) / TILE);
      const height = Math.ceil(this.bank + 10);
      for (let index = first; index <= last; index++) {
        const key = `sky:${layer}:${index}:${kind}:${this.theme}:${Math.round(cloudCover * 8)}`;
        const tile = this.texture(key, height, (context) => this.drawRows(context, height, index, (x, y) => {
          const ny = y / this.height;
          const broad = this.generator.noise2D(x * (layer ? 0.0028 : 0.0015), ny * 3.3 + layer * 31);
          const detail = this.quality === 'low' ? 0 : this.generator.noise2D(x * 0.009, ny * 9 + layer * 17) * 0.10 + (this.quality === 'high' ? this.generator.noise2D(x * 0.018, ny * 16 + layer * 23) * 0.05 : 0);
          const band = Math.sin(y * (layer ? 0.50 : 0.63)) * 0.14;
          const fade = layer ? 0.69 - ny * 1.1 : 1.10 - ny * 1.55;
          return Math.max(0, broad * 0.45 + detail + band + fade + cloudCover * 0.15);
        }, layer * 271));
        this.ctx.globalAlpha = layer ? 0.47 : 0.92;
        this.ctx.drawImage(tile.canvas, this.snap(index * TILE + shift), 0, tile.width, tile.height);
      }
    }
    this.ctx.globalAlpha = 1;
  }
  private silhouette(index: number, blend: Blend, depth: number) {
    const step = Math.round(blend.amount * 32) / 32;
    const key = `${index}:${blend.from}:${blend.to}:${step}:${depth}`;
    this.usedMasks.add(key);
    const cached = this.masks.get(key); if (cached) return cached;
    const from = this.generator.chunk(blend.from, 2, index), to = this.generator.chunk(blend.to, 2, index);
    const path = new Path2D();
    const root = this.bank + 2;
    const fromKind = biome(blend.from).kind, toKind = biome(blend.to).kind;
    const treeMix = (fromKind === 'pine' ? 1 - step : 0) + (toKind === 'pine' ? step : 0);
    path.moveTo(-1, root);
    const amplitude = (kind: string) => kind === 'pine' ? 0.30 : kind === 'snow' ? 0.80 : kind === 'reeds' ? 0.55 : 0.92;
    for (let i = 0; i < from.samples.length; i++) {
      const sample = from.samples[i];
      const relief = lerp((302 - sample.y) * amplitude(fromKind), (302 - to.samples[i].y) * amplitude(toKind), step);
      path.lineTo(sample.x - index * TILE, root - relief / 240 * this.height);
    }
    path.lineTo(TILE + 1, root); path.closePath();
    if (treeMix > 0.01) {
      path.rect(-1, root - this.height * 0.17 * treeMix, TILE + 2, this.height * 0.17 * treeMix + 1);
      const plants = fromKind === 'pine' ? from.plants : to.plants;
      for (let i = 0; i < plants.length; i += 3) {
        const plant = plants[i];
        const x = plant.x - index * TILE;
        const h = this.height * (0.26 + plant.height / 55 * 0.43) * (depth ? 1 : 0.82) * treeMix;
        const width = h * 0.21;
        path.rect(x - 1, root - h, 2, h);
        for (let tier = 0; tier < 5; tier++) {
          const top = root - h + tier * h * 0.15;
          const spread = width * (0.3 + tier * 0.17);
          path.moveTo(x, top); path.lineTo(x + spread, top + h * 0.43); path.lineTo(x - spread, top + h * 0.43); path.closePath();
        }
      }
    }
    if ((fromKind === 'reeds' ? 1 - step : 0) + (toKind === 'reeds' ? step : 0) > 0.01) {
      const plants = fromKind === 'reeds' ? from.plants : to.plants;
      const weight = (fromKind === 'reeds' ? 1 - step : 0) + (toKind === 'reeds' ? step : 0);
      for (const plant of plants) {
        const h = plant.height / 55 * this.height * 0.23 * weight;
        path.rect(plant.x - index * TILE, root - h, 1, h);
      }
    }
    this.masks.set(key, path); return path;
  }
  private drawForest(blend: Blend, reflection = false) {
    const ctx = this.ctx;
    const shift = this.time * 6;
    const first = Math.floor(-shift / TILE), last = Math.floor((this.width - shift) / TILE);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    ctx.globalAlpha = reflection ? 0.20 : 1;
    if (reflection) { ctx.translate(0, this.bank * 2); ctx.scale(1, -1); }
    for (let index = first - 1; index <= last + 1; index++) {
      const path = this.silhouette(index, blend, 1);
      ctx.save(); ctx.translate(this.snap(index * TILE + shift), 0); ctx.fill(path); ctx.restore();
    }
    ctx.restore();
  }
  private drawWater(blend: Blend) {
    const kind = blend.amount > 0.5 ? blend.to : blend.from;
    const waterHeight = this.height - this.bank;
    const bandHeight = Math.ceil(waterHeight / 3);
    for (let band = 0; band < 3; band++) {
      const shift = this.time * [9, 16, 25][band];
      const first = Math.floor(-shift / TILE), last = Math.floor((this.width - shift) / TILE);
      for (let index = first; index <= last; index++) {
        const key = `water:${index}:${band}:${kind}:${this.theme}`;
        const tile = this.texture(key, bandHeight + this.rowHeight, (context) => this.drawRows(context, bandHeight + this.rowHeight, index, (x, y) => {
          const row = y / this.rowHeight + band * 19;
          const broad = this.generator.noise2D(x * 0.0045, row * 0.17 + 71);
          const wave = Math.sin(row * 1.33 + this.generator.noise2D(x * 0.0018, row * 0.1) * 2.8);
          const sparkle = Math.sin(x * 0.031 + row * 3.7) * 0.14;
          const shore = band === 0 ? 0.55 : 0.74;
          return Math.max(0, broad * 0.52 + wave * 0.44 + sparkle + shore - 0.22);
        }, 1100 + band * 227));
        this.ctx.globalAlpha = band === 0 ? 0.73 : 0.85 + Math.sin(this.time * 0.28 + band) * 0.07;
        this.ctx.drawImage(tile.canvas, this.snap(index * TILE + shift), this.bank + band * bandHeight, tile.width, tile.height);
      }
    }
    this.ctx.globalAlpha = 1;
  }
  private drawShore() {
    this.front.clearRect(0, 0, this.width, this.height);
    this.front.font = `${this.fontSize}px ${MONO}`; this.front.fillStyle = this.inks[1];
    const chars = '. : . . :';
    for (let x = 0; x < this.width; x += 93) {
      const n = this.generator.noise2D(x * 0.006, 99);
      if (n > -0.1) this.front.fillText(chars, x, this.bank + Math.round(n * 5));
    }
  }
  private renderSprite() {
    const scale = this.width < 600 ? 3 : 4;
    const y = Math.round(this.height * 0.835 + Math.sin(this.time * 0.8) * 0.7);
    const phase = `${this.activity}:${Math.floor(this.time * 1.3) % 2}:${this.theme}`;
    if (!this.dirty && y === this.lastSpriteY && phase === this.lastSpritePhase && this.activity !== 'row') return;
    this.lastSpriteY = y; this.lastSpritePhase = phase;
    this.sprite.clearRect(0, 0, this.width, this.height);
    this.friend.draw(this.sprite, Math.round(this.width * 0.5), y, scale, this.time, this.activity, this.theme === 'dark');
  }
  private render() {
    this.usedTiles.clear(); this.usedMasks.clear(); this.generator.beginFrame();
    this.host.style.backgroundColor = this.paper;
    this.ctx.clearRect(0, 0, this.width, this.height);
    const blend = this.journey.blend;
    this.drawSky(blend); this.drawForest(blend); this.drawWater(blend); this.drawForest(blend, true);
    this.renderSprite();
    if (this.dirty) this.drawShore();
    this.generator.endFrame();
    for (const key of this.tiles.keys()) if (!this.usedTiles.has(key)) this.tiles.delete(key);
    for (const key of this.masks.keys()) if (!this.usedMasks.has(key)) this.masks.delete(key);
    this.notify();
  }
  getDiagnostics(): Diagnostics {
    const sorted = [...this.timings].sort((a, b) => a - b);
    const frameRate = this.frameTimes.length > 1 ? (this.frameTimes.length - 1) * 1000 / (this.frameTimes.at(-1)! - this.frameTimes[0]) : 0;
    return { quality: this.quality, effectiveQuality: this.quality, chunks: this.masks.size, glyphCaches: this.tiles.size, renderedFrames: this.renderedFrames, averageRenderMs: this.timings.reduce((a, b) => a + b, 0) / (this.timings.length || 1), p95RenderMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0, time: this.time, state: this.config, blend: this.journey.blend, dpr: this.dpr, effectScale: 1, fontSize: this.fontSize, frameRate, layerBuilds: this.layerBuilds, cacheBytes: [...this.tiles.values()].reduce((bytes, tile) => bytes + tile.canvas.width * tile.canvas.height * 4, 0) };
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden || !this.width || !this.height) { this.lastTime = this.lastPaint = 0; return; }
    const delta = this.lastTime ? Math.max(0, (now - this.lastTime) / 1000) : 0;
    this.lastTime = now;
    if (this.motion) { this.time += delta; this.journey.advance(delta); }
    if (!this.dirty && !this.motion) return;
    if (!this.dirty && this.lastPaint && now - this.lastPaint < 1000 / 60 - 1) return;
    this.lastPaint = now;
    const start = performance.now();
    try { this.render(); } catch { this.dispose(); this.onFailure(); return; }
    this.timings.push(performance.now() - start); if (this.timings.length > 120) this.timings.shift();
    this.frameTimes.push(now); if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.renderedFrames++; this.dirty = false;
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); document.removeEventListener('visibilitychange', this.onVisibility);
    this.generator.clear(); this.tiles.clear(); this.masks.clear(); this.friend.clear();
    this.landscape.remove(); this.companion.remove(); this.foreground.remove();
  }
}
