import { createNoise2D, createNoise3D } from 'simplex-noise';

export const BIOMES = [
  { id: 'pine-river', name: '침엽수 강', subtitle: '나무 사이로 흐르는 조용한 강', kind: 'pine', heights: [136, 100, 58], trees: 16, cloud: 0.48, wave: 0.65, light: ['#edf1e6', '#d9e3d5', '#355d4e', '#6d9786', '#dbcc9a'], dark: ['#101f22', '#203a3c', '#8bbaa1', '#426e69', '#d9ddb9'] },
  { id: 'alpine-lake', name: '설산 호수', subtitle: '눈 덮인 봉우리와 유리 같은 물', kind: 'snow', heights: [230, 169, 76], trees: 4, cloud: 0.59, wave: 0.30, light: ['#eff3f1', '#d5e2e3', '#557b82', '#769da3', '#dfd9b8'], dark: ['#101e29', '#273c4d', '#a8c4d0', '#4b7485', '#e3e8de'] },
  { id: 'cliff-gorge', name: '절벽 협곡', subtitle: '깎아지른 바위 사이, 깊고 느린 물', kind: 'cliff', heights: [152, 205, 123], trees: 2, cloud: 0.42, wave: 0.55, light: ['#edece4', '#d8ddcf', '#5b6759', '#728f7a', '#d8c89d'], dark: ['#191f22', '#303b3b', '#b0b69a', '#4f7369', '#ddd1ab'] },
  { id: 'sandstone-canyon', name: '사암 협곡', subtitle: '겹겹이 쌓인 시간과 따뜻한 암벽', kind: 'sand', heights: [155, 193, 108], trees: 0, cloud: 0.23, wave: 0.45, light: ['#f5eedf', '#e5d9be', '#9c7055', '#a5a184', '#dfb96e'], dark: ['#211e23', '#46383c', '#d0a481', '#727f78', '#e1c899'] },
  { id: 'coastal-inlet', name: '해안 포구', subtitle: '낮은 섬 너머로 펼쳐지는 수평선', kind: 'coast', heights: [53, 85, 65], trees: 3, cloud: 0.64, wave: 1.0, light: ['#eef3ee', '#d9e6de', '#557968', '#77a698', '#ddd29d'], dark: ['#111f2a', '#293f4a', '#9cbbac', '#497f83', '#e1dfb9'] },
  { id: 'reed-wetland', name: '갈대 습지', subtitle: '안개와 갈대가 천천히 숨 쉬는 곳', kind: 'reeds', heights: [41, 26, 14], trees: 23, cloud: 0.73, wave: 0.22, light: ['#f1f0e3', '#e0e4cb', '#72805a', '#97aa7b', '#dbcf96'], dark: ['#191f1b', '#333d2c', '#b2bd86', '#637c5b', '#d6d4a5'] },
] as const;
export type BiomeId = typeof BIOMES[number]['id'];
export type Biome = typeof BIOMES[number];
export type Theme = 'light' | 'dark';
export type SceneConfig = { biome: BiomeId; seed: number; autoJourney: boolean };
export type Blend = { from: BiomeId; to: BiomeId; amount: number };
export const CHUNK_WIDTH = 384;
export const WORLD_HEIGHT = 512;
export const HORIZON = 302;
export const TRAVEL_SPEED = 32;
export const DEPTH_FACTORS = [0.055, 0.14, 0.32] as const;
export const SCENE_STORAGE = 'ambmusic.scene.v1';
export function biome(id: BiomeId): Biome { return BIOMES.find((b) => b.id === id)!; }
export function isBiome(id: unknown): id is BiomeId { return BIOMES.some((b) => b.id === id); }
export function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
export function freshSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function smooth(t: number) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
export function mixColor(a: string, b: string, t: number) {
  const channels = [1, 3, 5].map((at) => Math.round(lerp(parseInt(a.slice(at, at + 2), 16), parseInt(b.slice(at, at + 2), 16), t)).toString(16).padStart(2, '0'));
  return `#${channels.join('')}`;
}
export function palette(blend: Blend, theme: Theme) {
  const from = biome(blend.from)[theme], to = biome(blend.to)[theme];
  const colors = from.map((c, i) => mixColor(c, to[i], blend.amount));
  return { sky: colors[0], mist: colors[1], ink: colors[2], water: colors[3], sun: colors[4] };
}
export function readSceneConfig(): SceneConfig {
  const fallback: SceneConfig = { biome: 'pine-river', seed: freshSeed(), autoJourney: true };
  try {
    const value = JSON.parse(localStorage.getItem(SCENE_STORAGE) || 'null');
    if (value && isBiome(value.biome) && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff && typeof value.autoJourney === 'boolean') return { biome: value.biome, seed: value.seed, autoJourney: value.autoJourney };
  } catch { /* Invalid or unavailable storage is optional. */ }
  return fallback;
}

