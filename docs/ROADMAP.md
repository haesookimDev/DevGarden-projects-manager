# Roadmap & TODO

> v0.1(MVP)을 끝까지 돌아가는 시스템으로 만드는 것이 1차 목표.
> 각 단계는 ROADMAP 상 한 단위(여기서는 "ROADMAP PR")로 정의되지만, 실제로는 [`§4 커밋 단위 분리 원칙`](./CONVENTIONS.md#4-커밋-단위-분리-원칙) 에 따라 **여러 GitHub PR 로 분할**해서 머지하는 경우가 많다.
> 모든 PR 은 [`./CONVENTIONS.md`](./CONVENTIONS.md) 절차를 따른다.

---

## Progress snapshot (2026-05-21)

- **머지된 GitHub PR**: 30 개 (PR #1 ~ #30)
- **테스트**: api unit 37 + web unit 14 + client unit 28 + harness-core 30 + llm-adapters 10 + api integration 38 + web e2e 14 = **171 cases**
- **CI**: 5 jobs (Lint · Typecheck · Unit · Integration · E2E) 모두 green
- **운영 정책 도입**: 한 PR 안의 commit 분리(§4), CI 통과 시 자동 머지(§6)
- **다음 우선순위**: M5 PR #16 (runs history + cost/success metrics)

| Milestone                          | 상태                                      |
| ---------------------------------- | ----------------------------------------- |
| M0 모노레포 부트스트랩             | ✅ 완료                                   |
| M1 인증 & 기본 도메인              | ✅ 완료                                   |
| M2 데스크탑 클라이언트 페어링      | ✅ 완료                                   |
| M3 하네스 코어 & 첫 실행           | ✅ 완료                                   |
| M4 GitHub 연동 마감 + PR 자동 생성 | ✅ 완료                                   |
| M5 옵저버빌리티 & 메타데이터       | 🟡 project detail 완료, runs history 예정 |
| M6 폴리시 & 출시 준비              | ⬜ 미시작                                 |

---

## M0. 모노레포 부트스트랩

- [x] **ROADMAP PR #1** `chore: bootstrap monorepo` → GH #1
  - pnpm workspace + Turborepo 셋업, 루트 설정, GitHub Actions lint/typecheck

- [x] **ROADMAP PR #2** `chore: scaffold apps and packages` → GH #2
  - apps/{web,api,client} + packages/{shared,harness-core,llm-adapters,ui}

- [x] **ROADMAP PR #3** `chore: docker-compose for dev` → GH #3
  - infra/docker-compose.{dev,}.yml + Dockerfile + .env.example

## M1. 인증 & 기본 도메인

- [x] **ROADMAP PR #4** `feat(api): prisma schema and migrations` → GH #6
  - 11 모델 + initial migration + Testcontainers 셋업

- [x] **ROADMAP PR #5** `feat(web,api): GitHub OAuth login` → GH #7
  - NextAuth v5 + GitHub provider + allow-list + InternalAuthGuard
  - E2E 보강은 GH #8 (Playwright 셋업), GH #11 (auth-fixture)

- [x] **ROADMAP PR #6** `feat(api): GitHub App installation + repo listing` → GH #9 + GH #10
  - GH #9: GithubAppService, ProjectsService, `/internal/projects` API
  - GH #10: web 측 `/dashboard/projects/new` 폼 + 목록

## M2. 데스크탑 클라이언트 페어링

- [x] **ROADMAP PR #7** `feat(api,client): pairing flow` → GH #12 + GH #13 + GH #14
  - GH #12: api `/internal/clients/pairings`, `/clients/pair`, ClientJwtService
  - GH #13: web `/dashboard/clients/new` 폼 + 1회용 토큰 표시
  - GH #14: Tauri client 페어링 UI + `tauri-plugin-store` JWT 저장

- [x] **ROADMAP PR #8** `feat(api,client): socket.io connect + heartbeat` → GH #15 + GH #16 + GH #17
  - GH #15: api ClientsGateway (JWT auth + ONLINE/OFFLINE + heartbeat)
  - GH #16: client `socket.io-client` 자동 연결 + 30s heartbeat + 연결 pill
  - GH #17: web dashboard에 client list + 5s 폴링

## M3. 하네스 코어 & 첫 실행

- [x] **ROADMAP PR #9** `feat(harness-core): YAML parser + IR + zod schema` → GH #18
  - 5 step kind 의 recursive schema, safe expression evaluator, 22 unit tests

- [x] **ROADMAP PR #10** `feat(llm-adapters): codex-cli + openai-compatible` → GH #19
  - 공통 LlmProvider 인터페이스 + 두 구현 + 10 unit tests

- [x] **ROADMAP PR #11** `feat(client): harness runner + git/fs/process tools` → GH #20 + GH #21 + GH #22 + GH #23 + GH #25
  - GH #20: harness-core `runHarness` 엔진 (tool/llm/condition/loop + onFail + 8 unit)
  - GH #21: client tools (`fs`, `process`, `git`) + PathPolicy + 8 unit
  - GH #22: api `RunsService` + `/internal/runs` CRUD + 5 integration
  - GH #23: web `/dashboard/runs/[id]` SSR + 2s 폴링 + 1 e2e
  - GH #25: end-to-end wiring — `RunsGateway` 가 `run:start` emit, client `run-executor` 가 받아서 `runHarness` 호출하고 `run:log/step/status` 로 보고 (api 8 unit + 2 integration, client 6 unit)

- [x] **ROADMAP PR #12** `feat(web,api): run UI + live log stream` → GH #26 + GH #27
  - GH #26: trigger UI — `/dashboard/runs/new` (project · harness · client picker + optional inputs JSON) + dashboard CTA, api `/internal/harnesses` 신규 (4 integration), web e2e 2 cases
  - GH #27: 실시간 broadcast — RunsGateway `run:<id>` room fan-out, ClientsGateway 가 INTERNAL_API_SECRET socket 도 수락, web BFF `/api/runs/[id]/stream` 가 SSE 로 forward, RunView 가 EventSource subscribe + 5s polling fallback (api unit +3, integration +2)
  - 후속: 실 client + 실 api 로 manual smoke 는 dogfood 단계에서

## M4. GitHub 연동 마감 + PR 자동 생성

- [x] **ROADMAP PR #13** `feat(api): GitHub webhook receiver` → GH #28
  - `POST /webhooks/github` — HMAC SHA-256 (`X-Hub-Signature-256`) 검증, 미서명/잘못된 서명 → 401
  - `GithubEvent` audit 테이블 신규 (deliveryId unique → 자동 idempotent)
  - `repository.full_name` 으로 Project lookup → projectId 연결
  - 5 integration + 5 HMAC unit
  - 후속: 이벤트별 broadcast / TodoItem upsert 는 PR #14 + PR #17 에서

- [x] **ROADMAP PR #14** `feat(client): auto branch → commit → push → PR` → GH #29
  - api `GithubPrService` — `Project` lookup → installation Octokit → `pulls.create`
  - api `RunsGateway` 가 새 socket 이벤트 `github:openPR` 처리 (ack 로 url/number 반환)
  - harness-core `HostBridge` 인터페이스 신규 — tool 이 host(client) 에 async request 가능
  - client `github.openPR` 도구 — host bridge 로 socket ack 받음
  - 4 api unit + 4 client unit + 4 gateway handler unit
  - 후속: 실 e2e (가짜 이슈 → 자동 PR) 는 GitHub App 자격 증명 필요한 manual smoke 로 진행

## M5. 옵저버빌리티 & 메타데이터

- [x] **ROADMAP PR #15** `feat(web): project metadata dashboard` → GH #30
  - api `ProjectsService.getDetail` + `GET /internal/projects/:id` — defaultClient/Harness include + runCount + lastRun + lastEvent
  - web `/dashboard/projects/[id]` SSR — config + stats + last run link + trigger CTA
  - 대시보드의 project rows 를 detail 페이지로 링크화
  - 2 api integration + 2 web e2e
- ⬜ **ROADMAP PR #16** `feat(web): runs history + cost/success metrics`
- ⬜ **ROADMAP PR #17** `feat(web): tasks unified view (issues + internal todos)`

## M6. 폴리시 & 출시 준비

- ⬜ **ROADMAP PR #18** `chore: production docker-compose + healthcheck + backup script`
- ⬜ **ROADMAP PR #19** `docs: setup guide for self-hosting`
- ⬜ **ROADMAP PR #20** `chore: client signed installers (Mac/Win/Linux)` (선택)

---

## 정책·인프라 보조 PR (ROADMAP 외)

본 항목들은 ROADMAP 상의 기능 단계는 아니지만 합의·운영 정책 도입이나 인프라 보강 차원에서 별도로 머지되었다.

- ✅ **GH #4** `docs: Add commit granularity policy` — [`CONVENTIONS §4`](./CONVENTIONS.md#4-커밋-단위-분리-원칙)
- ✅ **GH #5** `docs: Add auto-merge policy after CI pass` — [`CONVENTIONS §6`](./CONVENTIONS.md#6-머지)
- ✅ **GH #8** `chore(web): Set up Playwright e2e and fix middleware redirect` (M2 PR #5 회귀 발견·수정)
- ✅ **GH #11** `test(web): Add authenticated dashboard e2e via session cookie injection`

---

## v0.2+ 백로그

- 진짜 OAuth round-trip e2e (HTTPS mock + self-signed cert)
- 하네스 노드 UI (드래그-드롭)
- 다중 클라이언트 라우팅 / 큐잉
- 서브에이전트 마켓플레이스
- 외부 일정 도구 연동 (Linear/Jira/Notion)
- 비용 알람·예산 한도
- 멀티 LLM provider routing (cost/latency 기반)
- 클라이언트 JWT 의 OS keychain 저장 (현재 `tauri-plugin-store` plain JSON)
