# DevGarden v0.2 — Roadmap

> v0.1 은 "self-hosted 으로 한 번 끝까지 돌아가는 MVP" 였다. v0.2 는 그 사이클을 **운영자가 실제로 매일 쓸 만한
> 수준** 으로 끌어올린다. 핵심 키워드는 두 개 — _onboarding 마찰 제거_ 와 _데스크탑 client 의 실효성_.

> 본 문서는 큰 그림. 각 마일스톤의 세부 계획 / PR 분할 / 테스트 plan 은 같은 폴더의 개별 `Nx-*.md`.

## 1. 비전

v0.1 dogfood 에서 가장 큰 두 마찰:

1. **GitHub App 수동 등록** — 사용자가 GitHub 페이지에서 App 생성 → permission 클릭 → install → 페이지 별로
   값을 옮겨와 `.env` 에 붙여넣기 → installation ID 까지 따로 찾기. 한 번에 7~8 단계.
2. **데스크탑 client 가 webview-only 라 harness 실행 불가** — 페어링은 되지만 그게 끝. 실 코드 작업은 못 시킴.

v0.2 가 끝나면:

- 사용자는 "Continue with GitHub" → "Install App" 두 번 클릭으로 GitHub 측 설정이 끝난다.
- 등록된 installation 의 repo 목록이 그대로 picker 에 뜨고, 클릭하면 project 가 만들어진다.
- 클라이언트가 실제로 harness 를 실행해서 fs/process/git 을 하고 PR 까지 연다.
- 운영자가 매일 보는 화면 (대시보드 / runs / tasks) 이 일관된 디자인으로 다듬어져 있다.

## 2. 결정 사항 (이 로드맵의 전제)

| 결정          | 선택                                          | 영향                                                                       |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| GitHub 자동화 | **Manifest flow (기본) + BYO App (fallback)** | N1 — 새 onboarding 페이지 + 두 path 모두 코드.                             |
| Client runner | **Node sidecar 프로세스**                     | N2 — Rust 가 Node 를 spawn, IPC 는 stdio JSON-RPC. tools 재사용.           |
| UI 우선순위   | **디자인 + 기능 병행**                        | N0 (디자인 시스템) 을 분리해서 모든 후속 트랙이 공통 컴포넌트 위에서 작업. |
| 릴리즈 범위   | **Broad — 7 마일스톤**                        | v0.2.0 까지 약 2.5 개월 추정 (참고용, 일정 강제 아님).                     |

## 3. 마일스톤 한눈에

