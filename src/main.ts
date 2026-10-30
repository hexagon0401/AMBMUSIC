import './style.css';
import { RiverScene, type Activity, type Quality, type Theme } from './scene';
import { BIOMES, type BiomeId, type SceneConfig } from './terrain';
import { NatureAudio, type Sound } from './audio';
import { SpotifyConnection } from './spotify';

const paths: Record<string, string> = {
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  sound: '<path d="m11 5-6 5H2v4h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  rest: '<path d="M4 14c3-3 5 3 8 0s5 3 8 0M4 19c3-3 5 3 8 0s5 3 8 0"/><circle cx="12" cy="6" r="3"/>',
  fish: '<path d="M4 21 14 3l5 4v10a3 3 0 0 1-6 0v-2m6-8-5-4"/>',
  row: '<path d="m5 19 12-12M3 21l4-1 3-4-2-2-4 3ZM15 5l3-3 4 4-3 3Z"/>',
  sleep: '<path d="M18 14A8 8 0 0 1 10 3a9 9 0 1 0 11 11ZM16 3h5l-5 5h5"/>',
  look: '<path d="m3 11 14-7 4 8-15 5ZM6 17l-1 3m9-5 4 6m-7-5-2 5M13 6l4 8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  next: '<path d="m5 5 10 7-10 7Z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  prev: '<path d="m19 5-10 7 10 7Z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  spotify: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M5.8 9c4-1.3 8.1-1 12 .9M7 12c3.3-1 6.7-.7 9.5.8M8 15c2.5-.6 4.9-.4 7.2.6" stroke="var(--spotify-lines, #1c251e)" stroke-width="1.4"/>',
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
  water: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5a3 3 0 1 1-3 3"/>',
  birds: '<path d="M3 8c4 0 7 2 9 6 2-4 5-6 9-6M12 14v3"/>',
};
function icon(name: string, size = 20) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`; }
const activities: [Activity, string, string][] = [['rest', '쉬기', '그저, 둥둥.'], ['fish', '낚시', '기다림도 좋은 시간이야.'], ['row', '노 젓기', '조금 더 멀리 가볼까.'], ['sleep', '낮잠', '잠깐 눈을 감아도 괜찮아.'], ['look', '망원경', '저 멀리엔 무엇이 있을까.']];

let theme: Theme = 'dark';
try { if (localStorage.getItem('ambmusic.theme.v2') === 'light') theme = 'light'; } catch { /* Storage can be unavailable in private contexts. */ }
document.documentElement.dataset.theme = theme;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="/" aria-label="AMBMUSIC 홈"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>AMB<span class="brand-light">MUSIC</span><small>A LITTLE ROOM TO DRIFT</small></span></a>
    <div class="header-note"><span class="status-dot"></span> LESS NOISE. MORE NOTHING.</div>
    <div class="header-actions"><button id="theme-toggle" class="theme-toggle" aria-label="다크 모드로 전환" aria-pressed="false"></button><button class="text-button about-button" data-dialog="about">이 공간에 대하여 ${icon('arrow', 15)}</button></div>
  </header>
  <main>
    <section class="scene-shell" aria-label="강 위의 앰비언트 공간">
      <div id="scene"><div class="scene-fallback" aria-hidden="true"><span>~ . , : ; ~ . , : ; ~</span><span class="fallback-friend">● ●</span><p>잠시, 강 위에서.</p></div></div>
      <div class="scene-grain" aria-hidden="true"></div>
      <div class="scene-heading"><span class="eyebrow"><span id="landscape-room">THE RIVER ROOM</span> <span class="slash">/</span> <span id="landscape-number">001</span></span><h1>어디에도 서두르지 않는 곳.</h1><p>Somewhere between doing and dreaming.</p></div>
      <article class="now-playing" aria-label="현재 재생 정보">
        <div class="player-top"><span class="tiny-label" id="source-label">NATURE RADIO</span><span id="audio-indicator" class="equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
        <div class="track-title" id="track-name">River, slowly</div><div class="track-artist" id="track-artist">AMBMUSIC · 물과 바람의 소리</div>
        <div class="player-bottom"><span class="track-tag" id="track-tag">GENERATIVE AMBIENCE</span><div class="track-controls"><button id="previous" class="icon-button" aria-label="이전 Spotify 곡" hidden>${icon('prev', 16)}</button><button class="icon-button play-toggle" aria-label="자연 소리 재생">${icon('play', 18)}</button><button id="next" class="icon-button" aria-label="다음 Spotify 곡" hidden>${icon('next', 16)}</button></div></div>

      </article>
      <div class="scene-coordinates" aria-hidden="true">ASCII LANDSCAPE<br>35° 12′ N &nbsp; 128° 58′ E <span>IMAGINARY COORDINATES</span></div>
      <div class="friend-caption"><span class="friend-icon" aria-hidden="true">▟▙</span><span id="activity-caption">기다림도 좋은 시간이야.</span><span class="caption-line"></span><span class="tiny-label">YOUR LITTLE COMPANION</span></div>
      <button id="exit-immersion" class="exit-immersion" hidden>${icon('expand', 16)} 몰입 모드 나가기 <kbd>ESC</kbd></button>
      <div class="scene-bottom"><span><span class="status-dot"></span> <span id="scene-status">천천히 흘러가는 중</span></span><span class="render-label">LAYERED ASCII · 2D COMPANION</span></div>
    </section>
    <section class="landscape-toolbar" aria-label="풍경과 여행 선택">
      <div class="landscape-description"><span class="landscape-dot" aria-hidden="true"></span><strong id="landscape-name">침엽수 강</strong><span id="landscape-description">나무 사이로 흐르는 조용한 강</span></div>
      <div class="landscape-actions"><label class="sr-only" for="landscape-select">풍경 고르기</label><select id="landscape-select">${BIOMES.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select><button id="regenerate" class="new-landscape">${icon('refresh', 15)} 새 풍경</button><label class="journey-switch"><input id="auto-journey" type="checkbox" role="switch" checked/><span>자동 여행</span></label></div>
    </section>
    <section class="control-deck" aria-label="공간 조절">
      <div class="activity-area"><span class="section-label">친구의 시간</span><div class="activities" role="group" aria-label="캐릭터 동작">${activities.map(([id, label]) => `<button class="activity ${id === 'fish' ? 'active' : ''}" data-activity="${id}" aria-pressed="${id === 'fish'}">${icon(id, 19)}<span>${label}</span></button>`).join('')}</div></div>
      <div class="deck-divider"></div>
      <div class="sound-area"><span class="section-label">오늘의 배경음</span><div class="sound-controls"><button class="main-play play-toggle" aria-label="자연 소리 재생">${icon('play', 21)}</button><div class="volume-control">${icon('sound', 18)}<label class="sr-only" for="volume">전체 음량</label><input id="volume" type="range" min="0" max="100" value="55" /></div><button class="icon-button labeled-button" data-dialog="mixer" aria-label="자연 소리 믹서">${icon('settings', 19)}<span>믹서</span></button><button id="spotify-open" class="spotify-connect-control">${icon('spotify', 16)}<span>Spotify 연결</span></button></div></div>
      <div class="deck-divider second-divider"></div>
      <div class="utility-area"><button class="utility-button" data-dialog="timer" aria-label="집중 타이머">${icon('clock', 20)}<span id="timer-label">타이머</span></button><button class="utility-button" id="immersion" aria-label="몰입 모드">${icon('expand', 20)}<span>몰입하기</span></button><button class="icon-button settings-button" data-dialog="settings" aria-label="장면 설정">${icon('settings', 20)}</button></div>
    </section>
    <footer><p>아무것도 하지 않아도, 괜찮은 시간.</p><span>MADE FOR SLOW MOMENTS <span class="footer-star">✳</span> AMBMUSIC © ${new Date().getFullYear()}</span></footer>
  </main>
  <dialog id="mixer-dialog"><div class="dialog-heading"><div><span class="eyebrow">MAKE YOUR OWN QUIET</span><h2>나만의 고요</h2></div><button class="icon-button close-dialog" aria-label="닫기">${icon('close')}</button></div><p>오늘은 어떤 소리가 필요한가요?</p><div class="mixer-sliders">${([['water', '흐르는 물', 55], ['wind', '숲의 바람', 25], ['birds', '멀리서 들리는 새', 30]] as const).map(([id, label, value]) => `<label>${icon(id)}<span>${label}</span><input type="range" data-sound="${id}" min="0" max="100" value="${value}" aria-label="${label} 음량"/><output>${value}%</output></label>`).join('')}</div><p class="dialog-footnote">브라우저에서 만들어지는 자연의 소리예요.<br>재생 버튼을 누르면 소리가 시작됩니다.</p></dialog>
  <dialog id="timer-dialog"><div class="dialog-heading"><div><span class="eyebrow">A MOMENT, JUST FOR YOU</span><h2>잠깐 머무르기</h2></div><button class="icon-button close-dialog" aria-label="닫기">${icon('close')}</button></div><p>시간이 다 되면 조용히 알려드릴게요.</p><div class="timer-presets">${[15, 25, 45].map((m) => `<button data-minutes="${m}">${m}<small>분</small></button>`).join('')}</div><p id="timer-detail" class="dialog-footnote">타이머 없이 오래 머물러도 괜찮아요.</p><button id="timer-stop" class="secondary-button" hidden>타이머 끝내기</button></dialog>
  <dialog id="settings-dialog"><div class="dialog-heading"><div><span class="eyebrow">SETTLE IN</span><h2>편안한 쪽으로</h2></div><button class="icon-button close-dialog" aria-label="닫기">${icon('close')}</button></div><label class="setting-row"><span>배경 움직임<small>레이어의 좌우 흐름과 친구의 움직임</small></span><input id="motion" type="checkbox" role="switch" ${matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : 'checked'} /></label><label class="setting-row"><span>친구의 자유 시간<small>약 45초마다 동작을 바꿔요</small></span><input id="auto-activity" type="checkbox" role="switch" checked /></label><label class="setting-row"><span>배경 디테일<small>글자는 선명하게, 풍경의 복잡도를 조절해요</small></span><select id="quality"><option value="auto">자동</option><option value="low">가볍게</option><option value="high">풍부하게</option></select></label></dialog>
  <dialog id="spotify-dialog"><div class="dialog-heading"><div><span class="eyebrow">YOUR MUSIC, YOUR LITTLE WORLD</span><h2>좋아하는 음악과 함께</h2></div><button class="icon-button close-dialog" aria-label="닫기">${icon('close')}</button></div><p>Spotify를 연결하고 나만의 음악을 이 작은 강으로 가져오세요.</p><div class="spotify-note">${icon('spotify', 28)}<span>브라우저에서 음악을 재생하려면<br><strong>Spotify Premium</strong>이 필요해요.</span></div><p id="spotify-setup-note" class="dialog-footnote"></p><button id="spotify-connect" class="primary-button">${icon('spotify', 19)} Spotify로 연결</button><a class="external-link" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Spotify에서 음악 선택하기 ${icon('arrow', 14)}</a><button id="spotify-disconnect" class="secondary-button" hidden>Spotify 연결 해제</button></dialog>
  <dialog id="about-dialog"><div class="dialog-heading"><div><span class="eyebrow">HELLO, DRIFTER.</span><h2>잘 쉬는 것도, 좋은 하루.</h2></div><button class="icon-button close-dialog" aria-label="닫기">${icon('close')}</button></div><p>끝없이 흘러가는 강과 작은 노란 친구.<br>할 일도, 도착해야 할 곳도 없는 공간이에요.</p><p>물소리를 켜거나 좋아하는 음악을 가져오세요.<br>친구는 자기만의 속도로 하루를 보낼 거예요.</p><div class="about-keys"><span><kbd>SPACE</kbd> 소리 재생 / 정지</span><span><kbd>F</kbd> 몰입하기</span><span><kbd>ESC</kbd> 돌아오기</span></div><p class="dialog-footnote">겹겹의 ASCII 풍경과 2D 픽셀 친구의 작은 세상.<br>장면은 음악의 박자나 음량과 독립적으로 흘러갑니다.<br><a class="credits-link" href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">오픈소스 고지 ↗</a></p></dialog>
  <div id="toast" role="status" aria-live="polite"></div>
`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let toastTimeout: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 6500);
}
let scene: RiverScene | undefined;
function sceneUnavailable() {
  $('#scene').classList.add('unavailable');
  $('.scene-fallback').setAttribute('aria-hidden', 'false');
  $('#scene-status').textContent = '고요한 정지 화면';
  $<HTMLInputElement>('#motion').checked = false;
  $<HTMLInputElement>('#motion').disabled = true;
  $<HTMLSelectElement>('#quality').disabled = true;
  $('.render-label').textContent = 'STILL LANDSCAPE';
  $<HTMLSelectElement>('#landscape-select').disabled = true;
  $<HTMLButtonElement>('#regenerate').disabled = true;
  $<HTMLInputElement>('#auto-journey').disabled = true;
  toast('이 브라우저에서는 고요한 정지 배경으로 함께할게요. 소리와 타이머는 사용할 수 있어요.');
}
function updateLandscape(state: SceneConfig, transitioning: boolean) {
  const index = BIOMES.findIndex((b) => b.id === state.biome);
  const current = BIOMES[index];
  $('#landscape-name').textContent = current.name;
  $('#landscape-description').textContent = transitioning ? `${current.name}(으)로 천천히 흘러가는 중` : current.subtitle;
  $('#landscape-room').textContent = current.id.toUpperCase().replaceAll('-', ' ');
  $('#landscape-number').textContent = String(index + 1).padStart(3, '0');
  $<HTMLSelectElement>('#landscape-select').value = current.id;
  $<HTMLInputElement>('#auto-journey').checked = state.autoJourney;
}
try { scene = new RiverScene($('#scene'), sceneUnavailable, theme, { onChange: updateLandscape }); } catch { sceneUnavailable(); }
$('#landscape-select').onchange = () => scene?.setLandscape($<HTMLSelectElement>('#landscape-select').value as BiomeId);
$('#auto-journey').onchange = () => scene?.setAutoJourney($<HTMLInputElement>('#auto-journey').checked);
$('#regenerate').onclick = () => { scene?.regenerate(); };
if (!$<HTMLInputElement>('#motion').checked) $('#scene-status').textContent = '고요한 정지 화면';

