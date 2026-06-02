# P4 — Ops + CI hardening

> v0.2.1 가 `docker build` 회귀로 release-after-release 패치를 만들어야 했다. PR-time CI 가 prod build path
> 를 안 봤기 때문. 구조화된 로그와 `/metrics` 도 갖춰 P1 의 다중 인스턴스를 운영자가 모니터링 할 수 있게.

## 1. Why

v0.2.1 사후 분석 (`CHANGELOG.md`):

> per-PR CI 는 소스에서 빌드해 통과했고 — nightly `docker build` 만 노출.

→ N4 에서 추가된 `@devgarden/harness-core` / `@devgarden/harness-templates` 가 source-only 패키지였던 게
`docker build` 에서만 깨졌고, **PR-time CI 가 안 봤기 때문에** v0.2.0 tag 후 패치가 필요. 이 사고가 재발하지
않도록 PR-time 에 prod build smoke 가 들어가야 한다.

추가로 v0.2 까지 api 가 NestJS 기본 Logger (console 기반, 비구조화) 만 사용. 운영자가 로그 수집기/검색에
넣기 어렵다. P1 의 다중 인스턴스 환경에서 metrics endpoint 가 없으면 부하 분산 검증/모니터링도 불가.

## 2. What (acceptance)

- [ ] **PR-time docker build smoke** — `apps/api` 와 `apps/web` 의 `Dockerfile` 이 PR 마다 빌드되어 회귀 차단.
      Push 단계는 안 함 (cost). 실패 시 PR red.
- [ ] **Nightly tauri build smoke** 확장 — 기존 push-to-main 트리거 + 새 weekly schedule. 추가 코스트 없음
      (workflow_dispatch + scheduled).
- [ ] **pino 도입** — api 의 Nest Logger 를 pino-based 로 교체, JSON 라인 출력. 개발 모드는 pretty-print
      (pino-pretty), prod 는 JSON 그대로.
- [ ] **`/metrics` endpoint** — prom-client 로 4~5 핵심 메트릭:
  - `dg_http_requests_total{method, route, status}` (Nest interceptor)
  - `dg_run_status_total{status}` (CreateRun + setStatus 시점)
  - `dg_notification_delivered_total{channel}` (deliverAll 후)
  - `dg_notification_sse_clients` (현재 연결된 SSE 클라이언트 수, gauge)
  - `dg_redis_publish_total{channel}` (P1 머지된 경우만)
- [ ] `INTERNAL_API_SECRET` 으로 `/metrics` 보호 (또는 `METRICS_AUTH=internal` 옵션). 기본 비공개.
- [ ] `docs/SELF-HOSTING.md` 의 옵저버빌리티 섹션 — pino JSON 로그 형태, /metrics scrape 예시, Grafana
      대시보드 hint.

## 3. 결정 사항

| 결정              | 선택                                                             | 근거                                                                    |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 로그 라이브러리   | **pino** (Nest Logger override)                                  | 성능 최상, JSON 친화. nestjs-pino 모듈 사용.                            |
| 로그 형식         | dev=pretty, prod=JSON 한 줄                                      | 사람/기계 둘 다 행복하게. NODE_ENV 분기.                                |
| Metrics format    | **Prometheus `/metrics` (prom-client 직접)**                     | OpenTelemetry 도입은 v0.4+. 우리 단일 endpoint scrape 에는 prom-client 충분. |
| Metrics auth      | **INTERNAL_API_SECRET 헤더** 또는 `METRICS_PUBLIC=true` env       | 기본 비공개. 운영자가 명시적으로 열 수 있음.                            |
| Docker build CI   | **PR-time, ubuntu-latest, buildx cache**                          | 추가 ~3~5분. v0.2.1 비용 대비 충분히 가치.                              |
| Tauri smoke       | **기존 push-to-main + 신규 weekly schedule + on-tag**             | PR 마다 돌리면 너무 비쌈. release-blocker 만 차단.                      |
| pino transport    | **stdout 만** (수집기 측에서 처리)                                | 단순함. file/syslog 직접 출력은 운영 환경 책임.                          |

