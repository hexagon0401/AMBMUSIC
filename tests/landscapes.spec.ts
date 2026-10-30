import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { BIOMES, SCENE_STORAGE } from '../src/terrain';
const artifacts = '/tmp/ambmusic-artifacts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ biome: 'pine-river', seed: 1729, autoJourney: true }));
    const violations: string[] = (window as any).__backgroundPaintViolations = [];
    (window as any).__backgroundGlyphPaints = 0;
    (window as any).__backgroundGlyphCharacters = 0;
    (window as any).__backgroundScaleViolations = [];
    const proto = CanvasRenderingContext2D.prototype;
    const originalFill = proto.fill;
    proto.fill = function (...args: any[]) {
      if (this.canvas.dataset.renderLayer && this.globalCompositeOperation !== 'destination-out' && !(this.fillStyle instanceof CanvasPattern)) violations.push(`solid fill: ${this.canvas.dataset.renderLayer}`);
      return originalFill.apply(this, args as any);
    };
    for (const method of ['fillRect', 'stroke', 'strokeRect'] as const) {
      const original = proto[method];
      (proto as any)[method] = function (...args: any[]) {
        if (this.canvas.dataset.renderLayer && this.globalCompositeOperation !== 'destination-out') violations.push(`${method}: ${this.canvas.dataset.renderLayer}`);
        return original.apply(this, args as any);
      };
    }
    const originalImage = proto.drawImage;
    proto.drawImage = function (...args: any[]) {
      if (this.canvas.dataset.renderLayer) (window as any).__backgroundGlyphPaints++;
      if (this.canvas.dataset.renderLayer && args[0] instanceof HTMLCanvasElement && args[0].dataset.renderLayer === 'ascii-tile' && args.length === 5) {
        const transform = this.getTransform();
        const dx = Math.abs(args[0].width - args[3] * Math.hypot(transform.a, transform.b));
        const dy = Math.abs(args[0].height - args[4] * Math.hypot(transform.c, transform.d));
        if (dx > 1 || dy > 1) (window as any).__backgroundScaleViolations.push({ dx, dy });
      }
      if (this.canvas.dataset.renderLayer && (!(args[0] instanceof HTMLCanvasElement) || !args[0].dataset.renderLayer)) violations.push('non-glyph image source');
      return originalImage.apply(this, args as any);
    };
    const originalText = proto.fillText;
    proto.fillText = function (text: string, ...args: any[]) {
      if (this.canvas.dataset.renderLayer) (window as any).__backgroundGlyphCharacters += text.replace(/\s/g, '').length;
      if (this.canvas.dataset.renderLayer && /[^\x00-\x7f]/.test(text)) violations.push('non-ASCII text');
      return originalText.apply(this, [text, ...args] as any);
    };
  }, { key: SCENE_STORAGE });
  await mkdir(artifacts, { recursive: true });
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`six landscapes × two themes at ${viewport.width}px render without errors`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await page.goto('/');
    const captures: Buffer[] = [];
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
      for (const b of BIOMES) {
        await page.getByLabel('풍경 고르기').selectOption(b.id);
        await expect(page.locator('#scene')).toHaveAttribute('data-biome', b.id);
        await expect(page.locator('.foreground-canvas')).toBeVisible();
        await expect(page.locator('#auto-journey')).not.toBeChecked();
        await page.waitForTimeout(65);
        captures.push(await page.locator('#scene').screenshot({ path: `${artifacts}/${b.id}-${theme}-${viewport.width}.png` }));
      }
    }
    for (let i = 1; i < 6; i++) expect(captures[i].equals(captures[0])).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as any).__backgroundPaintViolations)).toEqual([]);
    expect(await page.evaluate(() => (window as any).__backgroundGlyphPaints)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).__backgroundGlyphCharacters)).toBeGreaterThan(100);
    expect(await page.evaluate(() => (window as any).__backgroundScaleViolations)).toEqual([]);
    await expect(page.locator('.scene-grain')).toHaveCSS('background-image', 'none');
    await expect(page.locator('.scene-fallback')).toBeHidden();
  });
}

test('selecting, regenerating and reloading preserves audio, timer and settings correctly', async ({ page }) => {
  await page.goto('/');
  await page.locator('.main-play').click();
  await page.getByRole('button', { name: '집중 타이머' }).click();
  await page.locator('[data-minutes="25"]').click();
  const seed = await page.locator('#scene').getAttribute('data-seed');
  await page.getByLabel('풍경 고르기').selectOption('sandstone-canyon');
  await expect(page.locator('.main-play')).toHaveAttribute('aria-label', '자연 소리 일시정지');
  await expect(page.locator('#timer-label')).toHaveText(/24:|25:/);
  await expect(page.locator('#auto-journey')).not.toBeChecked();
  await page.getByRole('button', { name: '새 풍경' }).click();
  await expect(page.locator('#scene')).not.toHaveAttribute('data-seed', seed!);
  const regenerated = await page.locator('#scene').getAttribute('data-seed');
  await expect(page.locator('#scene')).toHaveAttribute('data-biome', 'sandstone-canyon');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('.main-play')).toHaveAttribute('aria-label', '자연 소리 일시정지');
  await expect(page.locator('#timer-label')).toHaveText(/24:|25:/);
  await page.reload();
  await expect(page.locator('#landscape-select')).toHaveValue('sandstone-canyon');
  await expect(page.locator('#scene')).toHaveAttribute('data-seed', regenerated!);
  await expect(page.locator('#auto-journey')).not.toBeChecked();
});