function updateThemeToggle() {
  const dark = theme === 'dark';
  $('#theme-toggle').innerHTML = `${icon(dark ? 'sun' : 'moon', 17)}<span>${dark ? '화이트 모드' : '다크 모드'}</span>`;
  $('#theme-toggle').setAttribute('aria-label', `${dark ? '화이트' : '다크'} 모드로 전환`);
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
}
updateThemeToggle();
$('#theme-toggle').onclick = () => {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  scene?.setTheme(theme);
  try { localStorage.setItem('ambmusic.theme.v2', theme); } catch { /* The current session still works. */ }
  updateThemeToggle();
};

const audio = new NatureAudio();
let playing = false;
let toggling = false;
const spotify = new SpotifyConnection((state) => {
  $('#track-name').textContent = state.track_window.current_track.name;
  $('#track-artist').textContent = state.track_window.current_track.artists.map((a) => a.name).join(', ');
  $('#source-label').textContent = 'SPOTIFY';
  $('#track-tag').textContent = state.paused ? 'PAUSED' : 'NOW PLAYING';
  playing = !state.paused;
  void audio.setPlaying(playing).catch(() => toast('자연 소리를 시작하려면 재생 버튼을 눌러 주세요.'));
  updatePlay();
}, () => {
  $('#spotify-open').innerHTML = `${icon('spotify', 16)} Spotify 연결됨 ${icon('arrow', 13)}`;
  $('#source-label').textContent = 'SPOTIFY';
  $('#track-name').textContent = '당신의 음악을 기다려요';
  $('#track-artist').textContent = 'Spotify 앱에서 음악을 골라 주세요';
  $('#track-tag').textContent = 'CONNECTED';
  $('#previous').hidden = false;
  $('#next').hidden = false;
  $('#spotify-disconnect').hidden = false;
  $('#spotify-connect').hidden = true;
  toast('Spotify가 연결되었어요. Spotify에서 음악을 선택하고 AMBMUSIC 기기로 재생해 주세요.');
}, toast);
$('#spotify-setup-note').textContent = spotify.configured ? '안전한 Spotify 로그인 화면에서 연결해요. 비밀번호는 이 사이트에 저장하지 않아요.' : 'Spotify 연결을 준비 중이에요. 지금은 물소리와 바람 소리로 쉬어갈 수 있어요.';
$('#spotify-connect').toggleAttribute('disabled', !spotify.configured);
if (!spotify.configured) $('#spotify-connect').textContent = 'Spotify 연결 준비 중';
void spotify.completeCallback().catch((e: Error) => toast(e.message));

