# Testing

## 1. 원칙

- **백엔드 신규/변경 → Vitest 기능 테스트 필수**
- **프론트엔드 신규/변경 → Playwright E2E 필수**
- 테스트는 PR과 동일 커밋에 포함. 다음 PR로 미루지 않는다.
- 기존 테스트가 빨간색이면 그 PR은 머지하지 않는다.

## 2. 테스트 종류

| 종류                       | 도구                    | 위치                        | 실행                        |
| -------------------------- | ----------------------- | --------------------------- | --------------------------- |
| Unit (순수 함수)           | Vitest                  | `*.spec.ts` 옆              | `pnpm test`                 |
| Integration (DB/외부 모의) | Vitest + Testcontainers | `apps/api/test/integration` | `pnpm test:int`             |
| Contract (API ↔ Web)       | Vitest + supertest      | `apps/api/test/contract`    | `pnpm test:contract`        |
| E2E (브라우저)             | Playwright              | `apps/web/e2e`              | `pnpm test:e2e`             |
| Client (Tauri)             | Vitest + 모의 IPC       | `apps/client/test`          | `pnpm test --filter client` |

## 3. 모킹 정책

- **GitHub API**: `nock` 또는 `msw`로 모킹. 실제 호출은 별도 `*.live.spec.ts`에만, CI에서 스킵
- **LLM**: `LLMProvider` 인터페이스에 fake 구현(고정 응답) 주입
- **Time**: `vi.useFakeTimers()`
- **DB**: Testcontainers로 실제 PostgreSQL 사용 (모킹 ❌)

## 4. 커버리지 목표

- API 핵심 모듈: 라인 커버리지 80%+
- harness-core: 90%+ (실행 엔진은 회귀 비용 큼)
- Web: E2E 골든 패스 5개 이상 (로그인, 프로젝트 추가, 클라이언트 페어링, 하네스 실행, PR 생성 관찰)

## 5. E2E 시나리오 (MVP)

위치: `apps/web/e2e/*.spec.ts`. 실행: `pnpm --filter @devgarden/web test:e2e`.
Playwright config가 `pnpm dev` 를 직접 spawn (테스트용 fake env 주입). 별도 docker-compose 필요 없음 (DB 없이 동작하는 path만 검증하는 한).

현재 구현:

- `auth-guard.spec.ts` — middleware 인증 가드 (4 cases)
- `dashboard.spec.ts` — 인증된 사용자 dashboard 접근 (2 cases). `auth-fixture.ts` 가 NextAuth JWT 세션 쿠키를 미리 발급
- `mock-server.ts` — `/internal/users/upsert`, `/internal/projects` 응답 (테스트 중 web SSR 이 호출)

### auth fixture vs 진짜 OAuth flow

현재 e2e 는 GitHub OAuth dance 자체를 검증하지 **않는다**. 이유: NextAuth(`oauth4webapi`)가 token / userinfo endpoint 에 HTTPS 만 허용해서, HTTP mock 서버로는 callback 단계에서 `OperationProcessingError: only requests to HTTPS are allowed` 가 발생.

대신 `auth-fixture` 가 `@auth/core/jwt` 의 `encode` 로 직접 세션 쿠키를 발급. 이게 검증하는 것:

- middleware 가 유효 세션을 통과시키는지
- dashboard server component 가 `session.user.id/login/githubId` 를 정확히 읽는지
- 보호된 페이지가 인증된 사용자에게 열리는지

검증하지 **못하는 것** (별도 PR 필요):

- `signIn` callback 의 allow-list 거부 흐름
- `jwt` callback 의 `upsertUserViaApi` 호출
- NextAuth provider URL override 가 실제 OAuth dance 에서 동작하는지

이 범위는 HTTPS mock 서버 (self-signed cert + `NODE_TLS_REJECT_UNAUTHORIZED=0`) 도입 PR 에서 충족 예정.

차후 PR:

- `oauth-flow.spec.ts` — HTTPS mock 으로 진짜 OAuth round-trip
- `project-add.spec.ts` — 폼 submit → 프로젝트 목록 갱신
- `client-pair.spec.ts` — 페어링 토큰 발급 → 모의 클라이언트 연결 → 상태 online
- `harness-run.spec.ts` — 하네스 트리거 → 로그 스트림 수신 → 상태 success
- `pr-observe.spec.ts` — 웹훅 mock → PR 카드 갱신

## 6. CI

- GitHub Actions
- 단계: `lint` → `typecheck` → `test` → `test:int` → `test:e2e` (병렬)
- 캐시: pnpm store, Turborepo remote cache
- 실패한 step은 fail-fast 하지 말고 모두 실행 (피드백 최대화)
