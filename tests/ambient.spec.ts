import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const artifacts = '/tmp/ambmusic-artifacts';

test('desktop scene, audio, activities, mixer, timer and immersion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args: ConstructorParameters<typeof AudioContext>) { super(...args); (window as any).__testAudio = this; }
    };
  });
  await page.goto('/');
  await expect(page.locator('#scene .landscape-canvas')).toBeVisible();
  await page.waitForTimeout(1100);
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/desktop.png`, fullPage: true });
  expect(await page.evaluate(() => (window as any).__testAudio)).toBeUndefined();
  await page.locator('.main-play').click();
  await expect(page.locator('.main-play')).toHaveAttribute('aria-label', '자연 소리 일시정지');
  expect(await page.evaluate(() => (window as any).__testAudio.state)).toBe('running');
  await page.locator('[data-activity="fish"]').click();
  await expect(page.locator('#activity-caption')).toHaveText('기다림도 좋은 시간이야.');
  await expect(page.locator('[data-activity="fish"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '자연 소리 믹서' }).click();
  await page.locator('[data-sound="water"]').fill('12');
  await expect(page.locator('[data-sound="water"]').locator('..').locator('output')).toHaveText('12%');
  await page.keyboard.press('Escape');
  await page.locator('.main-play').click();
  expect(await page.evaluate(() => (window as any).__testAudio.state)).toBe('suspended');
  await page.getByRole('button', { name: '집중 타이머' }).click();
  await page.locator('[data-minutes="25"]').click();
  await expect(page.locator('#timer-label')).toHaveText(/24:|25:/);
  await page.getByRole('button', { name: '몰입 모드', exact: true }).click();
  await expect(page.locator('body')).toHaveClass('immersive');
  await expect(page.locator('.site-header')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.site-header')).toBeVisible();
  await page.getByRole('button', { name: '장면 설정' }).click();
  await page.locator('#motion').uncheck();
  await page.locator('#quality').selectOption('low');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scene-status')).toHaveText('고요한 정지 화면');
  await page.waitForTimeout(100);
  const still = await page.locator('#scene').screenshot();
  await page.waitForTimeout(250);
  expect((await page.locator('#scene').screenshot()).equals(still)).toBe(true);
  await page.locator('[data-activity="sleep"]').click();
  await page.waitForTimeout(150);
  expect((await page.locator('#scene').screenshot()).equals(still)).toBe(false);
  await page.locator('#spotify-open').click();
  await expect(page.locator('#spotify-connect')).toBeDisabled();
  await expect(page.locator('#spotify-setup-note')).toContainText('연결을 준비 중');
  expect(errors).toEqual([]);
});

test('mobile has no horizontal overflow and dialogs remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#scene .landscape-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${artifacts}/mobile.png`, fullPage: true });
  await page.getByRole('button', { name: '자연 소리 믹서' }).click();
  await expect(page.locator('#mixer-dialog')).toBeVisible();
  expect(await page.locator('#mixer-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '망원경', exact: true }).click();
  await expect(page.locator('#activity-caption')).toHaveText('저 멀리엔 무엇이 있을까.');
});

test('Canvas fallback retains useful audio and focus workflow', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name: string, ...args: any[]) {
      if (name === '2d') return null;
      return get.apply(this, [name, ...args] as any);
    } as any;
  });
  await page.goto('/');
  await expect(page.locator('#scene')).toHaveClass('unavailable');
  await expect(page.locator('#scene-status')).toHaveText('고요한 정지 화면');
  await page.locator('.main-play').click();
  await expect(page.locator('.main-play')).toHaveAttribute('aria-label', '자연 소리 일시정지');
  await page.getByRole('button', { name: '집중 타이머' }).click();
  await expect(page.locator('#timer-dialog')).toBeVisible();
});

test('reduced motion renders a stable scene and supports activity changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(400);
  const still = await page.locator('#scene').screenshot();
  await page.waitForTimeout(200);
  expect((await page.locator('#scene').screenshot()).equals(still)).toBe(true);
  await page.locator('[data-activity="look"]').click();
  await page.waitForTimeout(100);
  expect((await page.locator('#scene').screenshot()).equals(still)).toBe(false);
});

test('untrusted OAuth callback is rejected without exchanging a token', async ({ page }) => {
  let requested = false;
  await page.route('https://accounts.spotify.com/api/token', (route) => { requested = true; return route.abort(); });
  await page.goto('/?code=untrusted&state=forged');
  await expect(page.locator('#toast')).toContainText('다시 시작');
  expect(page.url()).not.toContain('code=');
  expect(requested).toBe(false);
});

test('timer uses elapsed wall time and can stop without stopping the room', async ({ page }) => {
  // Fake-clock timer assertions do not need to render every simulated wave frame.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-31T10:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: '집중 타이머' }).click();
  await page.locator('[data-minutes="15"]').click();
  await expect(page.locator('#timer-label')).toHaveText(/14:|15:/);
  await page.clock.setSystemTime(new Date('2026-10-31T10:16:00Z'));
  await page.clock.runFor(1100);
  await expect(page.locator('#timer-label')).toHaveText('타이머');
  await expect(page.locator('#toast')).toContainText('잠깐의 쉼은');
});


test('theme switch recolors the landscape and persists without resetting controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '화이트 모드로 전환' }).click();
  await expect(page.locator('.companion-canvas')).toBeVisible();
  await page.locator('[data-activity="fish"]').click();
  const light = await page.locator('#scene').screenshot();
  await page.getByRole('button', { name: '다크 모드로 전환' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-activity="fish"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(100);
  expect((await page.locator('#scene').screenshot()).equals(light)).toBe(false);
  await page.screenshot({ path: `${artifacts}/desktop-dark.png`, fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '화이트 모드로 전환' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('panorama flows sideways while the 2D companion stays anchored', async ({ page }) => {
  await page.goto('/');
  const bounds = await page.locator('#scene').boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 1);
  await page.waitForTimeout(150);
  const landscape = await page.locator('.landscape-canvas').screenshot();
  await page.waitForTimeout(350);
  expect((await page.locator('.landscape-canvas').screenshot()).equals(landscape)).toBe(false);
  const companion = await page.locator('.companion-canvas').boundingBox();
  expect(companion).toEqual(bounds);
  await page.getByRole('button', { name: '장면 설정' }).click();
  await page.locator('#motion').uncheck();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const frozen = await page.locator('#scene').screenshot();
  await page.waitForTimeout(350);
  expect((await page.locator('#scene').screenshot()).equals(frozen)).toBe(true);
});
