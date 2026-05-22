# N3 — Project workflow polish

> N1 의 repo picker + N2 의 sidecar 가 있다면 \"새 프로젝트 한 번 등록 → 즉시 harness 실행\" 까지가 거의
> 끊기지 않게 흐른다. N3 은 그 흐름의 빈 칸을 메운다 — 자동 clone, worktree 옵션, project detail 개편,
> run trigger v2.

## 1. Goal

- Repo picker 에서 선택한 repo 를 client 가 자동 clone (sidecar 또는 Tauri Rust command).
- 같은 repo 의 여러 작업을 동시에 굴리기 위한 `git worktree` 기반 옵션 (선택).
- Project detail 페이지를 \"이 프로젝트로 무엇을 할 수 있나\" 가 한눈에 보이는 dashboard 로 개편.
- Run trigger v2 — 자주 쓰는 조합을 \"preset\" 으로 저장, default harness 자동 적용.

## 2. 결정 사항

| 항목                   | 선택                                                                                               | 이유                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Clone 실행 위치        | Node sidecar 의 `client:cloneProject` IPC (N2 의존)                                                | tools/git 와 같은 곳에 두는 게 일관.   |
| Worktree 모델          | Optional — project create 시 \"Use git worktrees\" 체크박스 (기본 off)                             | 모든 사용자가 worktree 를 원하지 않음. |
| Clone path 정책        | 기본 `~/devgarden-workspaces/<owner>-<repo>` 자동 제안 + 사용자 변경 가능                          | 충돌 회피 + 발견성 ↑.                  |
| Project detail 개편    | 4-column grid: \"Quick actions\" / \"Recent runs\" / \"Open issues\" / \"Default harness preview\" | 한 화면에서 다음 액션 결정 가능.       |
| Run preset             | `RunPreset` 신규 prisma model — project 별 0~N 개, name + harness + client + inputs                | 자주 쓰는 조합 저장.                   |
| Default harness/client | project 별 1 개씩 — preset 의 \"default\" 와 동일.                                                 | UI 단순화.                             |

## 3. 산출물

### 3.1 DB schema

```prisma
model Project {
  // 기존 필드 유지
  defaultHarnessId    String?
  defaultClientId     String?
  worktreePolicy      WorktreePolicy @default(AUTO_REMOVE_SUCCESS)
  // 새 필드
  cloneStatus         CloneStatus    @default(NOT_CLONED)
  cloneCompletedAt    DateTime?
}

enum CloneStatus { NOT_CLONED  CLONING  READY  FAILED }

model RunPreset {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String
  harnessId   String
  harness     Harness  @relation(fields: [harnessId], references: [id], onDelete: Restrict)
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Restrict)
  inputs      Json     @default(\"{}\")
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@unique([projectId, name])
  @@index([projectId])
}
```

### 3.2 API

- `POST /internal/projects` 가 (옵션) `cloneOnCreate: boolean` 받음 → sidecar 가 있는 client 가 자동 clone.
- `POST /internal/projects/:id/clone-status` — sidecar 가 status 보고.
- `POST /internal/runs/preset/:presetId` — preset 기반 run trigger.
- `GET /internal/projects/:id/issues?limit=10` — installation token 으로 GitHub issues 가져오기 (open 한정).
- 기존 `getDetail` 응답에 `cloneStatus`, `presets[]`, `recentIssues[]` 추가.

### 3.3 Sidecar (`apps/client-runner/`)

- 새 IPC handler: `cloneProject({ repoFullName, installationId, targetPath, useWorktrees })`:
  - installation token 발급 (api 에 요청) → `https://x-access-token:<token>@github.com/<owner>/<repo>.git` 으로 clone
  - `useWorktrees` 인 경우 bare repo + branch 별 worktree dir 구조 생성
  - api 의 `/internal/projects/:id/clone-status` 로 진행 상황 보고

### 3.4 Web

- `/dashboard/onboarding` 의 마지막 step → 자동 clone 진행 표시 + 완료 후 project detail 로 이동.
- `/dashboard/projects/[id]` 개편:
  - Quick actions: \"Run default preset\", \"Open editor\", \"Open GitHub repo\".
  - Recent runs (5) — 클릭 시 detail.
  - Open issues (10) — 각 issue 에 \"Run as task\" 버튼 (자동으로 issue 컨텍스트 inject 한 run trigger).
  - Default harness preview — 처음 몇 step 요약.
- 새 페이지 `/dashboard/projects/[id]/presets` — preset CRUD.
- 새 페이지 `/dashboard/projects/[id]/clone-status` — clone 진행 상황 (sidebar 에 미니 표시도).

### 3.5 Tauri client (webview)

- Clone 진행 중에는 \"Cloning N% ...\" 알림.
- 완료 후 OS notification (`@tauri-apps/plugin-notification`).

## 4. PR 분할 plan

| #   | 제목                                                              | 핵심                                                              |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `feat(api): RunPreset + Project.cloneStatus model + migration`    | DB 모델, CRUD service.                                            |
| 2   | `feat(client-runner): cloneProject IPC handler + status reports`  | git clone over HTTPS with installation token, optional worktrees. |
| 3   | `feat(api): clone-status webhook + presets endpoints`             | sidecar 가 부르는 endpoint + preset CRUD.                         |
| 4   | `feat(web): Repo picker → cloneOnCreate option + status UI`       | onboarding 마지막 step 의 progress.                               |
| 5   | `feat(web): Project detail v2 (quick actions + issues + presets)` | 4-column dashboard.                                               |
| 6   | `feat(web): Run preset CRUD page`                                 | `/dashboard/projects/[id]/presets`.                               |
| 7   | `test: e2e for clone flow + preset trigger`                       | 4-5 cases.                                                        |

## 5. 테스트 plan

- **단위**: preset service, clone status state machine.
- **통합**: clone webhook → DB 업데이트, preset → run dispatch.
- **e2e**: 새 repo 등록 → clone 자동 진행 → 완료 → preset 등록 → run 1 회 실행 완료 → detail 페이지에 표시.
- **Sidecar smoke**: 작은 public repo (e.g. `octocat/Hello-World`) 를 install token 으로 clone 성공.

## 6. 리스크

- **Clone path 충돌** — 이미 있는 경로면 fail-fast + 사용자에게 다른 경로 제안.
- **Worktree 옵션 복잡도** — bare repo + worktree dir 두 개를 관리해야 함. 초기엔 off 기본값으로 위험 최소화.
- **Issue 가 많은 repo** — `recentIssues` 가 GitHub rate limit 부담. 5 분 캐시.
- **Install token 으로 clone over HTTPS** — token expiry 가 1 시간. clone 중에 expire 되면 재발급 retry.

## 7. Acceptance criteria

- [ ] Repo picker 에서 선택 → \"Clone & register\" 클릭 → sidecar 가 자동 clone → 완료 후 project detail.
- [ ] Project detail v2: quick actions / recent runs / open issues / harness preview 4 영역.
- [ ] Run preset 저장 + 한 클릭으로 trigger 가능.
- [ ] Worktree 옵션: 켜면 같은 repo 의 두 branch 작업이 격리됨 (수동 검증).
- [ ] Clone path 자동 제안 + 충돌시 명시적 에러.
- [ ] e2e: onboarding → repo 선택 → clone → preset → run 한 흐름이 통과.
