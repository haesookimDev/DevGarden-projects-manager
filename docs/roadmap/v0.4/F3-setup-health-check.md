# F3 — Setup health-check page

> 새 운영자가 셋업 중 어디서 막혔는지 모를 때 `/dashboard/setup-status` 한 화면에서 자기진단.
> DB / GitHub App / sidecar bundle / SMTP / Redis / OAuth credential 일치 등 6~7 개 probe.

## 1. Why

v0.3 dogfood 에서 발견된 두 문제 (Node 24 incompat, OAuth App vs GitHub App) 는 둘 다 **사용자가 어디서
막혔는지 즉시 알 수 없는** 패턴이었다 — sidecar 는 stderr 마지막 줄만 보이고, OAuth 는 "Refresh"
누르기 전까진 잘못된 credential 인지 모름.

운영자가 첫 셋업 직후 한 화면에서 모든 dependency 의 상태를 본다면:

- DB 연결 OK / migration 적용됨
- GitHub App registration 있음 + clientId 가 `.env` 와 일치
- Sidecar binary 가 빌드 산출물에 있음 (F1 결과 반영)
- SMTP 설정됨 (선택)
- Redis 연결 OK (선택, REDIS_URL 셋 시)
- AUTH_URL 이 브라우저에서 접근하는 URL 과 일치
- (등)

→ 막힌 항목에 amber/red 배지 + actionable hint (예: "GitHub App Client ID 가 .env 와 다릅니다. SELF-HOSTING.md §1.3 참조") 로 사용자가 다음 액션 알 수 있음.

## 2. What (acceptance)

- [ ] api `GET /internal/setup/status` (`InternalAuthGuard`) — JSON 으로 6~7 probe 결과 반환. 각 probe: `{ id, label, status: 'ok' | 'warn' | 'error', message?: string, hint?: string }`.
- [ ] probe 목록 (최소):
  - `db` — Prisma `$queryRaw SELECT 1` + `migration` 테이블 row count
  - `github-app` — `GithubAppRegistration` 가 존재 + 사용자별 1개 이상
  - `oauth-credential` — `GITHUB_OAUTH_CLIENT_ID` 와 GithubAppRegistration.clientId 일치 (F2)
  - `auth-url` — `AUTH_URL` 가 `NEXT_PUBLIC_API_URL` 와 동일 host (cross-origin 흔한 misconfig)
  - `sidecar` — F1 의 bundled binary 가 client build 산출물에 있는지 (client repo 기준, 빌드 후 path)
  - `smtp` — `SMTP_HOST` 셋 시 transport 가 생성됐는지 (이미 P3 P4-5 의 metric 활용 가능)
  - `redis` — `REDIS_URL` 셋 시 publisher 가 connected
- [ ] web `/dashboard/setup-status` 페이지 — SSR 로 위 endpoint 호출, table 형식 표시 + amber/red row 에 "What to do" 펼치기.
- [ ] dashboard 의 sidebar / topbar 에 "Setup 상태" CTA — error / warn 항목 있을 때만 amber dot 표시.
- [ ] 1 unit (각 probe pure function) + 2 integration (full status 200 + DB down 시 부분 응답).

## 3. 결정 사항

| 결정              | 선택                                                                                    | 근거                                                                               |
| ----------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | ---------------------------------- |
| Endpoint 경로     | `GET /internal/setup/status`                                                            | `internal-auth.guard.ts` 가 이미 처리하는 도메인.                                  |
| Probe 응답 schema | `{ id, label, status, message?, hint? }` + 상위 `summary: 'ok'                          | 'warn'                                                                             | 'error'` | 단순한 평면 구조. UI 가 색만 매핑. |
| UI route          | `/dashboard/setup-status` (NextAuth 보호)                                               | dashboard 같은 권한 boundary.                                                      |
| Sidebar 표시      | `summary !== 'ok'` 일 때만 amber dot                                                    | green 일 땐 silent. 막힐 때만 attention.                                           |
| Probe 실패 격리   | 한 probe 실패가 전체 200 응답을 막지 않음. 개별 status='error'.                         | 진단 페이지가 자기 자신 깨지면 안 됨.                                              |
| Sidecar probe     | 클라이언트 자체에서 확인 불가 (api 가 client 의 fs 못 봄) → docs 안내 + manual checkbox | F1 의 build 산출물은 운영자 PC 에 있고 api 가 모름. UI 의 사용자 self-attestation. |

## 4. PR 분할 plan

| PR   | 한 줄                                                                       | 변경 영역                                                                     | 테스트              |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| F3-1 | `feat(api): SetupStatusService + 6 probes`                                  | `apps/api/src/setup/setup-status.service.ts`, module                          | 6 unit              |
| F3-2 | `feat(api): GET /internal/setup/status endpoint`                            | `setup-status.internal.controller.ts`                                         | 2 integration       |
| F3-3 | `feat(web): /dashboard/setup-status page + API client`                      | `apps/web/src/app/dashboard/setup-status/page.tsx`, `lib/api/setup-status.ts` | 2 e2e (ok + warn)   |
| F3-4 | `feat(web): dashboard sidebar setup dot when summary != ok`                 | dashboard layout / sidebar 컴포넌트                                           | 1 e2e (dot toggles) |
| F3-5 | `docs(self-hosting): setup-status 자기진단 가이드 + screenshot placeholder` | `docs/SELF-HOSTING.md` 새 §6.4 (옵저버빌리티 다음)                            | —                   |

## 5. 테스트 plan

### 단위

- 각 probe pure function 이 input → 정확한 status 반환 (mock prisma/env).

### Integration

- full status: 모든 probe 의 결과를 한 JSON 으로 종합.
- DB down: status='error' 응답 (다른 probe 는 계속 동작).

### E2E

- 모든 probe ok → page 가 green 상태 + sidebar dot 없음.
- 1 개 probe warn → amber dot + 해당 row 의 "What to do" hint 표시.

## 6. 리스크 / 미해결

- **Probe 결과 캐싱** — 매 페이지 진입마다 모든 probe 실행은 비용. 30 초 캐시 또는 SSR cache. 단순화 우선, 5초 미만.
- **Sidecar probe 의 server-side 한계** — api 가 client PC 의 fs 못 봄. self-attestation 으로 우회 (F1 의 첫 페어링 직후 sidecar 가 정상 시작했는지 DB 에 기록 → status 로 노출 가능).
- **probe schema 변경 시 UI 호환** — 신규 probe 추가가 빈번할 수 있어 schema 가 backward-compatible.

## 7. 의존성 / 영향

- F2 의 `oauth-credential` mismatch 신호를 직접 활용. F2 머지 후 F3 시작.
- F1 의 sidecar bundle 결과는 self-attestation 으로 우회 → 의존성 약함.

## 8. 완료 정의

- [ ] PR F3-1 ~ F3-5 모두 머지.
- [ ] CI green + 신규 e2e green.
- [ ] dogfood: 일부러 .env 의 OAuth credential 을 잘못된 값으로 설정 → setup-status 가 amber + actionable hint.
- [ ] `docs/SELF-HOSTING.md` 새 §6.4 머지.