## 4. PR 분할 plan

| PR    | 한 줄                                                                       | 변경 영역                                                                | 테스트                          |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| P4-1  | `ci: pr-time docker build smoke (api + web)`                                | `.github/workflows/ci.yml` (or new `docker-smoke.yml`)                  | CI workflow self-test           |
| P4-2  | `ci: nightly + on-tag tauri build smoke`                                    | `.github/workflows/tauri-build-smoke.yml`                                | manual workflow_dispatch        |
| P4-3  | `feat(api): structured logging with pino (nestjs-pino)`                     | `apps/api/src/main.ts`, `app.module.ts`, env config                     | 1 unit (logger context)         |
| P4-4  | `feat(api): /metrics endpoint with prom-client + http counter`              | `metrics/` 모듈, interceptor, controller                                 | 2 integration (auth + counter increment) |
| P4-5  | `feat(api): run/notification metrics + sse client gauge`                    | RunsService + NotificationsService 에 metric 호출                        | 2 integration (gauge inc/dec)   |
| P4-6  | `docs(self-hosting): logging + metrics section`                             | `docs/SELF-HOSTING.md`                                                   | —                               |

## 5. 테스트 plan

### Integration
- `metrics.spec.ts` — INTERNAL_API_SECRET 없으면 401, 있으면 prometheus text format 반환.
- HTTP request counter — 다양한 status code 가 들어와도 라벨 정상.
- Run status counter — createRun + setStatus(SUCCESS) → `dg_run_status_total{status="SUCCESS"}` 1 증가.
- SSE client gauge — `/internal/users/:id/notifications/stream` 구독 시작/종료에 따라 gauge 증감.

### Unit
- pino logger formatter 가 dev/prod 분기.

### CI workflow self-test
- docker-smoke job 이 `apps/api/Dockerfile`, `apps/web/Dockerfile` 둘 다 빌드 성공.
- 의도적으로 깨진 Dockerfile (별도 branch 테스트) 에서 red 확인.

## 6. 리스크 / 미해결

- **PR-time docker build 시간** — caching 잘 안되면 3~5분 추가. buildx 의 GitHub Actions cache 사용.
- **prom-client 와 Nest 의 lifecycle** — singleton Registry 사용, 모듈 reload 시 registry collision 피하기.
- **SSE client gauge 정확도** — 클라이언트 abrupt disconnect 시 dec 가 호출되는지 확인 — Observable
  finalize/teardown 에서 inc/dec.
- **pino logger 의 Nest 통합** — `nestjs-pino` 가 request-id 자동 부여. e2e 가 logger 인터페이스 변화에
  의존 안 하는지 확인.

## 7. 의존성 / 영향

- P1 (Redis) 가 머지된 후 metrics 에 `dg_redis_publish_total` 추가하면 효과 큼 — 작업 순서 가이드에서
  P4-5 는 P1 이후로 권장.
- P3 의 CI 변경과 같은 파일 (`.github/workflows/ci.yml`) — merge conflict 위험. P4-1 먼저 머지 후 P3-5
  rebase.
- P2 의 tauri build smoke 가 libdbus 의존 추가 필요 (Linux runner) — P4-2 에서 같이 반영.

## 8. 완료 정의

- [ ] PR P4-1 ~ P4-6 모두 머지.
- [ ] CI 6 jobs (기존 5 + docker-smoke) 모두 green.
- [ ] `curl http://localhost:3001/metrics -H "X-Internal-Auth: <secret>"` 가 prometheus text 반환.
- [ ] api 로그가 JSON 한 줄 형태 (prod) / pretty (dev).
- [ ] `docs/SELF-HOSTING.md` 옵저버빌리티 섹션 머지.
