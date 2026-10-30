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

현재 배포 경로는 GitHub의 `hexagon0401/AMBMUSIC` 저장소를 Vercel에서 Import하는 방식이다. 소스는 저장소 루트에 있으며 Vercel이 `npm run build`로 `dist`를 생성한다. 이 방식에는 클라우드 환경의 Vercel Token이 필요하지 않다. 클라우드 CLI로 시도한 Production 배포는 로그인 자격 증명이 없고 공식 로그인·임시 배포 요청도 네트워크 오류로 실패했으므로, 실제 Vercel 사이트가 생성되었다고 간주하지 않는다. 배포 이후 문제 발생 시 Vercel에서 이전 Deployment로 되돌릴 수 있다. seed·테마 등 로컬 설정은 브라우저에만 있으며 기기 간 동기화가 필요할 때 Supabase 도입을 별도로 설계한다.