| #   | 마일스톤                                                       | 한 줄 요약                                                             | 의존성        | 상태                                |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- | ----------------------------------- |
| N0  | [Design system foundation](./N0-design-system.md)              | shadcn/ui 본격 도입, 테마 / skeleton / empty-state 표준화              | —             | ✅ 완료 (PR #49–#55, 2026-05-22~26) |
| N1  | [GitHub onboarding overhaul](./N1-github-onboarding.md)        | Manifest flow + BYO + 자동 installation 탐색 + repo picker             | N0 (컴포넌트) | ✅ 완료 (PR #57–#64, 2026-05-26~27) |
| N2  | [Node sidecar runner](./N2-node-sidecar-runner.md)             | Tauri Rust 가 Node sidecar 를 spawn, harness 실행 webview 밖으로       | —             | ✅ 완료 (PR #66–#73, 2026-05-27)    |
| N3  | [Project workflow polish](./N3-project-workflow.md)            | Repo 자동 clone + worktree 옵션 + project detail 개편 + run trigger v2 | N1, N2        | ✅ 완료 (PR #74–#80, 2026-05-27)    |
| N4  | [Harness editor + templates](./N4-harness-editor.md)           | Web 에서 YAML 편집 + zod 라이브 검증 + 시작 템플릿 카탈로그            | N0            | ✅ 완료 (PR #81–#89, 2026-05-28)    |
| N5  | [Run controls + notifications](./N5-controls-notifications.md) | Run cancel · retry · notification (web toast / Slack / email)          | N2 (cancel)   | ▶ 다음 (N2 의 cancel IPC 추가 필요) |
| N6  | [Observability deepening](./N6-observability.md)               | Run search/filter, step gantt, webhook delivery dashboard, cost trends | N0            | ✅ 완료 (PR #90–#99, 2026-05-28)    |

> N0~N4 + N6 ✅ 완료. 마지막 남은 트랙은 N5 (run controls + notifications) — N2 의 per-run cancel IPC 가
> 우선 (현재 stop_sidecar 는 전체 종료라 per-run cancel 이 아님). N6 PR9 의 budget alarm 은 N5 의
> NotificationService 가 `BUDGET_NOTIFIER` 를 바인딩하면 실제 채널로 발송된다 (지금은 로그만).

## 4. Cross-cutting 원칙

v0.1 dogfood 에서 배운 것들 — v0.2 작업에 일관 적용:

- **공개 호스트 / 로컬 호스트 path 를 동시에 안내**. localhost 가 못 쓰는 GitHub feature 마다 tunnel / 비활성 대안을 문서화.
- **명시적 에러 메시지** — `Invalid keyData` 같은 deep stack trace 보다는 \"PEM 이 PEM 형식이 아님\" 같이 actionable.
- **docs 와 코드 same-PR sync** — v0.1 의 dogfood PR 들이 documentation gap 을 메우는 데 절반쯤 들었다. v0.2 는 처음부터 같이 쓴다.
- **CI 가 prod build path 도 검증** — 단순 unit/integration 뿐 아니라 \`docker build\` + \`tauri build\` 도 CI 에서 (적어도 PR 마다는 아니어도 nightly).
- **자동 머지 정책 유지** — CI 통과 시 `gh pr merge --merge --delete-branch`.

## 5. Out of scope (v0.3+ 로 미룸)

- **Tauri Rust commands 로 tools 전면 재구현** — N2 의 sidecar 는 코드 재사용으로 시간 단축이 목적. Rust port 는 보안/성능 needs 가 명확해지면 v0.3+.
- **하네스 노드 UI (drag & drop)** — N4 는 YAML editor 만. 노드 UI 는 v0.3+.
- **다중 클라이언트 라우팅 / 큐잉** — 한 호스트에 client 여러 대 페어링 자체는 v0.1 부터 가능하지만, run dispatch 가 client 별 큐를 보는 routing 은 v0.3+.
- **Signed installers (Mac / Win / Linux)** — cert 발급이 환경 의존적. v0.3+.
- **멀티 LLM provider routing (cost/latency 기반)** — provider 자체는 있지만 동적 routing 은 v0.3+.
- **i18n / mobile responsive** — v0.3+.
- **Team / multi-user setup** — 현재는 single-owner 자체 호스트. multi-user 권한 모델 도입은 v0.3+.

## 6. Success criteria

다음 모두 충족하면 v0.2.0 릴리즈:

- [ ] N0~N6 마일스톤의 각 acceptance 항목 완료.
- [ ] `docs/SELF-HOSTING.md` 가 manifest flow 기준으로 재작성됨.
- [ ] dogfood: 새 호스트에서 GitHub 만 있는 상태에서 \"continue with GitHub\" → install → repo 선택 → harness 실행 → PR 까지 30 분 안에 도달 가능.
- [ ] CI 5 jobs 모두 green, 누적 테스트 ≥ 280 cases.
- [ ] `CHANGELOG.md` v0.2.0 entry 작성 + GitHub Release.

## 7. 작업 순서 가이드

엄격한 순서는 아니지만 의존성 + 가치 우선:

1. **N0 (design system)** 먼저 — 모든 UI 작업의 기반. 1~2 주.
2. **N2 (Node sidecar)** 병행 시작 — UI 와 독립. 작업 큼.
3. **N1 (GitHub onboarding)** N0 충분히 진행되면 — 가시적 가치 큼.
4. **N3 (project workflow)** N1 + N2 이후.
5. **N4 (harness editor)** 와 **N6 (observability)** N0 위에서 병행.
6. **N5 (controls + notifications)** N2 의 cancel IPC 확정 후.

## 8. 트랙별 진행 보드

각 마일스톤의 PR 단위 작업은 개별 `Nx-*.md` 의 \"PR 분할 plan\" 참조. 진행 상태는 본 README 의 §3 표와
`docs/ROADMAP.md` 의 Progress snapshot 양쪽에 동기화.
