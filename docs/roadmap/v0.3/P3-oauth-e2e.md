# P3 — OAuth round-trip e2e + HTTPS dev

> v0.1 부터 이어진 known limitation. 현재 Playwright 가 `authjs.session-token` 쿠키를 직접 주입해서 인증
> 우회. HTTPS 가 필수인 GitHub OAuth 의 실 dance 는 검증 못 함. mkcert 자체 CA + GitHub OAuth mock
> provider 로 실 round-trip 을 e2e 에 넣는다.

## 1. Why

`apps/web/e2e/auth-fixture.ts` 의 첫 주석:

```
// Playwright fixture that signs an authjs JWT and attaches it as the session
// cookie before the test starts. Lets us exercise auth-protected pages without
// running the full OAuth dance.
```

v0.1 Known Limitations 인용:
> OAuth round-trip e2e — HTTPS-only 제약으로 mock cookie 주입 방식만 e2e. 실 OAuth dance 검증은 manual.

→ 회귀가 안 잡힘. `[...nextauth]/route.ts`, callback handler, allow-list, redirect 로직, cookie 설정 — 모두
manual smoke 의존. NextAuth v5 마이너 업데이트 / 의존성 충돌 회귀가 PR-time CI 에서 안 보임.

## 2. What (acceptance)

- [ ] e2e 환경에 **mkcert 자체 CA + localhost cert** 가 셋업되어 web 이 `https://localhost:3001` (e2e 전용
      포트) 로 뜸.
- [ ] **GitHub OAuth mock server** 가 e2e 안에서 (mock-server.ts 처럼) 띄워져, NextAuth v5 의 GitHub
      provider 가 endpoint 를 mock 으로 override 가능.
- [ ] 신규 e2e `oauth-roundtrip.spec.ts` — `/dashboard` 진입 → `/auth/signin` redirect → "Continue with
      GitHub" 클릭 → mock GitHub authorize → callback → 세션 쿠키 set → `/dashboard` 진입 성공.
- [ ] 기존 `auth-fixture.ts` 의 cookie 주입 방식은 그대로 유지 (대부분 e2e 는 빠른 fixture 사용). OAuth
      round-trip 은 dedicated spec 에서만.
- [ ] CI Playwright job 이 cert 신뢰 셋업 포함 — `mkcert -install` 또는 NODE_EXTRA_CA_CERTS 설정.
- [ ] `docs/TESTING.md` 에 OAuth e2e 셋업 / 로컬 실행 방법 추가.

## 3. 결정 사항

| 결정          | 선택                                                              | 근거                                                                          |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| HTTPS cert    | **mkcert** (자체 CA + localhost cert)                             | 가장 가벼움. CI 에서 `mkcert -install` 한 줄. self-signed 직접 발급보다 신뢰 셋업 단순. |
| GitHub OAuth  | **자체 mock server** (e2e 안에서 NodeJS HTTP)                     | 실 GitHub 의존하면 flaky + rate limit. NextAuth 의 `clientId`/`clientSecret` 만 다른 값으로 띄워 mock 으로 redirect. |
| NextAuth 설정 | env 로 `GITHUB_OAUTH_AUTHORIZE_URL` / `GITHUB_OAUTH_TOKEN_URL` 등 override 지원 | Web 코드 변경 최소화. e2e 만 override.                                        |
| Test allow-list | mock user 의 GitHub login (`devgarden-e2e`) 을 ALLOWED_GITHUB_LOGINS env 에 넣어 e2e 실행 | 기존 allow-list 흐름 그대로 검증 가능.                                        |
| HTTPS port    | 3001 (web e2e 기본은 3000) — 둘 다 띄우지 않고 e2e mode 일 때 3001 만 | port 분리로 dev 와 충돌 없음.                                                 |
| Fallback      | 기존 cookie-injection fixture 유지 — OAuth spec 하나만 실 dance   | 모든 e2e 가 OAuth 거치면 느려짐. cost 대비 가치 균형.                         |

## 4. PR 분할 plan

| PR    | 한 줄                                                                       | 변경 영역                                                                | 테스트                          |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| P3-1  | `chore(web): NextAuth GitHub provider env-overridable endpoints`            | `apps/web/src/auth.ts`, `auth.config.ts`                                | 1 unit (override active when env set) |
| P3-2  | `chore(web,e2e): mkcert + https playwright config (e2e profile)`            | `playwright.config.ts` (https 옵션), `e2e/cert/` (gitignored, mkcert 산출물), README | manual setup smoke |
| P3-3  | `feat(web,e2e): github oauth mock server (start in global-setup)`           | `e2e/github-oauth-mock.ts`, `global-setup.ts` 가 시작/종료                | 1 e2e (mock server up/down)     |
| P3-4  | `test(web): oauth-roundtrip e2e`                                            | `e2e/oauth-roundtrip.spec.ts`                                            | 1 e2e (full dance)              |
| P3-5  | `docs(testing): oauth e2e setup + mkcert + ci notes`                        | `docs/TESTING.md`, `.github/workflows/e2e.yml`                          | —                               |

## 5. 테스트 plan

### 신규 e2e
- `oauth-roundtrip.spec.ts`:
  1. `await page.goto('https://localhost:3001/dashboard')` → redirect to `/auth/signin`.
  2. `await page.click('button:has-text("Continue with GitHub")')` → mock GitHub `/authorize` 페이지.
  3. mock 이 자동 redirect (`Approve` 버튼 클릭 or 즉시 callback) → web callback handler.
  4. `expect(page).toHaveURL(/dashboard/)` + session cookie 확인.
- denied case: allow-list 에 없는 user → `/auth/error` 표시.

### 기존 e2e
- 영향 없음 — cookie injection fixture 그대로. https URL 사용 여부만 playwright config 분기.

### CI
- e2e job 이 mkcert 설치 + `mkcert -install` + cert 생성. macos-runner 와 ubuntu-runner 둘 다 동작 검증.

## 6. 리스크 / 미해결

- **NextAuth 의 OAuth endpoint override 가 v5 에서 어떻게 노출되는지** — provider config 의 `authorization.url`,
  `token.url`, `userinfo.url` 로 override 가능 확인. P3-1 에서 검증.
- **mkcert CI 셋업** — Linux runner 는 `apt install libnss3-tools` 추가 필요. macOS runner 는 brew 기본.
- **GitHub OAuth mock 의 정확도** — 실 GitHub 가 token 응답에 `expires_in` 없음, user 응답이 특정 필드만
  필요. NextAuth profile callback 호환 위해 mock 응답 신중히 작성.
- **Cert 파일 gitignore** — `e2e/cert/*.pem` 은 절대 커밋 금지 (mkcert -install 로 each-host 생성).
- **Playwright HTTPS 의 cert 신뢰** — `ignoreHTTPSErrors: true` 보다 mkcert CA 신뢰가 정확. CI 에서 둘 다
  지원.

## 7. 의존성 / 영향

- 다른 마일스톤과 독립.
- P4 의 CI 변경과 겹치는 영역 (`e2e.yml`). 합칠지는 PR-time 에 판단 — 분리해서 review 단순화 권장.

## 8. 완료 정의

- [ ] PR P3-1 ~ P3-5 모두 머지.
- [ ] CI e2e job 이 mkcert 설치 + cert 생성 + HTTPS 모드 e2e green.
- [ ] `oauth-roundtrip.spec.ts` 가 PR-time 마다 실행.
- [ ] 기존 80+ e2e cases 회귀 없음.
- [ ] `docs/TESTING.md` OAuth e2e 섹션 머지.
