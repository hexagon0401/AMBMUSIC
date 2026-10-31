export type Track = {
  name: string;
  artists: { name: string }[];
  uri: string;
  album?: { images: { url: string }[] };
};
export type PlaybackState = { paused: boolean; track_window: { current_track: Track } };
export type ConnectionStatus = 'idle' | 'connecting' | 'connected';
type Tokens = { access_token: string; refresh_token?: string; expiresAt: number };
type Config = { clientId: string; redirectUri: string };
type Callbacks = {
  onState(state: PlaybackState | null): void;
  onConnection(status: ConnectionStatus): void;
  onError(message: string): void;
};
type SDKPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (event: any) => void): boolean;
  activateElement(): Promise<void>;
  getCurrentState(): Promise<PlaybackState | null>;
  pause(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  setVolume(volume: number): Promise<void>;
};
declare global {
  interface Window {
    Spotify?: { Player: new (options: { name: string; getOAuthToken: (callback: (token: string) => void) => void; volume: number }) => SDKPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}
const defaultConfig: Config = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() || '',
  redirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim() || `${location.origin}/`,
};
const authKey = 'ambmusic.spotify.pkce';
const scopes = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
const reconnectMessage = 'Spotify 연결이 만료되었어요. 다시 연결해 주세요.';
let sdkLoading: Promise<void> | undefined;

function callbackUrl(value: string) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error('Spotify 콜백 주소 설정을 확인해 주세요.');
  }
  return url;
}

/** Only explicit Spotify music links are accepted; arbitrary URLs are never fetched. */
export function parseSpotifyLink(value: string): { type: 'track' | 'album' | 'playlist'; uri: string } {
  const input = value.trim();
  let match = /^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/.exec(input);
  if (!match) {
    try {
      const url = new URL(input);
      if (url.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.port && !url.username && !url.password) {
        match = /^\/(?:intl-[a-zA-Z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
      }
    } catch { /* Report a useful message below. */ }
  }
  if (!match) throw new Error('Spotify에서 곡·앨범·플레이리스트의 공유 링크를 복사해 넣어 주세요.');
  const type = match[1] as 'track' | 'album' | 'playlist';
  return { type, uri: `spotify:${type}:${match[2]}` };
}

function loadSDK() {
  if (window.Spotify) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      window.onSpotifyWebPlaybackSDKReady = undefined;
      script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Spotify 플레이어를 불러오지 못했어요. 다시 연결해 주세요.')), 15000);
    window.onSpotifyWebPlaybackSDKReady = () => finish();
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.onerror = () => finish(new Error('Spotify 플레이어에 연결할 수 없어요. 네트워크를 확인해 주세요.'));
    document.head.append(script);
  }).catch((error) => { sdkLoading = undefined; throw error; });
  return sdkLoading;
}

export class SpotifyConnection {
  private tokens?: Tokens;
  private player?: SDKPlayer;
  private refresh?: Promise<string>;
  private device?: string;
  private status: ConnectionStatus = 'idle';
  private generation = 0;
  private requests = new AbortController();
  private volume = 0.55;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private lastState: PlaybackState | null = null;
  private stateRevision = 0;

  constructor(private callbacks: Callbacks, private config: Config = defaultConfig) {}
  get configured() {
    // Cloud secret references are NOT raw Client IDs and must never reach the browser's OAuth request.
    if (!/^[a-fA-F0-9]{32}$/.test(this.config.clientId)) return false;
    try { callbackUrl(this.config.redirectUri); return true; } catch { return false; }
  }
  get connected() { return this.status === 'connected'; }
  get connecting() { return this.status === 'connecting'; }
  get loginUrl() { return this.configured ? callbackUrl(this.config.redirectUri).href : undefined; }
  get needsCanonicalSite() { return this.configured && new URL(this.config.redirectUri).origin !== location.origin; }
  private notify(status: ConnectionStatus) { this.status = status; this.callbacks.onConnection(status); }
  private current(generation: number) {
    if (generation !== this.generation) throw new DOMException('Connection cancelled', 'AbortError');
  }

