export type Activity = 'rest' | 'fish' | 'row' | 'sleep' | 'look';
export const COMPANION_COLOR = '#d9b34e';
export const COMPANION_WIDTH = 16;
export const COMPANION_HEIGHT = 12;

export class Companion {
  private poses = new Map<string, HTMLCanvasElement>();
  private pose(activity: Activity, phase: number) {
    const key = `${activity}:${phase}`;
    const cached = this.poses.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = COMPANION_WIDTH; canvas.height = COMPANION_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = COMPANION_COLOR;
    ctx.fillRect(3, 2, 10, 5);
    ctx.fillRect(1, 3, 2, 3);
    ctx.fillRect(13, activity === 'look' ? 2 : 3, 2, activity === 'look' ? 2 : 3);
    for (const [i, x] of [3, 6, 9, 12].entries()) ctx.fillRect(x + (activity === 'row' && (i + phase) % 2 === 0 ? 1 : 0), 7, 1, 1);
    ctx.fillStyle = '#151a16';
    ctx.fillRect(6, 4, activity === 'sleep' ? 2 : 1, 1);
    ctx.fillRect(10, 4, activity === 'sleep' ? 2 : 1, 1);
    this.poses.set(key, canvas);
    return canvas;
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number, activity: Activity, dark: boolean) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + Math.sin(time * 0.9) * 0.8));
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    // Contact shadow and wake belong to the boat, not to the two-color sprite.
    ctx.fillStyle = dark ? '#a1c5b3' : '#3b685b';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-34, 4, 68, 1);
    for (let i = 0; i < 3; i++) ctx.fillRect(-43 - i * 5 - Math.sin(time + i) * 1.5, i * 2 + 2, 8, 0.5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#574d36'; ctx.fillRect(-30, -2, 60, 3); ctx.fillRect(-27, 1, 54, 2); ctx.fillRect(-23, 3, 46, 1);
    ctx.fillStyle = '#9d8452'; ctx.fillRect(-29, -3, 58, 1);
    ctx.save();
    if (activity === 'sleep') { ctx.translate(-3, -8); ctx.rotate(-Math.PI / 2); ctx.drawImage(this.pose(activity, 0), -8, -6); }
    else ctx.drawImage(this.pose(activity, Math.floor(time * 1.4) % 2), -8, -11);
    ctx.restore();
    ctx.strokeStyle = dark ? '#c9c9a8' : '#6e6444';
    ctx.lineWidth = 0.6;
    if (activity === 'fish') {
      ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(23, -29); ctx.stroke();
      ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(23, -29); ctx.quadraticCurveTo(35, -17, 35, 7); ctx.stroke();
      ctx.fillStyle = COMPANION_COLOR; ctx.fillRect(34.5, 7, 1, 1);
    } else if (activity === 'row') {
      ctx.save(); ctx.translate(7, -6); ctx.rotate(-0.5 + Math.sin(time * 1.5) * 0.45);
      ctx.fillStyle = '#a38b5d'; ctx.fillRect(0, -7, 1, 19); ctx.fillRect(-1, 9, 3, 5); ctx.restore();
    } else if (activity === 'look') {
      ctx.fillStyle = '#8c7745'; ctx.fillRect(5, -10, 7, 2); ctx.fillRect(11, -11, 1, 4);
    } else if (activity === 'sleep') {
      ctx.fillStyle = dark ? '#c5d1bb' : '#5f7765';
      ctx.fillRect(7, -17, 3, 0.5); ctx.fillRect(9, -16, 0.5, 1); ctx.fillRect(7, -14.5, 3, 0.5);
    }
    ctx.restore();
  }
  clear() { this.poses.clear(); }
}
