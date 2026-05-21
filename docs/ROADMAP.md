# Roadmap & TODO

> v0.1(MVP)을 끝까지 돌아가는 시스템으로 만드는 것이 1차 목표.
> 각 단계는 ROADMAP 상 한 단위(여기서는 "ROADMAP PR")로 정의되지만, 실제로는 [`§4 커밋 단위 분리 원칙`](./CONVENTIONS.md#4-커밋-단위-분리-원칙) 에 따라 **여러 GitHub PR 로 분할**해서 머지하는 경우가 많다.
> 모든 PR 은 [`./CONVENTIONS.md`](./CONVENTIONS.md) 절차를 따른다.

---

## Progress snapshot (2026-05-21)

- **머지된 GitHub PR**: 25 개 (PR #1 ~ #25)
- **테스트**: api unit 21 + web unit 14 + client unit 24 + harness-core 30 + llm-adapters 10 + api integration 25 + web e2e 10 = **134 cases**
- **CI**: 5 jobs (Lint · Typecheck · Unit · Integration · E2E) 모두 green
- **운영 정책 도입**: 한 PR 안의 commit 분리(§4), CI 통과 시 자동 머지(§6)
- **다음 우선순위**: M3 PR #12 (web run trigger UI + 실시간 log broadcast) → 그 후 M4 ~ M6

| Milestone                          | 상태                             |
| ---------------------------------- | -------------------------------- |
| M0 모노레포 부트스트랩             | ✅ 완료                          |
| M1 인증 & 기본 도메인              | ✅ 완료                          |
| M2 데스크탑 클라이언트 페어링      | ✅ 완료                          |
| M3 하네스 코어 & 첫 실행           | 🟡 PR #11 완료, PR #12 진행 예정 |
| M4 GitHub 연동 마감 + PR 자동 생성 | ⬜ 미시작                        |
| M5 옵저버빌리티 & 메타데이터       | ⬜ 미시작                        |
| M6 폴리시 & 출시 준비              | ⬜ 미시작                        |

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

- ⬜ **ROADMAP PR #12** `feat(web,api): run UI + live log stream`
  - 진짜 socket.io `run:log` broadcast (현재는 폴링)
  - run trigger UI (현재는 trigger 없음, detail 만 표시)
  - Playwright E2E: 트리거 → 로그 수신 → 완료 표시

## M4. GitHub 연동 마감 + PR 자동 생성

- ⬜ **ROADMAP PR #13** `feat(api): GitHub webhook receiver`
  - `/webhooks/github` HMAC 검증
  - 이슈/PR/푸시 이벤트 → DB + socket broadcast
  - Verify: 실제 push → 대시보드 갱신

- ⬜ **ROADMAP PR #14** `feat(client): auto branch → commit → push → PR`
  - 하네스의 git/github 도구 마무리 (이미 git tools 는 GH #21 에 있음 — webhook + PR 생성만 남음)
  - 커밋/PR 시 `-c user.name="haesookimDev" -c user.email="ww232330@gmail.com"` 적용
  - E2E: 가짜 이슈 → 자동 PR 생성 → 웹에서 PR 카드 확인

## M5. 옵저버빌리티 & 메타데이터

- ⬜ **ROADMAP PR #15** `feat(web): project metadata dashboard`
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
