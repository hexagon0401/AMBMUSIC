export type Activity = 'rest' | 'fish' | 'row' | 'sleep' | 'look';
export const COMPANION_COLOR = '#d9b34e';
export const COMPANION_WIDTH = 16;
export const COMPANION_HEIGHT = 12;

/** Pixel art stays separate from the monochrome ASCII scenery. */
export class Companion {
  private poses = new Map<string, HTMLCanvasElement>();
  private boat?: HTMLCanvasElement;
  private pose(activity: Activity, phase: number) {
    const key = `${activity}:${phase}`;
    const cached = this.poses.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 12;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = COMPANION_COLOR;
    ctx.fillRect(3, 1, 10, 7);
    ctx.fillRect(1, 4, 2, 3);
    ctx.fillRect(13, activity === 'look' ? 3 : 4, 2, 3);
    for (const [i, x] of [3, 6, 9, 12].entries()) ctx.fillRect(x + (activity === 'row' && (i + phase) % 2 === 0 ? 1 : 0), 8, 1, 1);
    ctx.fillStyle = '#20201b';
    ctx.fillRect(5, 3, activity === 'sleep' ? 2 : 1, 1);
    ctx.fillRect(10, 3, activity === 'sleep' ? 2 : 1, 1);
    this.poses.set(key, canvas);
    return canvas;
  }
  private hull() {
    if (this.boat) return this.boat;
    const canvas = this.boat = document.createElement('canvas');
    canvas.width = 32; canvas.height = 6;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#7b5826'; ctx.fillRect(1, 0, 30, 2); ctx.fillRect(2, 2, 28, 2); ctx.fillRect(5, 4, 22, 1);
    ctx.fillStyle = '#c89a47'; ctx.fillRect(1, 0, 30, 1); ctx.fillRect(2, 1, 28, 1); ctx.fillRect(3, 2, 26, 1); ctx.fillRect(5, 3, 22, 1);
    ctx.fillStyle = '#a07632';
    for (let x = 3; x < 29; x += 3) { ctx.fillRect(x, 1, 1, 1); ctx.fillRect(x + 1, 3, 1, 1); }
    return canvas;
  }
  private pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
    ctx.fillStyle = color;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number, activity: Activity, dark: boolean) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + Math.sin(time * 0.8) * 0.6));
    ctx.scale(scale, scale); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.hull(), -16, 0);
    ctx.save();
    const avatarScale = scale >= 4 ? 1.25 : 4 / 3;
    ctx.scale(avatarScale, avatarScale);
    if (activity === 'sleep') { ctx.translate(0, -4); ctx.rotate(-Math.PI / 2); ctx.drawImage(this.pose(activity, 0), -8, -5); }
    else ctx.drawImage(this.pose(activity, Math.floor(time * 1.3) % 2), -8, -9);
    ctx.restore();
    if (activity === 'fish') {
      this.pixelLine(ctx, -8, -4, -10, -17, '#9d9d9a');
      this.pixelLine(ctx, -10, -17, -9, -25, '#d2d2ce');
      this.pixelLine(ctx, -9, -25, -8, -27, '#b9b9ce');
      this.pixelLine(ctx, -11, -2, -11, -18, '#777b7d');
      this.pixelLine(ctx, -11, -18, -9, -25, '#777b7d');
    } else if (activity === 'row') {
      const phase = Math.round(Math.sin(time * 1.4) * 3);
      this.pixelLine(ctx, 7, -4, 13 + phase, 6, '#a68b4d');
      ctx.fillStyle = '#c39e55'; ctx.fillRect(12 + phase, 4, 2, 4);
    } else if (activity === 'look') {
      ctx.fillStyle = '#8d743f'; ctx.fillRect(5, -6, 6, 2); ctx.fillRect(10, -7, 2, 3);
    } else if (activity === 'sleep') {
      ctx.fillStyle = dark ? '#d5d5cf' : '#4b5149';
      ctx.fillRect(6, -12, 3, 1); ctx.fillRect(8, -11, 1, 1); ctx.fillRect(6, -10, 3, 1);
    }
    ctx.restore();
  }
  clear() { this.poses.clear(); this.boat = undefined; }
}