function updatePlay() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.play-toggle')) {
    button.innerHTML = icon(playing ? 'pause' : 'play', button.classList.contains('main-play') ? 21 : 18);
    button.setAttribute('aria-label', `${spotify.connected ? 'Spotify와 자연 소리' : '자연 소리'} ${playing ? '일시정지' : '재생'}`);
    button.setAttribute('aria-pressed', String(playing));
  }
  $('#audio-indicator').classList.toggle('playing', playing);
}
async function togglePlay() {
  if (toggling) return;
  toggling = true;
  try {
    if (spotify.connected) await spotify.toggle();
    else { await audio.setPlaying(!playing); playing = !playing; updatePlay(); }
  } catch { toast('재생을 시작하지 못했어요. 브라우저의 오디오 권한과 Spotify의 선택한 음악을 확인해 주세요.'); }
  finally { toggling = false; }
}
document.querySelectorAll('.play-toggle').forEach((b) => b.addEventListener('click', () => void togglePlay()));
$('#volume').addEventListener('input', (event) => {
  const volume = Number((event.target as HTMLInputElement).value) / 100;
  audio.setVolume(volume);
  void spotify.setVolume(volume).catch(() => toast('Spotify 음량을 바꾸지 못했어요.'));
});
for (const range of document.querySelectorAll<HTMLInputElement>('[data-sound]')) range.addEventListener('input', () => {
  audio.setLevel(range.dataset.sound as Sound, Number(range.value) / 100);
  range.parentElement!.querySelector('output')!.textContent = `${range.value}%`;
});
$('#previous').onclick = () => { void spotify.previous().catch(() => toast('이전 곡을 재생하지 못했어요.')); };
$('#next').onclick = () => { void spotify.next().catch(() => toast('다음 곡을 재생하지 못했어요.')); };
$('#spotify-connect').onclick = () => { void spotify.authorize().catch((e: Error) => toast(e.message)); };
$('#spotify-disconnect').onclick = () => {
  spotify.disconnect();
  playing = false;
  void audio.setPlaying(false);
  updatePlay();
  $('#track-name').textContent = 'River, slowly';
  $('#track-artist').textContent = 'AMBMUSIC · 물과 바람의 소리';
  $('#source-label').textContent = 'NATURE RADIO';
  $('#track-tag').textContent = 'GENERATIVE AMBIENCE';
  $('#spotify-open').innerHTML = `${icon('spotify', 16)} 내 Spotify 연결하기 ${icon('arrow', 13)}`;
  $('#spotify-disconnect').hidden = true;
  $('#spotify-connect').hidden = false;
  $('#previous').hidden = true;
  $('#next').hidden = true;
  toast('Spotify 연결을 해제했어요.');
};