/** Active visible time only; the renderer freezes this clock when hidden or still. */
export class Journey {
  private elapsed = 0;
  private start: number;
  constructor(public config: SceneConfig) { this.start = BIOMES.findIndex((b) => b.id === config.biome); }
  advance(seconds: number): Blend { if (this.config.autoJourney) this.elapsed += Math.max(0, seconds); return this.blend; }
  get blend(): Blend {
    const slot = Math.floor(this.elapsed / 180);
    const phase = this.elapsed % 180;
    const to = BIOMES[(this.start + slot) % BIOMES.length].id;
    const from = slot > 0 && phase < 20 ? BIOMES[(this.start + slot - 1) % BIOMES.length].id : to;
    return { from, to, amount: from === to ? 0 : smooth(phase / 20) };
  }
  select(id: BiomeId) { this.config = { ...this.config, biome: id, autoJourney: false }; this.start = BIOMES.findIndex((b) => b.id === id); this.elapsed = 0; }
  setAuto(enabled: boolean) {
    this.config = { ...this.config, autoJourney: enabled };
  }
}

export type Plant = { x: number; root: number; height: number; kind: 'pine' | 'rock' | 'reeds' };
export type TerrainChunk = { index: number; x: number; samples: { x: number; y: number; shore: number }[]; plants: Plant[] };

export class TerrainGenerator {
  readonly noise2D;
  readonly noise3D;
  readonly chunks = new Map<string, TerrainChunk>();
  private used = new Set<string>();
  constructor(readonly seed: number) {
    this.noise2D = createNoise2D(seeded(seed));
    this.noise3D = createNoise3D(seeded(seed ^ 0x9e3779b9));
  }
  shoreline(x: number) { return HORIZON + this.noise2D(x * 0.002, 71) * 5; }
  height(id: BiomeId, depth: number, x: number) {
    const b = biome(id);
    const n = this.noise2D(x * 0.0022, depth * 11 + 4);
    const detail = this.noise2D(x * 0.008, depth * 11 + 18);
    let relief = 0.28 + (1 - Math.abs(n)) * 0.55 + detail * 0.12;
    if (b.kind === 'cliff' || b.kind === 'sand') relief = Math.round(relief * 5) / 5 + detail * 0.018;
    if (b.kind === 'coast') relief *= smooth((n + 0.23) * 2.5);
    return this.shoreline(x) - 8 - b.heights[depth] * relief;
  }
  beginFrame() { this.used.clear(); }
  chunk(id: BiomeId, depth: number, index: number): TerrainChunk {
    const key = `${id}:${depth}:${index}`;
    this.used.add(key);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const x = index * CHUNK_WIDTH;
    const samples = Array.from({ length: CHUNK_WIDTH / 4 + 1 }, (_, i) => {
      const at = x + i * 4;
      return { x: at, y: this.height(id, depth, at), shore: this.shoreline(at) };
    });
    const b = biome(id);
    const rng = seeded((this.seed ^ Math.imul(index + 1531, 2654435761) ^ depth * 431) >>> 0);
    const count = Math.round(b.trees * (depth === 2 ? 1 : depth === 1 ? 0.55 : 0));
    const plants: Plant[] = [];
    for (let i = 0; i < count; i++) {
      const at = x + (i + 0.2 + rng() * 0.6) / count * CHUNK_WIDTH;
      plants.push({ x: at, root: this.shoreline(at) - 2 - rng() * 6, height: (depth === 2 ? 20 : 11) + rng() * (depth === 2 ? 35 : 17), kind: b.kind === 'reeds' ? 'reeds' : b.kind === 'cliff' || b.kind === 'coast' ? 'rock' : 'pine' });
    }
    const result = { index, x, samples, plants };
    this.chunks.set(key, result);
    return result;
  }
  endFrame() { for (const key of this.chunks.keys()) if (!this.used.has(key)) this.chunks.delete(key); }
  clear() { this.chunks.clear(); this.used.clear(); }
}
