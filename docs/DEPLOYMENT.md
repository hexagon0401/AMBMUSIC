# Vercel 배포 준비

## 프로젝트 설정

이 앱은 Node 서버 없이 실행하는 Vite 정적 사이트다. Supabase, 데이터베이스, Vercel Functions가 필요하지 않다. 저장소 변경을 검토해 Git에 커밋한 뒤 Vercel에서 저장소를 가져온다. 현재 체크아웃의 로컬 변경이 자동으로 GitHub나 Vercel에 전달되지는 않는다.

| 항목 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | 저장소 루트 (`.`) |
| Node.js | 24.x (`package.json` engines) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`vercel.json`에 빌드·출력·기본 보안 헤더와 해시 파일 캐시 설정을 명시했다. `/`가 화면과 Spotify 콜백 경로이므로 모든 요청을 index.html로 돌리는 광범위한 rewrite는 필요하지 않다. 존재하지 않는 정적 파일이 HTML로 응답하지 않도록 유지한다. HTML에는 장기 immutable 캐시를 적용하지 않는다.

## 환경 변수

### Preview

Spotify 변수 없이 배포한다. 자연 소리·풍경·타이머는 전부 작동한다. 매번 달라지는 Preview 주소를 Production OAuth 콜백에 섞지 않는다. Production 전용 Spotify 값을 Preview 범위에 복사하지 않는다.

### Production의 선택적 Spotify 연결

Spotify Developer Dashboard에서 고정된 Production HTTPS 주소를 등록한 다음 Vercel 프로젝트의 **Production** 환경 변수에 설정한다.

- `VITE_SPOTIFY_CLIENT_ID`: 공개 앱 Client ID.
- `VITE_SPOTIFY_REDIRECT_URI`: 등록된 정확한 HTTPS 주소. 예: 실제 배포 도메인의 `/`. 끝의 슬래시와 경로까지 일치해야 한다.

`VITE_` 값은 빌드된 브라우저 코드에 공개된다. Client Secret·Supabase service role·개인 토큰을 여기에 넣지 않는다. 변수 수정 후 새 빌드가 필요하다. 로컬 `.env.local`의 loopback 주소를 Production 값으로 사용하지 않는다. 커스텀 도메인으로 바꾸면 Spotify 등록과 Production 변수도 함께 갱신한다.

Spotify는 Premium, 개발 앱 접근 권한, 브라우저 DRM 및 정책 검증이 필요하다. 이번 작업은 실제 로그인·토큰 갱신·음악 재생 성공을 검증한 배포가 아니다. Spotify 시각 미디어 결합 및 메타데이터·브랜딩 정책 검토 항목은 구현 계획을 따른다.

## 배포 전 검증

```sh
npm ci
npm run build
npm run test:e2e
npm run preview
```

클라우드에서 기본 npm 캐시를 쓸 수 없으면 `npm ci --cache /tmp/ambmusic-npm-cache`를 사용한다. 브라우저 테스트는 설치된 Chromium 또는 Playwright 브라우저가 필요하다. 별도 실제 배포를 하기 전 결과물에 index.html, 해시된 assets와 third-party-notices.txt가 있는지 확인한다.

Preview를 만든 뒤 흰색·다크 모드, 모바일, 6개 풍경, 새 풍경, 자동 여행, 움직임 줄이기, 오디오와 타이머를 확인한다. 개발 도구에서 자원 404와 콘솔 오류가 없어야 한다. Production에서는 고정 HTTPS 콜백과 실제 계정 재생을 별도로 확인한다.

기본 헤더는 카메라·마이크·위치 권한을 사용하지 않게 하고, MIME 추측 방지와 referrer 정책을 설정한다. Spotify SDK/DRM의 실제 목적지를 검증하지 않은 상태에서 엄격한 CSP나 COEP를 임의로 설정하지 않는다.

현재 배포 경로는 GitHub의 `hexagon0401/AMBMUSIC` main 브랜치를 연결한 Vercel 자동 배포다. 소스는 저장소 루트에 있으며 Vercel이 `npm run build`로 `dist`를 생성한다. Production 주소는 `https://ambmusic-cyan.vercel.app/`이다. 배포 문제 시 Vercel에서 이전 Deployment로 되돌릴 수 있다. 풍경·테마 설정은 브라우저에만 저장하며, 기기 간 동기화가 필요해질 때 Supabase를 별도로 검토한다.


## 현재 Spotify 운영 설정

Production 주소와 콜백은 `https://ambmusic-cyan.vercel.app/`이다. 환경 변수 이름은 대소문자를 구분한다. `VITE_SPOTIFy_CLIENT_ID` 오타를 `VITE_SPOTIFY_CLIENT_ID`로 수정했다. Client ID는 공개 식별자이며 클라우드의 프록시 시크릿 참조를 Vite 값으로 복사하면 안 된다. 액세스 토큰과 Client Secret은 배포하지 않는다.

사용자는 사이트의 **Spotify 연결 → Spotify로 연결**에서 권한을 허용한다. 연결 후 창에 곡·앨범·플레이리스트 공유 링크를 붙여 재생하거나 Spotify 앱의 기기 목록에서 **AMBMUSIC**을 선택한다. 브라우저 재생은 Premium과 지원되는 DRM 브라우저가 필요하다. 개발 모드 앱은 앱 소유자의 Premium과 사용자 allowlist를 확인한다. Spotify 공식 문서상 개발 모드는 최대 5명의 인증 사용자를 지원한다. 403이면 앱의 **Users Management**에서 로그인 계정을 확인한다.

PKCE 요청만 sessionStorage에 일시 저장하며 callback 직후 삭제한다. 토큰은 메모리에만 두고 만료 시 refresh token으로 갱신한다. 새로고침하면 다시 연결해야 한다. 다른 Vercel alias에서는 등록된 공식 주소로 이동해 연결하도록 안내한다. 모바일 재생은 사용자 클릭에서 `activateElement()`를 먼저 호출한다. 연결 취소·네트워크·기기 연결 시간 초과·Premium/DRM 오류와 재연결을 처리한다.

공식 참고: [SDK 시작](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started), [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