  async authorize() {
    if (!this.configured) throw new Error('Spotify 연결 설정이 아직 준비되지 않았어요.');
    if (this.needsCanonicalSite) throw new Error('Spotify 연결은 공식 사이트에서 시작해 주세요.');
    const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map((n) => n.toString(16).padStart(2, '0')).join('');
    const verifier = random();
    const state = random();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try {
      sessionStorage.setItem(authKey, JSON.stringify({ verifier, state, createdAt: Date.now(), ...this.config }));
    } catch { throw new Error('로그인을 위해 이 사이트의 브라우저 저장소 사용을 허용해 주세요.'); }
    const params = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', redirect_uri: this.config.redirectUri, code_challenge_method: 'S256', code_challenge: challenge, state, scope: scopes });
    location.assign(`https://accounts.spotify.com/authorize?${params}`);
  }

  async completeCallback() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (!code && !error) return;
    const state = url.searchParams.get('state');
    for (const p of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(p);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    let auth;
    try {
      const saved = sessionStorage.getItem(authKey);
      sessionStorage.removeItem(authKey);
      auth = saved ? JSON.parse(saved) : null;
    } catch { /* Invalid or unavailable session storage is an expired request. */ }
    if (!auth || !state || auth.state !== state || !Number.isFinite(auth.createdAt) || Date.now() - auth.createdAt > 600000 || auth.createdAt > Date.now() + 60000 || !/^[a-f0-9]{64}$/.test(auth.verifier)) {
      throw new Error('연결 요청이 만료되었어요. Spotify 연결을 다시 시작해 주세요.');
    }
    if (error) throw new Error(error === 'access_denied' ? 'Spotify 연결을 취소했어요. 언제든 다시 연결할 수 있어요.' : 'Spotify 로그인을 완료하지 못했어요. 다시 연결해 주세요.');
    if (!this.configured || auth.clientId !== this.config.clientId || auth.redirectUri !== this.config.redirectUri || this.needsCanonicalSite) {
      throw new Error('Spotify 앱 설정이 변경되었어요. 연결을 다시 시작해 주세요.');
    }
    this.disconnect();
    const generation = this.generation;
    this.notify('connecting');
    this.connectionTimer = setTimeout(() => {
      if (generation !== this.generation || this.connected) return;
      this.disconnect();
      this.callbacks.onError('Spotify 기기 연결 시간이 초과되었어요. 다시 연결해 주세요.');
    }, 30000);
    try {
      await this.requestToken(new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: this.config.redirectUri, client_id: this.config.clientId, code_verifier: auth.verifier }), generation);
      await this.connectPlayer(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.disconnect();
      throw error;
    }
  }

  private async request(url: string, init: RequestInit, generation: number) {
    this.current(generation);
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([this.requests.signal, AbortSignal.timeout(15000)]) });
      this.current(generation);
      return response;
    } catch (error) {
      this.current(generation);
      throw new Error('Spotify에 연결할 수 없어요. 네트워크를 확인하고 다시 시도해 주세요.', { cause: error });
    }
  }
  private async requestToken(body: URLSearchParams, generation: number) {
    const response = await this.request('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, generation);
    if (!response.ok) throw new Error(reconnectMessage);
    const tokens = await response.json();
    this.current(generation);
    if (typeof tokens.access_token !== 'string' || !tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error(reconnectMessage);
    this.tokens = {
      access_token: tokens.access_token,
      refresh_token: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : this.tokens?.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    return tokens.access_token as string;
  }
  private async token(force = false): Promise<string> {
    if (!this.tokens) throw new Error(reconnectMessage);
    if (!force && Date.now() < this.tokens.expiresAt - 60000) return this.tokens.access_token;
    if (!this.tokens.refresh_token) { this.disconnect(); throw new Error(reconnectMessage); }
    const generation = this.generation;
    if (!this.refresh) {
      this.refresh = this.requestToken(new URLSearchParams({ grant_type: 'refresh_token', client_id: this.config.clientId, refresh_token: this.tokens.refresh_token }), generation)
        .catch((error) => { if (generation === this.generation) this.disconnect(); throw error; })
        .finally(() => { if (generation === this.generation) this.refresh = undefined; });
    }
    return this.refresh;
  }
  private async api(path: string, body?: object) {
    const generation = this.generation;
    let token = await this.token();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.request(`https://api.spotify.com/v1/${path}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }, generation);
      if (response.ok) return;
      if (response.status === 401 && attempt === 0) { token = await this.token(true); continue; }
      if (response.status === 401) { this.disconnect(); throw new Error(reconnectMessage); }
      if (response.status === 403) throw new Error('Spotify Premium과 개발 앱의 사용자 등록을 확인해 주세요. 이 음악의 재생이 제한될 수도 있어요.');
      if (response.status === 404) throw new Error('재생할 음악이나 기기를 찾지 못했어요. Spotify 링크로 곡을 선택하거나 다시 연결해 주세요.');
      if (response.status === 429) throw new Error('Spotify 요청이 잠시 많아졌어요. 잠시 후 다시 시도해 주세요.');
      throw new Error('Spotify가 음악을 재생하지 못했어요. 다른 곡을 선택하거나 다시 시도해 주세요.');
    }
  }

  private async connectPlayer(generation: number) {
    await loadSDK();
    this.current(generation);
    if (!window.Spotify) throw new Error('Spotify 플레이어가 지원되지 않는 브라우저예요.');
    const report = (message: string, fatal = false) => {
      if (generation !== this.generation) return;
      if (fatal) this.disconnect();
      this.callbacks.onError(message);
    };
    const player = new window.Spotify.Player({ name: 'AMBMUSIC', volume: this.volume, getOAuthToken: (callback) => {
      if (generation === this.generation) void this.token().then((token) => { if (generation === this.generation) callback(token); }).catch((e: Error) => this.callbacks.onError(e.message));
    } });
    this.player = player;
    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      if (generation !== this.generation) return;
      this.device = device_id;
      void this.api('me/player', { device_ids: [device_id], play: false }).then(async () => {
        this.current(generation);
        clearTimeout(this.connectionTimer);
        this.notify('connected');
        this.callbacks.onState(this.lastState);
        const revision = this.stateRevision;
        const state = await player.getCurrentState();
        this.current(generation);
        if (revision === this.stateRevision) { this.lastState = state; this.callbacks.onState(state); }
      }).catch((e: Error) => report(e.message, true));
    });
    player.addListener('not_ready', () => report('Spotify 기기 연결이 끊어졌어요. 다시 연결해 주세요.', true));
    player.addListener('player_state_changed', (state: PlaybackState | null) => {
      if (generation !== this.generation) return;
      this.lastState = state;
      this.stateRevision++;
      if (this.connected) this.callbacks.onState(state);
    });
    player.addListener('autoplay_failed', () => report('음악을 시작하려면 이 화면의 재생 버튼을 한 번 눌러 주세요.'));
    player.addListener('account_error', () => report('Spotify 브라우저 재생에는 Premium 계정이 필요해요.', true));
    player.addListener('initialization_error', () => report('이 브라우저에서 보호된 음악을 재생할 수 없어요. 지원되는 브라우저와 DRM 설정을 확인해 주세요.', true));
    player.addListener('authentication_error', () => report(reconnectMessage, true));
    player.addListener('playback_error', () => report('Spotify가 이 곡을 재생하지 못했어요. 다른 곡을 선택해 주세요.'));
    if (!await player.connect()) throw new Error('Spotify 기기를 연결하지 못했어요. 다시 연결해 주세요.');
    this.current(generation);
  }
  private activePlayer() {
    if (!this.connected || !this.player || !this.device) throw new Error('Spotify 기기가 아직 준비되지 않았어요.');
    return this.player;
  }
  async toggle() {
    const player = this.activePlayer();
    const generation = this.generation;
    // Called immediately in the button's gesture, before any token or state fetch (iOS autoplay).
    await player.activateElement();
    const state = await player.getCurrentState();
    this.current(generation);
    if (state && !state.paused) await player.pause();
    else await this.api(`me/player/play?device_id=${encodeURIComponent(this.device!)}`);
  }
  async playLink(link: string) {
    const selection = parseSpotifyLink(link);
    const generation = this.generation;
    await this.activePlayer().activateElement();
    this.current(generation);
    await this.api(`me/player/play?device_id=${encodeURIComponent(this.device!)}`, selection.type === 'track' ? { uris: [selection.uri] } : { context_uri: selection.uri });
  }
  async next() { await this.activePlayer().nextTrack(); }
  async previous() { await this.activePlayer().previousTrack(); }
  async setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.player) await this.player.setVolume(this.volume);
  }
  disconnect() {
    clearTimeout(this.connectionTimer);
    this.generation++;
    this.requests.abort();
    this.requests = new AbortController();
    this.player?.disconnect();
    this.player = undefined;
    this.tokens = undefined;
    this.refresh = undefined;
    this.device = undefined;
    this.lastState = null;
    try { sessionStorage.removeItem(authKey); } catch { /* Private browsing may disable storage. */ }
    this.notify('idle');
  }
}