async function rendererFixture(page: Page) {
  await page.route('**/renderer-fixture', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body style="margin:0"><div id="host" style="position:relative;width:1440px;height:560px"></div><style>canvas{position:absolute;inset:0;width:100%;height:100%}</style><script type="module">import {RiverScene} from '/src/scene.ts'; window.renderer = new RiverScene(document.querySelector('#host'), () => {document.body.dataset.failed='true'}, 'light', {config: {biome:'pine-river',seed:1729,autoJourney:true}});</script></body></html>` }));
  await page.goto('/renderer-fixture');
  await expect(page.locator('.companion-canvas')).toBeVisible();
  await page.waitForTimeout(100);
}

test('visible time drives the journey; hidden and reduced-motion time cannot jump it', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-31T00:00:01Z'));
  await rendererFixture(page);
  await page.clock.runFor(100);
  await page.clock.fastForward(180000);
  await page.clock.runFor(80);
  await expect(page.locator('#host')).toHaveAttribute('data-biome', 'alpine-lake');
  await expect(page.locator('#host')).toHaveAttribute('data-transitioning', 'true');
  await page.clock.fastForward(20100);
  await page.clock.runFor(80);
  await expect(page.locator('#host')).toHaveAttribute('data-transitioning', 'false');
  const before = await page.evaluate(() => {
    const time = (window as any).renderer.getDiagnostics().time;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    return time;
  });
  await page.clock.fastForward(600000);
  expect(await page.evaluate(() => (window as any).renderer.getDiagnostics().time)).toBe(before);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.fastForward(34);
  expect(await page.evaluate(() => (window as any).renderer.getDiagnostics().time)).toBeLessThan(before + 0.1);
  await page.evaluate(() => (window as any).renderer.setMotion(false));
  await page.clock.fastForward(1000000);
  const frozen = await page.evaluate(() => (window as any).renderer.getDiagnostics());
  expect(frozen.time).toBeLessThan(before + 0.1);
  expect(frozen.chunks).toBeLessThanOrEqual(48);
  expect(frozen.glyphCaches).toBeLessThanOrEqual(42);
});

test('renderer records real frame cost and keeps caches bounded after regeneration', async ({ page }) => {
  test.setTimeout(60000);
  await rendererFixture(page);
  await page.waitForTimeout(5200);
  const metrics = await page.evaluate(() => (window as any).renderer.getDiagnostics());
  expect(metrics.renderedFrames).toBeGreaterThan(5);
  expect(metrics.averageRenderMs).toBeGreaterThan(0);
  // Detect atlas-size churn, rather than claiming hardware-independent 30fps.
  expect(metrics.averageRenderMs).toBeLessThan(100);
  expect(metrics.p95RenderMs).toBeLessThan(1000);
  expect(metrics.chunks).toBeLessThanOrEqual(48);
  await page.evaluate(() => { const renderer = (window as any).renderer; for (let i = 0; i < 100; i++) renderer.regenerate(); });
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => (window as any).renderer.getDiagnostics());
  expect(after.chunks).toBeLessThanOrEqual(48);
  expect(after.glyphCaches).toBeLessThanOrEqual(42);
  expect(await page.locator('body').getAttribute('data-failed')).toBeNull();
  await writeFile(`${artifacts}/render-metrics.json`, JSON.stringify({ browser: 'Chromium, headless, default rendering backend', viewport: '1440×560', before: metrics, after }, null, 2));
  console.log(`Renderer command cost: mean ${metrics.averageRenderMs.toFixed(2)}ms, p95 ${metrics.p95RenderMs.toFixed(2)}ms; ${metrics.chunks} live chunks.`);
});


for (const dpr of [1.25, 2]) {
  test.describe(`native text resolution at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test('low quality keeps native pixels and readable text; cached frames stay smooth', async ({ page }) => {
      test.setTimeout(60000);
      await rendererFixture(page);
      await page.waitForTimeout(2600);
      const before = await page.evaluate(() => (window as any).renderer.getDiagnostics());
      expect(before.dpr).toBe(dpr);
      expect(before.fontSize).toBeGreaterThanOrEqual(10);
      expect(before.effectScale).toBe(1);
      expect(before.frameRate).toBeGreaterThan(45);
      expect(before.p95RenderMs).toBeLessThan(32);
      await page.waitForTimeout(300);
      const cached = await page.evaluate(() => (window as any).renderer.getDiagnostics());
      expect(cached.layerBuilds).toBe(before.layerBuilds);
      await page.evaluate(() => (window as any).renderer.setMotion(false));
      for (const quality of ['low', 'high']) {
        await page.evaluate((value) => (window as any).renderer.setQuality(value), quality);
        await page.waitForTimeout(100);
        const current = await page.evaluate(() => (window as any).renderer.getDiagnostics());
        expect(current.dpr).toBe(dpr);
        expect(current.fontSize).toBe(before.fontSize);
        expect(current.effectScale).toBe(1);
      }
      const after = await page.evaluate(() => (window as any).renderer.getDiagnostics());
      expect(await page.evaluate(() => (window as any).__backgroundScaleViolations)).toEqual([]);
      expect(await page.locator('.landscape-canvas').evaluate((canvas: HTMLCanvasElement) => Math.abs(canvas.width - canvas.getBoundingClientRect().width * devicePixelRatio))).toBeLessThanOrEqual(1);
      await writeFile(`${artifacts}/native-dpr-${dpr}.json`, JSON.stringify({ before, after }, null, 2));
    });
  });
}
