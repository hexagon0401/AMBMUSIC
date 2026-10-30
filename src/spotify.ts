type Tokens = { access_token: string; refresh_token?: string; expires_in: number; expiresAt: number };
export type Track = { name: string; artists: { name: string }[]; uri: string };
type PlaybackState = { paused: boolean; track_window: { current_track: Track } };
type SDKPlayer = {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (event: any) => void): boolean;
  togglePlay(): Promise<void>;
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
const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim() || `${location.origin}${location.pathname}`;
const key = 'ambmusic.spotify.pkce';

export class SpotifyConnection {
  private tokens?: Tokens;
  private player?: SDKPlayer;
  private refresh?: Promise<string>;
  private ready = false;
  constructor(private onState: (state: PlaybackState) => void, private onReady: () => void, private onError: (message: string) => void) {}
  get configured() { return Boolean(clientId); }
  get connected() { return this.ready; }

  async authorize() {
    if (!clientId) throw new Error('Spotify 연결을 준비 중이에요. 지금은 자연의 소리와 함께 쉬어가세요.');
    const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map((n) => n.toString(16).padStart(2, '0')).join('');
    const verifier = random();
    const state = random();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    sessionStorage.setItem(key, JSON.stringify({ verifier, state, createdAt: Date.now() }));
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, code_challenge_method: 'S256', code_challenge: challenge, state, scope: 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state' });
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
    const saved = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (error) throw new Error('Spotify 연결을 취소했어요. 언제든 다시 연결할 수 있어요.');
    const auth = saved ? JSON.parse(saved) : null;
    if (!auth || !state || auth.state !== state || Date.now() - auth.createdAt > 10 * 60 * 1000) throw new Error('연결 요청이 만료되었어요. Spotify 연결을 다시 시작해 주세요.');
    if (!clientId) throw new Error('이 환경의 Spotify 연결 설정이 아직 준비되지 않았어요.');
    await this.requestToken(new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri, client_id: clientId, code_verifier: auth.verifier }));
    await this.connectPlayer();
  }

  private async requestToken(body: URLSearchParams) {
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) throw new Error('Spotify 인증에 실패했어요. 다시 연결해 주세요.');
    const tokens = await response.json() as Tokens;
    this.tokens = { ...tokens, refresh_token: tokens.refresh_token || this.tokens?.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
    return tokens.access_token;
  }
  private async token(): Promise<string> {
    if (!this.tokens) throw new Error('Spotify에 먼저 연결해 주세요.');
    if (Date.now() < this.tokens.expiresAt - 60000) return this.tokens.access_token;
    if (!this.tokens.refresh_token || !clientId) throw new Error('Spotify 연결이 만료되었어요. 다시 연결해 주세요.');
    if (!this.refresh) this.refresh = this.requestToken(new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: this.tokens.refresh_token })).finally(() => { this.refresh = undefined; });
    return this.refresh;
  }

  private async connectPlayer() {
    if (!window.Spotify) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error('Spotify 플레이어를 불러오지 못했어요. 연결을 다시 시도해 주세요.')); }, 15000);
        window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timeout); resolve(); };
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Spotify 플레이어에 연결할 수 없어요.')); };
        document.head.append(script);
      });
    }
    if (!window.Spotify) throw new Error('Spotify 플레이어가 지원되지 않는 브라우저예요.');
    this.player = new window.Spotify.Player({ name: 'AMBMUSIC · River room', volume: 0.55, getOAuthToken: (callback) => { void this.token().then(callback).catch((e: Error) => this.onError(e.message)); } });
    this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
      void this.transfer(device_id).then(() => { this.ready = true; this.onReady(); }).catch((e: Error) => this.onError(e.message));
    });
    this.player.addListener('not_ready', () => { this.ready = false; this.onError('Spotify 기기 연결이 끊어졌어요.'); });
    this.player.addListener('player_state_changed', (state: PlaybackState | null) => { if (state) this.onState(state); });
    this.player.addListener('account_error', () => this.onError('Spotify 브라우저 재생에는 Premium 계정이 필요해요.'));
    for (const event of ['initialization_error', 'authentication_error', 'playback_error']) this.player.addListener(event, () => this.onError('Spotify 재생에 문제가 생겼어요. Spotify 앱에서 음악을 선택하거나 다시 연결해 주세요.'));
    if (!await this.player.connect()) throw new Error('Spotify 기기를 연결하지 못했어요.');
  }
  private async transfer(device: string) {
    const response = await fetch('https://api.spotify.com/v1/me/player', { method: 'PUT', headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ device_ids: [device], play: false }) });
    if (!response.ok) throw new Error('Spotify 기기를 활성화하지 못했어요. Premium 계정과 앱 접근 권한을 확인해 주세요.');
  }
  async toggle() { if (!this.ready || !this.player) throw new Error('Spotify 기기가 아직 준비되지 않았어요.'); await this.player.togglePlay(); }
  async next() { if (this.ready) await this.player?.nextTrack(); }
  async previous() { if (this.ready) await this.player?.previousTrack(); }
  async setVolume(volume: number) { if (this.ready) await this.player?.setVolume(volume); }
  disconnect() { this.player?.disconnect(); this.player = undefined; this.tokens = undefined; this.ready = false; sessionStorage.removeItem(key); }
}
