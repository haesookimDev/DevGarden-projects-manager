# Changelog

본 프로젝트의 모든 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 형식을
느슨하게 따르며 — semver 적용. 자세한 PR 단위 작업 이력은 [`docs/ROADMAP.md`](docs/ROADMAP.md).

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

[v0.1.0]: https://github.com/haesookimDev/DevGarden-projects-manager/releases/tag/v0.1.0
