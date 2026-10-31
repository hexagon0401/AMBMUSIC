import { test, expect, type Page } from '@playwright/test';

// Exercise the actual connection module with deterministic Spotify responses;
// no personal tokens or Spotify account are used by these tests.
const clientId = 'a'.repeat(32);
const trackId = 'b'.repeat(22);
async function setup(page: Page, options: { refreshFails?: boolean; transferFails?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let tokenRequests = 0;
  const calls: { path: string; body: any; authorization: string }[] = [];
  await page.route('https://accounts.spotify.com/api/token', async route => {
    tokenRequests++;
    const body = new URLSearchParams(route.request().postData()!);
    expect(body.get('client_id')).toBe(clientId);
    if (body.get('grant_type') === 'refresh_token' && options.refreshFails) return route.fulfill({ status: 400, json: { error: 'invalid_grant' } });
    await route.fulfill({ json: { access_token: `test-access-${tokenRequests}`, expires_in: 3600, ...(tokenRequests === 1 ? { refresh_token: 'test-refresh' } : {}) } });
  });
  await page.route('https://api.spotify.com/v1/**', async route => {
    calls.push({ path: route.request().url(), body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    await route.fulfill({ status: options.transferFails ? 403 : 204, body: '' });
  });
  await page.goto('/');
  await page.evaluate(async ({ clientId, trackId }) => {
    const listeners: Record<string, (value: any) => void> = {};
    const w = window as any;
    w.events = []; w.operations = []; w.listeners = listeners;
    w.mockState = { paused: true, track_window: { current_track: { name: 'Test River', artists: [{ name: 'Test Artist' }], uri: `spotify:track:${trackId}` } } };
    w.Spotify = { Player: class {
      constructor(public options: any) { w.player = this; }
      addListener(name: string, cb: any) { listeners[name] = cb; return true; }
      async connect() { setTimeout(() => listeners.ready({ device_id: 'test-device' }), 0); return true; }
      disconnect() { w.operations.push('disconnect'); }
      async activateElement() { w.operations.push('activate'); }
      async getCurrentState() { return w.mockState; }
      async pause() { w.operations.push('pause'); }
      async nextTrack() { w.operations.push('next'); }
      async previousTrack() { w.operations.push('previous'); }
      async setVolume(v: number) { w.operations.push(['volume', v]); }
    } };
    const { SpotifyConnection } = await import('/src/spotify.ts' as string);
    const config = { clientId, redirectUri: `${location.origin}/` };
    sessionStorage.setItem('ambmusic.spotify.pkce', JSON.stringify({ ...config, state: 'test-state', verifier: 'c'.repeat(64), createdAt: Date.now() }));
    history.replaceState(null, '', '/?code=test-code&state=test-state');
    w.connection = new SpotifyConnection({ onState: (s: any) => w.events.push(['state', s]), onConnection: (s: any) => w.events.push(['connection', s]), onError: (s: any) => w.events.push(['error', s]) }, config);
    await w.connection.completeCallback();
  }, { clientId, trackId });
  return { calls, tokens: () => tokenRequests };
}

test('PKCE callback connects device, loads state, activates before link playback and clears credentials on disconnect', async ({ page }) => {
  const { calls, tokens } = await setup(page);
  await expect.poll(() => page.evaluate(() => (window as any).connection.connected)).toBe(true);
  expect(tokens()).toBe(1);
  expect(calls[0].body).toEqual({ device_ids: ['test-device'], play: false });
  expect(page.url()).not.toContain('code=');
  await page.evaluate(async id => {
    const w = window as any;
    await w.connection.playLink(`https://open.spotify.com/track/${id}?si=test`);
    await w.connection.playLink(`spotify:playlist:${id}`);
    await w.connection.next(); await w.connection.previous(); await w.connection.setVolume(.3);
    w.mockState.paused = false; await w.connection.toggle();
  }, trackId);
  expect(calls[1].body).toEqual({ uris: [`spotify:track:${trackId}`] });
  expect(calls[2].body).toEqual({ context_uri: `spotify:playlist:${trackId}` });
  expect(await page.evaluate(() => (window as any).operations)).toContain('activate');
  expect(await page.evaluate(() => (window as any).operations)).toContain('pause');
  await page.evaluate(() => (window as any).connection.disconnect());
  expect(await page.evaluate(() => (window as any).connection.connected)).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('ambmusic.spotify.pkce'))).toBeNull();
  expect(await page.evaluate(() => Object.values(sessionStorage).join('') + Object.values(localStorage).join(''))).not.toContain('test-access');
});

test('expiry refreshes once for concurrent playback and preserves refresh token when omitted', async ({ page }) => {
  const { tokens } = await setup(page);
  await expect.poll(() => page.evaluate(() => (window as any).connection.connected)).toBe(true);
  await page.clock.install();
  await page.clock.setSystemTime(Date.now() + 3600_000);
  await page.evaluate(async id => {
    const c = (window as any).connection;
    await Promise.all([c.playLink(`spotify:track:${id}`), c.playLink(`spotify:album:${id}`)]);
  }, trackId);
  expect(tokens()).toBe(2);
  await page.clock.setSystemTime(Date.now() + 7200_000);
  await page.evaluate(id => (window as any).connection.playLink(`spotify:track:${id}`), trackId);
  expect(tokens()).toBe(3);
});

test('expired refresh restores disconnected state and reports reconnect message', async ({ page }) => {
  await setup(page, { refreshFails: true });
  await expect.poll(() => page.evaluate(() => (window as any).connection.connected)).toBe(true);
  await page.clock.install(); await page.clock.setSystemTime(Date.now() + 3600_000);
  const message = await page.evaluate(async id => {
    try { await (window as any).connection.playLink(`spotify:track:${id}`); } catch (e) { return (e as Error).message; }
  }, trackId);
  expect(message).toContain('다시 연결');
  expect(await page.evaluate(() => (window as any).connection.connected)).toBe(false);
});

test('account restriction and stale SDK events cannot leave a false connected state', async ({ page }) => {
  await setup(page, { transferFails: true });
  await expect.poll(() => page.evaluate(() => (window as any).events.some((e: any) => e[0] === 'error' && e[1].includes('사용자 등록')))).toBe(true);
  await page.evaluate(() => (window as any).listeners.player_state_changed((window as any).mockState));
  expect(await page.evaluate(() => (window as any).connection.connected)).toBe(false);
  expect(await page.evaluate(() => (window as any).events.filter((e: any) => e[0] === 'state').length)).toBe(0);
});

test('only Spotify music URLs are accepted and malformed auth storage does not exchange a token', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const { parseSpotifyLink, SpotifyConnection } = await import('/src/spotify.ts' as string);
    const rejected = ['https://evil.com/track/' + 'a'.repeat(22), 'https://open.spotify.com.evil.com/track/' + 'a'.repeat(22), 'javascript:alert(1)', 'spotify:episode:' + 'a'.repeat(22)].every(value => { try { parseSpotifyLink(value); return false; } catch { return true; } });
    sessionStorage.setItem('ambmusic.spotify.pkce', '{broken');
    history.replaceState(null, '', '/?code=invalid&state=test');
    const c = new SpotifyConnection({ onState() {}, onConnection() {}, onError() {} });
    let error = ''; try { await c.completeCallback(); } catch (e) { error = (e as Error).message; }
    return { rejected, error };
  });
  expect(results.rejected).toBe(true);
  expect(results.error).toContain('다시 시작');
});
