import { test, expect } from '@playwright/test';
import { BIOMES, CHUNK_WIDTH, Journey, TerrainGenerator, palette, type SceneConfig } from '../src/terrain';

const config: SceneConfig = { biome: 'pine-river', seed: 1729, autoJourney: true };

test('all biomes reproduce from a seed and meet their neighboring chunk exactly', () => {
  for (const b of BIOMES) for (let depth = 0; depth < 3; depth++) {
    const a = new TerrainGenerator(1729), replay = new TerrainGenerator(1729), other = new TerrainGenerator(1730);
    for (const index of [-17, -1, 0, 1, 71]) {
      const chunk = a.chunk(b.id, depth, index);
      const neighbor = a.chunk(b.id, depth, index + 1);
      expect(chunk).toEqual(replay.chunk(b.id, depth, index));
      expect(chunk.samples.at(-1)).toEqual(neighbor.samples[0]);
      expect(chunk.samples.at(-1)!.x - chunk.samples[0].x).toBe(CHUNK_WIDTH);
      expect(chunk.samples).not.toEqual(other.chunk(b.id, depth, index).samples);
      for (const plant of chunk.plants) {
        expect(plant.root).toBeLessThan(a.shoreline(plant.x));
        expect(plant.height).toBeGreaterThan(0);
      }
    }
  }
});

test('active-time route transitions, pauses mid-transition and manual selection holds', () => {
  const route = new Journey({ ...config });
  expect(route.advance(179.9).to).toBe('pine-river');
  route.advance(0.1);
  const mid = route.advance(10);
  expect(mid.from).toBe('pine-river');
  expect(mid.to).toBe('alpine-lake');
  expect(mid.amount).toBeCloseTo(0.5);
  route.setAuto(false);
  expect(route.advance(1000)).toEqual(mid);
  route.setAuto(true);
  expect(route.advance(10).from).toBe('alpine-lake');
  route.select('coastal-inlet');
  expect(route.config.autoJourney).toBe(false);
  expect(route.advance(10000).to).toBe('coastal-inlet');
  route.setAuto(true);
  expect(route.advance(200).to).toBe('reed-wetland');
  expect(palette({ from: 'pine-river', to: 'alpine-lake', amount: 0 }, 'light')).toEqual(palette({ from: 'pine-river', to: 'pine-river', amount: 0 }, 'light'));
});

test('half an hour of chunk travel and 100 regenerations have bounded live caches', () => {
  let terrain = new TerrainGenerator(1729);
  for (let second = 0; second <= 1800; second += 6) {
    terrain.beginFrame();
    for (let depth = 0; depth < 3; depth++) {
      const start = -Math.floor(second * (depth + 1) / 18);
      for (let index = start; index < start + 7; index++) terrain.chunk(BIOMES[Math.floor(second / 180) % 6].id, depth, index);
    }
    terrain.endFrame();
    expect(terrain.chunks.size).toBeLessThanOrEqual(21);
  }
  for (let seed = 0; seed < 100; seed++) {
    terrain.clear();
    expect(terrain.chunks.size).toBe(0);
    terrain = new TerrainGenerator(seed);
    terrain.beginFrame(); terrain.chunk('pine-river', 2, 0); terrain.endFrame();
    expect(terrain.chunks.size).toBe(1);
  }
});