function openDialog(name: string) { $<HTMLDialogElement>(`#${name}-dialog`).showModal(); }
document.querySelectorAll<HTMLButtonElement>('[data-dialog]').forEach((button) => button.onclick = () => openDialog(button.dataset.dialog!));
$('#spotify-open').onclick = () => openDialog('spotify');
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog.querySelector<HTMLButtonElement>('.close-dialog')!.onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
});

let activityIndex = 1;
function setActivity(activity: Activity, manual = false) {
  activityIndex = activities.findIndex(([id]) => id === activity);
  scene?.setActivity(activity);
  $('#activity-caption').textContent = activities[activityIndex][2];
  document.querySelectorAll<HTMLButtonElement>('button[data-activity]').forEach((b) => {
    const active = b.dataset.activity === activity;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  if (manual) resetCycle();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-activity]')) button.onclick = () => setActivity(button.dataset.activity as Activity, true);
let cycle: ReturnType<typeof setInterval>;
function resetCycle() {
  clearInterval(cycle);
  cycle = setInterval(() => {
    if (!$<HTMLInputElement>('#auto-activity').checked || document.hidden || !$<HTMLInputElement>('#motion').checked) return;
    setActivity(activities[(activityIndex + 1) % activities.length][0]);
  }, 45000);
}
resetCycle();
$('#motion').onchange = () => {
  const enabled = $<HTMLInputElement>('#motion').checked;
  scene?.setMotion(enabled);
  $('#scene-status').textContent = enabled ? '천천히 흘러가는 중' : '고요한 정지 화면';
};
$('#quality').onchange = () => scene?.setQuality($<HTMLSelectElement>('#quality').value as Quality);

let immersive = false;
function toggleImmersion(force?: boolean) {
  immersive = force ?? !immersive;
  document.body.classList.toggle('immersive', immersive);
  $('#exit-immersion').hidden = !immersive;
  if (immersive) $('#exit-immersion').focus();
  else $('#immersion').focus();
}
$('#immersion').onclick = () => toggleImmersion();
$('#exit-immersion').onclick = () => toggleImmersion(false);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && immersive) toggleImmersion(false);
  if (document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, a, [contenteditable]'))) return;
  if (event.code === 'Space') { event.preventDefault(); void togglePlay(); }
  if (event.key.toLowerCase() === 'f') toggleImmersion();
});

