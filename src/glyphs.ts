/** Small, bounded caches. Text is rasterized only when an atlas or pattern is made. */
export class Glyphs {
  private atlases = new Map<string, HTMLCanvasElement>();
  private patterns = new Map<string, CanvasPattern>();
  readonly chars = ' .,:;~-=+/|x*#01[]{}oO';
  constructor(private context: CanvasRenderingContext2D) {}
  atlas(color: string, size: number) {
    const key = `${color}:${size}`;
    let canvas = this.atlases.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.dataset.renderLayer = 'glyph-atlas';
      canvas.width = this.chars.length * 12;
      canvas.height = 16;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.font = `${size}px monospace`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [...this.chars].forEach((char, i) => ctx.fillText(char, i * 12 + 6, 8));
      this.atlases.set(key, canvas);
      if (this.atlases.size > 24) this.atlases.delete(this.atlases.keys().next().value!);
    }
    return canvas;
  }
  stamp(ctx: CanvasRenderingContext2D, color: string, size: number, value: number, x: number, y: number) {
    const index = Math.max(1, Math.min(this.chars.length - 1, Math.floor(value * (this.chars.length - 1))));
    ctx.drawImage(this.atlas(color, size), index * 12, 0, 12, 16, x - 6, y - 8, 12, 16);
  }
  stampChar(ctx: CanvasRenderingContext2D, color: string, size: number, char: string, x: number, y: number) {
    const index = this.chars.indexOf(char);
    if (index < 1) return;
    ctx.drawImage(this.atlas(color, size), index * 12, 0, 12, 16, x - 6, y - 8, 12, 16);
  }
  pattern(color: string, size: number) {
    const key = `${color}:${size}`;
    let pattern = this.patterns.get(key);
    if (!pattern) {
      const tile = document.createElement('canvas');
      tile.dataset.renderLayer = 'glyph-pattern';
      tile.width = 128; tile.height = 128;
      const ctx = tile.getContext('2d', { willReadFrequently: true })!;
      let seed = 733;
      for (let y = 3; y < 128; y += size * 1.25) for (let x = 2; x < 128; x += size * 0.75) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        if (seed / 4294967296 > 0.13) this.stamp(ctx, color, size, (seed % 100) / 100, x, y);
      }
      pattern = this.context.createPattern(tile, 'repeat')!;
      this.patterns.set(key, pattern);
      if (this.patterns.size > 18) this.patterns.delete(this.patterns.keys().next().value!);
    }
    return pattern;
  }
  get size() { return this.atlases.size + this.patterns.size; }
  clear() { this.atlases.clear(); this.patterns.clear(); }
}
