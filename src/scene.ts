import { Glyphs } from './glyphs';
import { Companion, type Activity } from './companion';
import { CHUNK_WIDTH, DEPTH_FACTORS, HORIZON, WORLD_HEIGHT, TRAVEL_SPEED, Journey, TerrainGenerator, biome, freshSeed, lerp, mixColor, palette, readSceneConfig, SCENE_STORAGE, type BiomeId, type Blend, type SceneConfig, type Theme, type TerrainChunk } from './terrain';
export type { Activity, Theme };
export type Quality = 'auto' | 'low' | 'high';
type Options = { config?: SceneConfig; onChange?: (state: SceneConfig, transitioning: boolean) => void };
type Diagnostics = { quality: Quality; effectiveQuality: Quality; chunks: number; glyphCaches: number; renderedFrames: number; averageRenderMs: number; p95RenderMs: number; time: number; state: SceneConfig; blend: Blend };

export class RiverScene {
  private landscape = document.createElement('canvas');
  private companion = document.createElement('canvas');
  private foreground = document.createElement('canvas');
  private clouds = document.createElement('canvas');
  private water = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private sprite: CanvasRenderingContext2D;
  private front: CanvasRenderingContext2D;
  private glyphs: Glyphs;
  private friend = new Companion();
  private generator: TerrainGenerator;
  private journey: Journey;
  private observer: ResizeObserver;
  private width = 0;
  private height = 0;
  private viewWidth = 0;
  private scale = 1;
  private time = 0;
  private last = 0;
  private lastCloud = -Infinity;
  private lastWater = -Infinity;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  private activity: Activity = 'rest';
  private quality: Quality = 'auto';
  private constrained = false;
  private get detail(): Quality { return this.quality === 'auto' && this.constrained ? 'low' : this.quality; }
  private stateKey = '';
  private renderedFrames = 0;
  private timings: number[] = [];
  private onVisibility = () => { this.last = 0; };

  constructor(private host: HTMLElement, private onFailure: () => void, private theme: Theme = 'light', private options: Options = {}) {
    const ctx = this.landscape.getContext('2d', { willReadFrequently: true });
    const sprite = this.companion.getContext('2d', { willReadFrequently: true });
    const front = this.foreground.getContext('2d', { willReadFrequently: true });
    if (!ctx || !sprite || !front) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx; this.sprite = sprite; this.front = front;
    for (const [name, canvas] of [['landscape', this.landscape], ['clouds', this.clouds], ['water', this.water], ['foreground', this.foreground]] as const) canvas.dataset.renderLayer = name;
    this.glyphs = new Glyphs(ctx);
    this.journey = new Journey(options.config ?? readSceneConfig());
    this.generator = new TerrainGenerator(this.journey.config.seed);
    this.landscape.className = 'landscape-canvas';
    this.landscape.setAttribute('role', 'img');
    this.companion.className = 'companion-canvas';
    this.companion.setAttribute('role', 'img');
    this.companion.setAttribute('aria-label', '배 위의 작은 노란 2D 픽셀 친구. 점눈 두 개, 팔 두 개, 다리 네 개');
    this.foreground.className = 'foreground-canvas';
    this.foreground.setAttribute('aria-hidden', 'true');
    host.append(this.landscape, this.companion, this.foreground);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.notify();
    this.raf = requestAnimationFrame(this.tick);
  }

