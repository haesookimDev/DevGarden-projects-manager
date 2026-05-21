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

1. `web-auth.spec.ts` — GitHub OAuth 로그인 → 대시보드 진입
2. `web-project-add.spec.ts` — 레포 선택 → 프로젝트 생성 → 목록에 표시
3. `web-client-pair.spec.ts` — 페어링 토큰 발급 → 모의 클라이언트 연결 → 상태 online
4. `web-harness-run.spec.ts` — 하네스 트리거 → 로그 스트림 수신 → 상태 success
5. `web-pr-observe.spec.ts` — 웹훅 mock → PR 카드 갱신

## 6. CI

- GitHub Actions
- 단계: `lint` → `typecheck` → `test` → `test:int` → `test:e2e` (병렬)
- 캐시: pnpm store, Turborepo remote cache
- 실패한 step은 fail-fast 하지 말고 모두 실행 (피드백 최대화)
