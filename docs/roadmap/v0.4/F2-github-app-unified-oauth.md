# F2 — GitHub App unified OAuth (drop OAuth App)

> `apps.listInstallationsForAuthenticatedUser` 는 GitHub App 의 user-to-server token 만 받는데
> v0.3 까지의 SELF-HOSTING.md 가 **별도 OAuth App** 을 만들도록 안내해서 NextAuth 가 잘못된 종류의
> token 으로 호출 → `/dashboard/settings` 의 "Refresh from GitHub" 가 100% 400. GitHub App 하나만
> 쓰도록 통합.

## 1. Why

v0.3 dogfood 에서:

```
sync installations failed: 400 {"message":"GitHub rejected the user OAuth token.
Re-authenticate and try again.","error":"Bad Request","statusCode":400}
```

원인:

- `GET /user/installations` ([GitHub docs](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token)) 는 **GitHub App 의 user access token** 만 받음.
- `apps/web/src/auth.ts` 의 NextAuth GitHub provider 가 `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` 를 client credential 로 사용.
- v0.3 SELF-HOSTING.md §1.3 가 OAuth App (`/settings/developers`) 과 GitHub App (`/settings/apps`) 을 별도로 등록하도록 안내. OAuth App 의 token 은 `read:user user:email` scope 만, installation read 권한 없음.

결과: 첫 사용자가 onboarding 절차를 그대로 따라하면 `/dashboard/onboarding` 의 "Refresh from GitHub" 또는 `/dashboard/projects/new` 의 repo picker 가 무조건 실패.

GitHub App 자체에 OAuth feature 가 내장되어 있음 ([Identifying and authorizing users](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)). 그것의 Client ID/Secret 으로 NextAuth 가 인증하면 token 이 자동으로 user-to-server type 이라 installation 읽기 가능.

## 2. What (acceptance)

- [ ] `apps/web/src/auth.ts` 의 NextAuth GitHub provider 가 GitHub App 의 OAuth credential 로 동작 — 별도 환경변수 변경 없음 (`GITHUB_OAUTH_CLIENT_ID` / `_SECRET` 가 GitHub App credential 을 담는다는 의미로 재정의).
- [ ] api boot 시 자동 검증 — 사용자가 등록한 GitHub App 의 client_id 와 .env 의 `GITHUB_OAUTH_CLIENT_ID` 가 일치 안 하면 boot warning + `/dashboard/setup-status` 의 amber 배지 (F3 에서 활용).
- [ ] `docs/SELF-HOSTING.md` §1.3 재작성 — OAuth App 별도 등록 단계 제거. GitHub App 하나에 OAuth callback URL + user authorization 켜는 절차만 남김.
- [ ] `.env.example` 의 `GITHUB_OAUTH_*` 주석을 "GitHub App 의 Client ID / Secret" 으로 명확화.
- [ ] Migration 가이드 — v0.1~v0.3 에서 별도 OAuth App 으로 셋업한 운영자가 v0.4 로 어떻게 옮기는지 단계 문서.
- [ ] e2e `oauth-roundtrip.spec.ts` 가 v0.4 통합 flow 도 검증 — mock provider 가 GitHub App style scope 응답.

## 3. 결정 사항

| 결정             | 선택                                                                                           | 근거                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Credential 한 쌍 | **GitHub App 의 Client ID / Secret 만 사용**                                                   | OAuth App 별도 등록 자체를 폐기. 첫 사용자 혼동의 근원.                                                   |
| Env 키 이름      | 기존 `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` 유지                                                 | 이름 변경 시 v0.3 사용자에게 회귀. 의미만 재정의 + docs 명확화.                                           |
| Boot 자동 검증   | `GithubAppRegistration.clientId` 와 `process.env.GITHUB_OAUTH_CLIENT_ID` 가 다르면 logger.warn | best-effort, 부팅 막지 않음. F3 setup-status 가 같은 신호 사용.                                           |
| Legacy OAuth App | docs 에서 폐기 + migration 가이드                                                              | OAuth App credential 로도 NextAuth 자체는 동작 (로그인은 됨, installation 조회만 깨짐) → soft transition. |
| Scope 확장       | 기존 `read:user user:email` 유지                                                               | GitHub App user token 은 자체적으로 installation 권한 보유. 추가 scope 불필요.                            |
| 검증 e2e         | mock provider 가 GitHub App user token 응답 모사 — `/user/installations` mock endpoint 추가    | `oauth-roundtrip.spec.ts` 가 happy + denied 외에 "installation refresh OK" case 추가.                     |

## 4. PR 분할 plan

| PR   | 한 줄                                                                      | 변경 영역                                                                             | 테스트                 |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| F2-1 | `feat(api): credential mismatch warning on boot`                           | `apps/api/src/main.ts` 또는 GithubAppService 의 startup hook                          | 1 unit + 1 integration |
| F2-2 | `feat(web): /api/auth/error 분기 가 'token rejected' 케이스 우회 안내`     | `signin/page.tsx` SignInError 갱신, error 코드 mapping                                | 1 vitest               |
| F2-3 | `test(web,e2e): mock /user/installations + oauth-roundtrip "refresh" case` | `apps/web/e2e/mock-server.ts`, `oauth-roundtrip.spec.ts`                              | 1 e2e (refresh path)   |
| F2-4 | `docs(self-hosting): rewrite §1.3 GitHub App unified OAuth`                | `docs/SELF-HOSTING.md` §1.3 통째 / `.env.example` 주석 / `docs/SECURITY.md` 시크릿 표 | —                      |
| F2-5 | `docs(migration): v0.3 → v0.4 OAuth credential 교체 가이드`                | `docs/migration/v0.3-to-v0.4.md` (신규)                                               | —                      |

## 5. 테스트 plan

### 단위

- credential mismatch detection — `GithubAppRegistration.clientId` 와 env 가 다를 때 logger.warn 호출.

### Integration

- boot 시 mismatch 시나리오 → log message 검증.

### E2E

- 신규 case: mock provider 가 GitHub App user token 으로 `/user/installations` 응답 → `/dashboard/onboarding` 의 "Refresh from GitHub" 클릭 → installations 목록이 화면에 표시.

## 6. 리스크 / 미해결

- **기존 사용자 영향** — 별도 OAuth App credential 로 셋업된 운영자는 로그인은 되지만 installation 조회는 계속 실패. boot warning + migration 가이드가 안내. soft transition.
- **GitHub App OAuth callback URL** — GitHub App 페이지에서 "Identifying and authorizing users" 섹션의 callback URL 설정이 필수. SELF-HOSTING.md 가 화면 캡처 포함 추천.
- **OAuth user token expire (8h)** — GitHub App user token 의 기본 만료. NextAuth 가 refresh 안 함 → 사용자가 8시간마다 재로그인 필요. v0.5+ 에서 refresh token flow 고려.

## 7. 의존성 / 영향

- F3 (setup-status) 가 F2 의 credential mismatch 신호 활용.
- F4 의 SELF-HOSTING.md 재작성이 F2 §1.3 결과 반영. F2 머지 후 F4.

## 8. 완료 정의

- [ ] PR F2-1 ~ F2-5 모두 머지.
- [ ] CI green + 신규 e2e case green.
- [ ] dogfood: GitHub App credential 로 새로 셋업 → "Refresh from GitHub" 정상 동작 (수동).
- [ ] `docs/SELF-HOSTING.md` §1.3, `.env.example`, `docs/migration/v0.3-to-v0.4.md` 머지.
