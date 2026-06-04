# Changelog

본 프로젝트의 모든 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식을
느슨하게 따르며 — semver 적용. 자세한 PR 단위 작업 이력은 [`docs/ROADMAP.md`](docs/ROADMAP.md).

## [v0.3.1] — 2026-06-04

### Fixed

- **prod 부팅 시 pino crash** (PR #134) — `infra/docker-compose.yml` 의
  `LOG_LEVEL: ${LOG_LEVEL:-}` 가 unset 시 빈 문자열을 export 하고,
  `apps/api/src/logger/pino-config.ts` 의 `env.LOG_LEVEL ?? default` 가 `''` 에
  fallback 안 함 → pino 가 `default level: must be included in custom levels`
  로 즉시 죽음. v0.3.0 prod 부팅 자체가 깨졌음. fix: `?.trim()` + truthy check
  로 unset / 빈 문자열 / whitespace 동일 처리. 회귀 케이스 추가.

## [v0.3.0] — 2026-06-04

### Production hardening

v0.2 는 운영자 한 명이 매일 쓸 만한 도구였다. v0.3 은 그걸 **여러 인스턴스에서, 더 안전하게, 더 관측 가능하게**
운영할 수 있는 수준으로 끌어올렸다. 새 기능 확장은 없음 — v0.2 known limitations 중 운영 위험성에 직결된
4개 항목을 narrow & deep 으로 정리. 4 마일스톤 (P1~P4), 20 PRs.

### Added

- **P1 — Multi-instance SSE + Redis pub/sub** — `NotificationsService` 가 `REDIS_URL` 설정 시 `dg:notif`
  채널로 publish, 모든 api 인스턴스의 subscriber 가 stream$ 으로 fan-out. `RunsGateway` 의 socket.io 도
  `@socket.io/redis-adapter` 로 lift — `server.to('run:<id>').emit()` 가 모든 인스턴스에 도달.
  `infra/docker-compose.yml` 에 `--profile multi-instance` 로 redis 서비스 (off by default). 단일 인스턴스
  사용자는 추가 인프라 0.
- **P2 — Client JWT OS keychain** — Tauri Rust `keyring` crate 직접 binding 으로 페어링 JWT 를 macOS
  Keychain / Windows Credential Manager / Linux libsecret 에 저장. 기존 `pairing.json` 사용자는 첫 실행 시
  자동으로 keychain 으로 migrate 후 plain 파일 삭제. 키체인 unavailable (libsecret 없음 / sandbox) 시
  파일 fallback + amber "Insecure storage" 배너. `DEVGARDEN_PAIRING_STORAGE=file` env override 도 동일
  배너로 안내.
- **P3 — OAuth round-trip e2e** — v0.1 이후 manual smoke 의존이었던 `/api/auth/callback/github` /
  allow-list / 세션 cookie 셋업이 PR-time e2e 로 검증. happy path + allow-list 거부 path 2 케이스.
  `apps/web/src/auth.ts` 의 `userinfoConfig` 가 `oauth4webapi` 의 HTTPS hardcoded 체크를 우회 (production
  영향 0 — env 가드). `pages.error: '/signin'` 로 거부 사용자가 SignInPage 의 AccessDenied 배너로 라우팅.
- **P4 — Ops + CI hardening** — PR-time docker build smoke (api/web buildx + GHA cache). pino 기반 구조화
  로그 (prod=JSON 한 줄, dev=pino-pretty). Prometheus `/metrics` (4 도메인 metric:
  `dg_http_requests_total`, `dg_run_status_total`, `dg_notification_delivered_total`,
  `dg_notification_sse_clients`). `tauri-build-smoke.yml` 트리거 확장 (v\* tags + weekly cron) — release
  blocker 사고 (v0.2.1 docker 깨짐) 재발 방지.

### Changed

- api 가 `OnApplicationShutdown` 으로 redis 클라이언트 정리, `app.enableShutdownHooks()` 로 SIGTERM/SIGINT
  처리.
- NextAuth `pages.error` 가 `/signin` 으로 라우팅 — generic `/api/auth/error` 대신 기존 SignInPage 의
  AccessDenied 배너 사용.
- `infra/docker-compose.yml` 의 api 서비스가 `REDIS_URL` / `LOG_LEVEL` / `METRICS_PUBLIC` env 통과.
- `.env.example` 에 v0.3 신규 env 4 개 (REDIS_URL / LOG_LEVEL / METRICS_PUBLIC + 주석) 추가.
- `docs/SELF-HOSTING.md` 가 §3.1 키체인 저장, §6 옵저버빌리티 (logs + metrics), §6.3 다중 인스턴스 셋업
  반영.

### Stats

- **PR 머지**: 20 (PR #112 ~ #132) — v0.3 plan + P1+P2+P3+P4 — 누적 132.
- **테스트**: api 97 unit + 181 integration · client-runner 43 · web 21 unit + 82 e2e · harness-core 32 ·
  harness-templates 10 · llm-adapters 10 · client 34 = **510 cases** (누적, v0.2.1 471 → +39).
- **CI**: 6 jobs (Lint · Typecheck · Unit · Integration · E2E · **Docker build smoke**) 모두 green +
  Tauri build smoke (push-to-main / v\* tag / weekly cron / dispatch).

### Known Limitations (v0.4+ 백로그)

- **HTTPS dev cert (mkcert)** — P3 시 `oauth4webapi` 우회로 HTTP mock 위에서 round-trip 검증이 가능해져
  HTTPS 셋업을 v0.4+ 로 미룸. 실 github.com round-trip / Secure cookie attr / HSTS 검증이 필요해질 때 재개.
- **Multi-instance dogfood** — 자동화된 acceptance 는 unit/integration 으로 검증되지만 실제 `docker scale=2`
  로 띄운 운영 환경 dogfood 는 release-time 수동 항목.
- **Keychain dogfood** — Mac/Linux 페어링 후 plain 파일 부재 + OS 재시작 후 자동 재연결 검증은 수동 항목.
- **Redis 장애 retry queue** — 현재 best-effort (publish 실패 시 local fallback). 영구 메시지 큐 / retry 는
  v0.4+.
- **per-project 알림 override UI** — v0.2 N5 known limitation 유지.
- **Team / multi-user 권한 모델** — single-owner 유지.
- **하네스 노드 UI, signed installers, i18n, Tauri Rust tools port** — v0.2 백로그 그대로.

## [v0.2.1] — 2026-05-29

### Fixed

- **prod `docker build` 실패** (PR #110) — N4 에서 api/web 의 의존성으로 추가된
  `@devgarden/harness-core` 와 `@devgarden/harness-templates` 가 source-only 패키지
  (`main` → `./src/index.ts`, 빌드 없음) 라, 앱의 컴파일된 산출물이 런타임에 raw `.ts` 를
  `require` 해서 Docker 이미지 빌드가 깨졌다 (Node 는 node_modules 아래 타입 stripping 거부).
  per-PR CI 는 소스에서 빌드해 통과했고 — nightly `docker build` 만 노출. `@devgarden/shared`
  처럼 **CommonJS dist 로 빌드해서 ship** 하도록 바꾸고 (build script + `main`/`types` → dist +
  `files:[dist,src]` + spec 제외 `tsconfig.build.json`), api/web Dockerfile 과 Tauri
  `prepare:sidecar` 가 의존성을 먼저 빌드하도록 수정. harness-templates 빌드는 yaml 카탈로그를
  `dist/catalog` 로 복사.

## [v0.2.0] — 2026-05-29

### 매일 쓸 만한 수준으로

v0.1 의 "한 번 끝까지 도는 MVP" 를 운영자가 실제로 매일 쓰는 도구로 끌어올렸다. GitHub onboarding 마찰을
두 번 클릭으로 줄이고, 데스크탑 client 가 webview 밖에서 실제로 harness 를 실행하며, run 을 멈추고 다시
돌리고 알림을 받을 수 있다. 7개 마일스톤 (N0~N6).

### Added

- **N0 — 디자인 시스템** — shadcn/ui 본격 도입, light/dark/system 테마 토글 (persist), Skeleton /
  EmptyState 표준 컴포넌트로 대시보드 전반 일관화.
- **N1 — GitHub onboarding 개편** — `/dashboard/onboarding` 에서 **Manifest flow** (GitHub 가 App 자동
  생성 + PEM/secret 발급 → callback → envelope-encrypted DB 저장) 또는 **BYO** (App ID + PEM 직접 입력)
  선택. 사용자 OAuth token 으로 installation 자동 탐색 → `/dashboard/projects/new` 의 repo picker 가
  numeric ID 수동 입력을 대체. legacy env 경로는 deprecation warning 과 함께 유지.
- **N2 — Node sidecar runner** — Tauri Rust 가 번들 Node sidecar 를 spawn (stdio), harness 실행이
  webview 밖으로. repo clone + fs/process/git 도구 + `github.openPR` 를 sidecar 가 수행.
- **N3 — Project workflow** — repo 자동 clone (worktree policy: keep / auto-remove-success/always) +
  clone 상태 추적, project detail 개편, RunPreset 기반 run trigger v2 (저장된 harness+client+inputs).
- **N4 — Harness editor + 템플릿** — web 에서 Monaco YAML 편집 + zod 라이브 검증 + dry-run, 시작 템플릿
  카탈로그, harness 버전 보존 (`(ownerId,name,version)`).
- **N5 — Run controls + 알림** — 진행 중 run **cancel** (api `run:cancel` → sidecar 가 AbortSignal 로
  현재 step 프로세스에 SIGTERM→5s→SIGKILL) + **retry** (실패/취소 run 을 같은 inputs 로 재실행,
  `retryOfRunId` link). 사용자별 알림 설정 (trigger 별 on/off + per-project override) +
  `NotificationService` 가 **web toast** (SSE 실시간) / **Slack** (incoming webhook, encrypted,
  5s timeout·3 retries) / **email** (nodemailer SMTP) 채널로 fan-out. N6 budget 경고도 동일 채널 사용.
- **N6 — Observability 심화** — runs search/filter + pagination, step Gantt timeline, webhook delivery
  대시보드 (payload preview + redeliver), cost/token trend 차트, per-owner 월 budget 한도 + 경고 임계치.

### Changed

- `HarnessRun` 에 `inputs` (retry replay 용) · `retryOfRunId` · `cancelRequestedAt`/`cancelledAt`/
  `cancelReason` 추가. 새 모델: `OwnerBudget`, `UserNotificationSettings`, `Notification`,
  `GithubAppRegistration`, `GithubInstallation`, `RunPreset`.
- 알림 SSE 는 단일 api 프로세스 기준 in-process 스트림 (다중 인스턴스 공유 버스는 v0.3+).

### Stats

- **PR 머지**: 62 (PR #47 ~ #108) — 누적 108
- **테스트**: api 79 unit + 177 integration · client-runner 43 · web 18 unit + 80 e2e · harness-core 32 ·
  harness-templates 10 · llm-adapters 10 · client 22 = **471 cases** (누적)
- **CI**: lint / typecheck / unit / integration / e2e 5 jobs 모두 green + nightly Tauri build smoke

### Known Limitations (v0.3+ 백로그)

- **알림 SSE 다중 인스턴스** — 현재 in-process 스트림이라 api 를 여러 대 띄우면 다른 인스턴스에 붙은
  브라우저는 toast 를 놓친다. Redis pub/sub 등 공유 버스 필요.
- **per-project 알림 override UI** — 모델/서비스는 지원하지만 settings 화면엔 글로벌 trigger 만. grid UI 는 백로그.
- **Tauri Rust 로 tools 전면 재구현** — N2 sidecar 는 코드 재사용 (Node). Rust port 는 v0.3+.
- **하네스 노드 UI (drag-drop)** / 다중 클라이언트 라우팅·큐잉 / 멀티 LLM provider routing / signed installers /
  클라이언트 JWT keychain 저장 / i18n · mobile / team multi-user.

## [v0.1.0] — 2026-05-22

### 첫 self-hosted MVP

운영 가능한 한 사이클 — 로그인 → 프로젝트/하네스/클라이언트 등록 → harness 트리거 → 실시간 로그 streaming →
GitHub issue 자동 미러 → 자동 PR 생성 → 백업/복구 — 이 끝에서 끝까지 동작한다.

### Added

- **모노레포 부트스트랩** — Turborepo + pnpm workspace, GitHub Actions CI (lint · typecheck · unit · integration · e2e).
- **인증** — GitHub OAuth (NextAuth v5) + allow-list, GitHub App installation token (octokit) + 60s margin 캐싱.
- **클라이언트 페어링** — 1회용 토큰 + bcrypt 해시 + JWT (jose HS256, 30일). `apps/client` (Tauri 2) 가 페어링 후 `socket.io-client` 로 30s heartbeat.
- **하네스 코어** — YAML → zod IR (5 step kinds: tool / llm / subagent / condition / loop), safe expression evaluator, `runHarness` 엔진 (onFail stop/continue/retry(N) + hooks).
- **LLM 어댑터** — `openai-compatible` (Ollama / LM Studio / vLLM 호환), `codex-cli` (subprocess JSON envelope).
- **Client tools** — `fs.{read,write,list}`, `process.run` (allow-list + 1MB cap + 60s timeout), `git.{createBranch,commit,push,diff}` (`-c user.name="haesookimDev" -c user.email="ww232330@gmail.com"` 강제 attribution), `github.openPR` (api 가 GithubAppService 로 처리, 클라이언트는 socket ack).
- **End-to-end run dispatch** — `POST /internal/runs` → `RunsGateway` 가 `run:start` emit → client `run-executor` 가 `runHarness` 호출 → 각 step 별 `run:log/step/status` 보고 → DB persist + `run:<id>` room fan-out.
- **실시간 broadcast** — web BFF `/api/runs/[id]/stream` 가 server-side socket.io-client 로 api 의 `/clients` namespace 에 internal-secret 인증 + `subscribe:run` → 브라우저에 SSE forward. RunView 가 EventSource 구독 + 5s polling fallback.
- **GitHub webhook receiver** — `POST /webhooks/github` HMAC SHA-256 검증, `GithubEvent` audit (deliveryId unique → idempotent), `repository.full_name` → projectId 자동 매칭.
- **자동 PR 생성** — harness 의 `github.openPR` 도구 + `HostBridge` 인터페이스 (tool ↔ host ack round-trip 일반화).
- **대시보드** — `/dashboard` (projects + clients), `/dashboard/projects/[id]` (config + 3-stat grid + last-run link), `/dashboard/runs` (cross-project history + 7d stats grid), `/dashboard/runs/new` (project · harness · client picker), `/dashboard/runs/[id]` (steps + logs + live pill), `/dashboard/tasks` (GitHub issues + internal todos 통합 + source filter + 인라인 status 전이).
- **운영 도구** — `infra/backup.sh` / `infra/restore.sh` (pg_dump + gzip + `--keep N` retention), prod compose healthchecks + log rotation + 메모리 limit, api `/healthz/ready` (DB ping), web `/api/healthz`.
- **문서** — `docs/SELF-HOSTING.md` (호스트 요건부터 cron 백업 + troubleshooting + 보안 체크리스트), `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `docs/HARNESS-FORMAT.md` / `docs/SECURITY.md` / `docs/TESTING.md` / `docs/db-schema.md`.

### Stats

- **PR 머지**: 46 (PR #1 ~ #46)
- **테스트**: api unit 41 · web unit 14 · client unit 28 · harness-core 30 · llm-adapters 10 · api integration 53 · web e2e 20 = **196 cases**
- **CI**: lint / typecheck / unit / integration / e2e 5 jobs 모두 green

### Known Limitations (v0.2+ 백로그)

- **데스크탑 클라이언트의 실 harness 실행** — 현재 webview 는 페어링 + socket liveness 만. `run-executor` + tools (fs/process/git) 가 Node API 를 쓰므로 Tauri webview (브라우저 context) 에서 직접 실행 불가. Node sidecar 또는 Tauri Rust commands 로 옮겨야 함.
- **OAuth round-trip e2e** — HTTPS-only 제약으로 mock cookie 주입 방식만 e2e. 실 OAuth dance 검증은 manual.
- **GitHub App 토큰을 client git push 에 사용** — v0.1 client 는 host git 인증 (SSH / PAT). App token 으로 git push 하려면 Contents: Write + 추가 wiring.
- **Signed installers (Mac/Win/Linux)** — Apple / Microsoft 인증서 발급이 환경 의존적이라 백로그.
- **하네스 노드 UI (drag-drop)** / 다중 클라이언트 라우팅 · 큐잉 / 멀티 LLM provider routing / 클라이언트 JWT OS keychain 저장.

[v0.3.1]: https://github.com/haesookimDev/DevGarden-projects-manager/releases/tag/v0.3.1
[v0.3.0]: https://github.com/haesookimDev/DevGarden-projects-manager/releases/tag/v0.3.0
[v0.2.1]: https://github.com/haesookimDev/DevGarden-projects-manager/releases/tag/v0.2.1
[v0.2.0]: https://github.com/haesookimDev/DevGarden-projects-manager/releases/tag/v0.2.0
[v0.1.0]: https://github.com/haesookimDev/DevGarden-projects-manager/releases/tag/v0.1.0