let deadline: number | undefined;
function updateTimer() {
  if (!deadline) return;
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const display = `${Math.floor(left / 60).toString().padStart(2, '0')}:${(left % 60).toString().padStart(2, '0')}`;
  $('#timer-label').textContent = display;
  $('#timer-detail').textContent = `나를 위한 시간, ${display} 남았어요.`;
  if (left === 0) {
    stopTimer();
    toast('잠깐의 쉼은 어땠나요? 준비되면 천천히 돌아가세요.');
  }
}
function stopTimer() {
  deadline = undefined;
  $('#timer-label').textContent = '타이머';
  $('#timer-detail').textContent = '타이머 없이 오래 머물러도 괜찮아요.';
  $('#timer-stop').hidden = true;
  document.querySelectorAll('[data-minutes]').forEach((b) => b.classList.remove('active'));
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-minutes]')) button.onclick = () => {
  deadline = Date.now() + Number(button.dataset.minutes) * 60000;
  document.querySelectorAll('[data-minutes]').forEach((b) => b.classList.toggle('active', b === button));
  $('#timer-stop').hidden = false;
  updateTimer();
  $<HTMLDialogElement>('#timer-dialog').close();
  toast(`${button.dataset.minutes}분 동안, 나를 위한 시간.`);
};
$('#timer-stop').onclick = stopTimer;
const timerInterval = setInterval(updateTimer, 1000);
document.addEventListener('visibilitychange', updateTimer);
if (import.meta.hot) import.meta.hot.dispose(() => {
  scene?.dispose(); audio.dispose(); spotify.disconnect(); clearInterval(cycle); clearInterval(timerInterval); clearTimeout(toastTimeout);
});