  get config(): SceneConfig { return { ...this.journey.config, biome: this.journey.blend.to }; }
  setActivity(activity: Activity) { this.activity = activity; this.companion.dataset.pose = activity; this.dirty = true; }
  setMotion(enabled: boolean) { this.motion = enabled; this.last = 0; this.dirty = true; }
  setQuality(quality: Quality) { this.quality = quality; this.constrained = false; this.configureEffects(); }
  setTheme(theme: Theme) { this.theme = theme; this.glyphs.clear(); this.invalidate(); }
  setLandscape(id: BiomeId) { this.journey.select(id); this.generator.clear(); this.invalidate(); this.notify(); }
  setAutoJourney(enabled: boolean) { this.journey.setAuto(enabled); this.invalidate(); this.notify(); }
  regenerate() {
    this.journey.config = { ...this.journey.config, seed: freshSeed() };
    this.generator = new TerrainGenerator(this.journey.config.seed);
    this.invalidate(); this.notify();
  }
  getDiagnostics(): Diagnostics {
    const sorted = [...this.timings].sort((a, b) => a - b);
    return { quality: this.quality, effectiveQuality: this.detail, chunks: this.generator.chunks.size, glyphCaches: this.glyphs.size, renderedFrames: this.renderedFrames, averageRenderMs: this.timings.reduce((a, b) => a + b, 0) / (this.timings.length || 1), p95RenderMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0, time: this.time, state: this.config, blend: this.journey.blend };
  }
  private invalidate() { this.dirty = true; this.lastCloud = this.lastWater = -Infinity; }
  private notify() {
    const state = this.config;
    const blend = this.journey.blend;
    const transitioning = blend.from !== blend.to;
    const key = `${state.biome}:${state.seed}:${state.autoJourney}:${transitioning}`;
    if (key === this.stateKey) return;
    this.stateKey = key;
    this.host.dataset.biome = state.biome;
    this.host.dataset.seed = String(state.seed);
    this.host.dataset.transitioning = String(transitioning);
    this.landscape.setAttribute('aria-label', `${biome(state.biome).name}. 구름과 반짝이는 물, 여러 깊이의 ASCII 풍경이 왼쪽에서 오른쪽으로 흐릅니다.`);
    try { localStorage.setItem(SCENE_STORAGE, JSON.stringify(state)); } catch { /* Persistence is optional. */ }
    this.options.onChange?.(state, transitioning);
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.width = width; this.height = height;
    this.scale = height / WORLD_HEIGHT;
    this.viewWidth = width / this.scale;
    const dpr = Math.min(devicePixelRatio, 1.5);
    for (const canvas of [this.landscape, this.companion, this.foreground]) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
      context.imageSmoothingEnabled = false;
    }
    this.glyphs.clear();
    this.configureEffects();
  }
  private configureEffects() {
    if (!this.viewWidth) return;
    const ratio = this.detail === 'high' ? 0.9 : this.detail === 'low' ? 0.45 : 0.65;
    this.clouds.width = Math.ceil(this.viewWidth * ratio); this.clouds.height = Math.ceil(250 * ratio);
    this.water.width = Math.ceil(this.viewWidth * ratio); this.water.height = Math.ceil(WORLD_HEIGHT * ratio);
    for (const canvas of [this.clouds, this.water]) {
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = false;
    }
    this.invalidate();
  }

  private drawClouds(blend: Blend) {
    const ctx = this.clouds.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, this.viewWidth + 1, 250);
    const colors = palette(blend, this.theme);
    const cover = lerp(biome(blend.from).cloud, biome(blend.to).cloud, blend.amount);
    const cell = this.detail === 'low' ? 15 : this.detail === 'high' ? 8 : 11;
    const color = mixColor(colors.sky, this.theme === 'dark' ? '#bccbc3' : '#8baca5', 0.65);
    for (let layer = 0; layer < 2; layer++) {
      const center = layer ? 136 : 63;
      const drift = this.time * (layer ? 3.4 : 1.3);
      for (let y = 20 + layer * 65; y < 115 + layer * 100; y += cell) for (let x = -cell; x < this.viewWidth + cell; x += cell * 0.7) {
        const nx = (x - drift) * (layer ? 0.006 : 0.0038);
        const ny = y * 0.018;
        const t = this.time * 0.008;
        let n = this.generator.noise3D(nx, ny, t) * 0.62 + this.generator.noise3D(nx * 2.1, ny * 2.1, t * 1.2) * 0.26;
        if (this.detail !== 'low') n += this.generator.noise3D(nx * 4.3, ny * 4.3, t * 1.4) * 0.12;
        const density = n + cover * 0.50 - Math.abs(y - center) / (layer ? 140 : 110);
        if (density > 0.02) {
          ctx.globalAlpha = Math.min(0.8, density * (layer ? 1.3 : 0.7));
          this.glyphs.stamp(ctx, color, cell * 0.8, Math.min(1, density * 1.6), x, y);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTerrain(blend: Blend) {
    const ctx = this.ctx;
    const colors = palette(blend, this.theme);
    const a = Math.round(blend.amount * 24) / 24;
    const quantized = palette({ ...blend, amount: a }, this.theme);
    const font = this.detail === 'low' ? 9 : this.detail === 'high' ? 6 : 7;
    this.generator.beginFrame();
    for (let depth = 0; depth < 3; depth++) {
      const shift = this.time * TRAVEL_SPEED * DEPTH_FACTORS[depth];
      const first = Math.floor(-shift / CHUNK_WIDTH);
      const last = Math.ceil((this.viewWidth - shift) / CHUNK_WIDTH);
      const ink = mixColor(quantized.sky, quantized.ink, [0.45, 0.63, 0.91][depth]);
      const pattern = this.glyphs.pattern(ink, font);
      pattern.setTransform(new DOMMatrix().translate(shift % 128, 0));
      for (let index = first - 1; index <= last + 1; index++) {
        const from = this.generator.chunk(blend.from, depth, index);
        const to = this.generator.chunk(blend.to, depth, index);
        if (index < first || index > last) continue;
        const points = from.samples.map((p, i) => ({ x: p.x + shift, y: lerp(p.y, to.samples[i].y, blend.amount), shore: p.shore }));
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].shore);
        for (const p of points) path.lineTo(p.x, p.y);
        for (let i = points.length - 1; i >= 0; i--) path.lineTo(points[i].x, points[i].shore);
        path.closePath();
        this.erase(ctx, path);
        ctx.fillStyle = pattern; ctx.globalAlpha = 0.90; ctx.fill(path); ctx.globalAlpha = 1;
        const snow = (blend.from === 'alpine-lake' ? 1 - blend.amount : 0) + (blend.to === 'alpine-lake' ? blend.amount : 0);
        if (snow && depth < 2) {
          ctx.save(); ctx.clip(path);
          const cap = new Path2D(); cap.moveTo(points[0].x, 0);
          for (const p of points) cap.lineTo(p.x, 150 + depth * 30 + this.generator.noise2D((p.x - shift) * 0.018, 86) * 12);
          cap.lineTo(points[points.length - 1].x, 0); cap.closePath();
          const snowPattern = this.glyphs.pattern(this.theme === 'dark' ? '#d7e3de' : '#a0b4b6', font);
          snowPattern.setTransform(new DOMMatrix().translate(shift % 128, 0));
          ctx.globalAlpha = snow; ctx.fillStyle = snowPattern; ctx.fill(cap); ctx.restore();
        }
        const strata = ['cliff-gorge', 'sandstone-canyon'].includes(blend.from) || ['cliff-gorge', 'sandstone-canyon'].includes(blend.to);
        if (strata) {
          ctx.save(); ctx.clip(path); ctx.globalAlpha = 0.65;
          for (let y = 100 + ((index * 9 % 11) + 11) % 11; y < HORIZON; y += 14) {
            for (let x = 0; x < CHUNK_WIDTH; x += 8) this.glyphs.stampChar(ctx, ink, 7, '=', from.x + shift + x, y + x / CHUNK_WIDTH * 9);
          }
          ctx.restore();
        }
        this.drawPlants(from, to, blend.amount, shift, depth, ink);
      }
    }
    this.generator.endFrame();
  }

  private drawPlants(from: TerrainChunk, to: TerrainChunk, amount: number, shift: number, depth: number, color: string) {
    const ctx = this.ctx;
    const pattern = this.glyphs.pattern(color, this.detail === 'low' ? 7 : 5);
    for (let i = 0; i < Math.max(from.plants.length, to.plants.length); i++) {
      const left = from.plants[i], right = to.plants[i];
      const plant = amount < 0.5 ? left ?? right : right ?? left;
      const weight = left && right ? 1 : left ? 1 - amount : amount;
      if (weight < 0.02) continue;
      const x = lerp(left?.x ?? right.x, right?.x ?? left.x, amount) + shift;
      const root = lerp(left?.root ?? right.root, right?.root ?? left.root, amount);
      const h = lerp(left?.height ?? 0, right?.height ?? 0, amount);
      const path = this.plantPath(x, root, h, plant.kind);
      this.erase(ctx, path);
      ctx.globalAlpha = depth === 1 ? 0.65 : 0.95; ctx.fillStyle = pattern; ctx.fill(path);
    }
    ctx.globalAlpha = 1;
  }
  private plantPath(x: number, root: number, height: number, kind: 'pine' | 'rock' | 'reeds') {
    const p = new Path2D();
    if (kind === 'rock') { p.moveTo(x - height * 0.4, root); p.lineTo(x - height * 0.27, root - height * 0.39); p.lineTo(x + height * 0.10, root - height * 0.5); p.lineTo(x + height * 0.5, root); p.closePath(); }
    else if (kind === 'reeds') {
      for (let i = -2; i <= 2; i++) { const at = x + i * height * 0.10; p.rect(at, root - height * (0.7 + Math.abs(i) * 0.08), 0.7, height * (0.7 + Math.abs(i) * 0.08)); p.ellipse(at, root - height * (0.7 + Math.abs(i) * 0.08), 1.2, height * 0.08, i * 0.1, 0, Math.PI * 2); }
    } else {
      p.rect(x - Math.max(0.7, height * 0.018), root - height, Math.max(1.4, height * 0.036), height);
      for (let tier = 0; tier < 4; tier++) { const top = root - height + tier * height * 0.16; const spread = height * (0.10 + tier * 0.045); p.moveTo(x, top); p.lineTo(x + spread, top + height * 0.4); p.lineTo(x - spread, top + height * 0.4); p.closePath(); }
    }
    return p;
  }

  private erase(ctx: CanvasRenderingContext2D, path: Path2D) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  }

  private waterMask() {
    const path = new Path2D();
    const shift = this.time * TRAVEL_SPEED * DEPTH_FACTORS[2];
    path.moveTo(0, this.generator.shoreline(-shift));
    for (let x = 0; x <= this.viewWidth + 8; x += 8) path.lineTo(x, this.generator.shoreline(x - shift));
    path.lineTo(this.viewWidth, WORLD_HEIGHT); path.lineTo(0, WORLD_HEIGHT); path.closePath();
    return path;
  }
  /** Reflections resample scene geometry into upright glyphs, never stretch a bitmap. */
  private reflectionDepth(x: number, y: number, blend: Blend) {
    let result = -1;
    for (let depth = 0; depth < 3; depth++) {
      const wx = x - this.time * TRAVEL_SPEED * DEPTH_FACTORS[depth];
      const height = lerp(this.generator.height(blend.from, depth, wx), this.generator.height(blend.to, depth, wx), blend.amount);
      if (y >= height && y <= this.generator.shoreline(wx)) result = depth;
    }
    return result;
  }
  private drawWater(blend: Blend) {
    const ctx = this.water.getContext('2d', { willReadFrequently: true })!;
    const colors = palette(blend, this.theme);
    const wave = lerp(biome(blend.from).wave, biome(blend.to).wave, blend.amount);
    const w = this.viewWidth;
    ctx.clearRect(0, 0, this.viewWidth + 1, WORLD_HEIGHT);
    ctx.save(); ctx.clip(this.waterMask());
    const columns = this.detail === 'low' ? 65 : this.detail === 'high' ? 140 : 105;
    const rows = this.detail === 'low' ? 20 : this.detail === 'high' ? 40 : 30;
    const ink = mixColor(colors.water, colors.ink, 0.70);
    const reflectedInk = mixColor(colors.sky, colors.ink, this.theme === 'dark' ? 0.65 : 0.60);
    const shine = this.theme === 'dark' ? '#d5ddb4' : '#697c53';
    for (let row = 0; row < rows; row++) {
      const d = row / rows;
      const y = HORIZON + 4 + Math.pow(d, 1.25) * (WORLD_HEIGHT - HORIZON - 2);
      const spacing = w / columns * (0.7 + d * 0.55);
      const font = 7 + Math.floor(d * 2);
      const travel = this.time * (3 + d * 12) % spacing;
      const sourceY = HORIZON - (y - HORIZON) * 0.83;
      const distortion = Math.sin(y * 0.18 + this.time * 0.7) * (1 + d * 5) * wave;
      for (let x = -spacing; x < w + spacing; x += spacing) {
        const at = x + travel;
        const flow = Math.sin(x * 0.015 - this.time * 0.4 + row * 0.55);
        const ripple = Math.sin(x * 0.081 + row * 3.1 + this.time * 0.9) * 0.35;
        const n = this.generator.noise2D(x * 0.014 - this.time * 0.07, row * 0.18);
        const strength = flow * 0.42 + ripple + n * 0.35;
        const sunlight = Math.max(0, 1 - Math.abs(x / w - 0.64) / (0.04 + d * 0.2));
        const depth = this.reflectionDepth(at + distortion, sourceY, blend);
        // One upright ASCII character per water cell: reflection, ripple or glint.
        if (strength + sunlight * 0.9 > 0.90) {
          ctx.globalAlpha = 0.45 + sunlight * 0.45;
          this.glyphs.stampChar(ctx, shine, 8, '*', at, y);
        } else if (depth >= 0 && strength < 0.38) {
          ctx.globalAlpha = 0.23 + depth * 0.10;
          this.glyphs.stampChar(ctx, reflectedInk, font, ['.', ':', '='][depth], at, y);
        } else if (strength > 0.04) {
          ctx.globalAlpha = 0.2 + Math.max(0, strength) * 0.45;
          this.glyphs.stampChar(ctx, ink, font, strength > 0.4 ? '~' : strength > 0.2 ? '-' : '.', at, y);
        } else if (sourceY < 220) {
          const cloud = this.generator.noise3D((at + distortion - this.time * 3.4) * 0.006, sourceY * 0.018, this.time * 0.008);
          if (cloud > 0.32) { ctx.globalAlpha = 0.20; this.glyphs.stampChar(ctx, reflectedInk, 7, '.', at, y); }
        }
      }
    }
    ctx.restore();
  }

  private drawForeground(blend: Blend) {
    const ctx = this.front;
    ctx.clearRect(0, 0, this.viewWidth, WORLD_HEIGHT);
    const colors = palette(blend, this.theme);
    const id = blend.amount > 0.5 ? blend.to : blend.from;
    const b = biome(id);
    const shift = this.time * TRAVEL_SPEED;
    const first = Math.floor(-shift / CHUNK_WIDTH);
    for (let chunk = first; chunk <= Math.ceil((this.viewWidth - shift) / CHUNK_WIDTH); chunk++) {
      for (let i = 0; i < 4; i++) {
        const worldX = chunk * CHUNK_WIDTH + i * 91 + 21;
        const x = worldX + shift;
        const margin = this.viewWidth * 0.11;
        if (x > margin && x < this.viewWidth - margin || this.width < 600 && x < this.viewWidth / 2) continue;
        const n = this.generator.noise2D(worldX * 0.021, 18);
        const h = 38 + (n + 1) * (b.kind === 'pine' ? 48 : b.kind === 'reeds' ? 24 : 12);
        const root = 526 + this.generator.noise2D(worldX * 0.01, 55) * 5;
        const kind = b.kind === 'pine' || b.kind === 'snow' ? 'pine' : b.kind === 'reeds' ? 'reeds' : 'rock';
        const ground = new Path2D(); ground.ellipse(x, root + 2, h * 0.65, 28, 0, 0, Math.PI * 2);
        this.erase(this.ctx, ground);
        ctx.globalAlpha = 0.7; ctx.fillStyle = this.glyphs.pattern(colors.ink, 7); ctx.fill(ground);
        const shape = this.plantPath(x, root, h, kind);
        this.erase(this.ctx, shape);
        ctx.globalAlpha = 0.9; ctx.fillStyle = this.glyphs.pattern(colors.ink, 7); ctx.fill(shape);
        ctx.globalAlpha = 1;
      }
    }
  }

  private render() {
    const ctx = this.ctx, w = this.viewWidth;
    const blend = this.journey.blend;
    const colors = palette(blend, this.theme);
    // The single flat page color is the only backdrop; all scenery is glyph paint.
    this.host.style.backgroundColor = colors.sky;
    ctx.clearRect(0, 0, w, WORLD_HEIGHT);
    for (let y = -16; y <= 16; y += 8) for (let x = -16; x <= 16; x += 8) {
      if (x * x + y * y > 16 * 16 || this.theme === 'dark' && x < -4) continue;
      ctx.globalAlpha = 0.65;
      this.glyphs.stampChar(ctx, mixColor(colors.sun, colors.ink, this.theme === 'dark' ? 0.05 : 0.42), 9, Math.abs(x) + Math.abs(y) < 10 ? 'O' : 'o', w * 0.64 + x, 88 + y);
    }
    ctx.globalAlpha = 1;
    if (this.time - this.lastCloud >= (this.detail === 'low' ? 0.24 : 0.12)) { this.drawClouds(blend); this.lastCloud = this.time; }
    ctx.drawImage(this.clouds, 0, 0, this.viewWidth, 250);
    this.drawTerrain(blend);
    if (this.time - this.lastWater >= (this.detail === 'low' ? 0.15 : 0.065)) {
      this.drawWater(blend); this.lastWater = this.time;
    }
    this.erase(ctx, this.waterMask());
    ctx.save(); ctx.clip(this.waterMask()); ctx.drawImage(this.water, 0, 0, this.viewWidth, WORLD_HEIGHT); ctx.restore();
    // Mist follows the same bank instead of leaving independent floating silhouettes.
    if (blend.from === 'reed-wetland' || blend.to === 'reed-wetland') {
      ctx.globalAlpha = 0.25;
      for (let x = 0; x < w; x += 11) this.glyphs.stampChar(ctx, mixColor(colors.sky, colors.ink, 0.5), 8, '~', x, HORIZON - 7 + Math.sin(x * 0.01 + this.time * 0.1) * 3);
      ctx.globalAlpha = 1;
    }
    this.sprite.clearRect(0, 0, w, WORLD_HEIGHT);
    const x = this.width < 600 ? Math.max(44, (this.width - 185) / 2) / this.scale : w * 0.46;
    const spriteScale = this.width < 360 ? 1.3 : this.width < 600 ? 1.7 : 2;
    this.friend.draw(this.sprite, x, 402, spriteScale, this.time, this.activity, this.theme === 'dark');
    this.drawForeground(blend);
    this.notify();
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden || !this.width || !this.height) { this.last = 0; return; }
    if (!this.dirty && (!this.motion || this.last && now - this.last < 1000 / 30)) return;
    const delta = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.motion) { this.time += delta; this.journey.advance(delta); }
    const start = performance.now();
    try { this.render(); } catch { this.dispose(); this.onFailure(); return; }
    this.timings.push(performance.now() - start);
    if (this.timings.length > 120) this.timings.shift();
    this.renderedFrames++;
    this.dirty = false;
    if (this.quality === 'auto' && !this.constrained && this.timings.length >= 30 && this.timings.slice(-30).reduce((a, b) => a + b, 0) / 30 > 28) {
      this.constrained = true;
      this.configureEffects();
    }
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    this.observer.disconnect(); document.removeEventListener('visibilitychange', this.onVisibility);
    this.generator.clear(); this.glyphs.clear(); this.friend.clear();
    this.landscape.remove(); this.companion.remove(); this.foreground.remove();
    for (const canvas of [this.clouds, this.water]) { canvas.width = canvas.height = 0; }
  }
}
