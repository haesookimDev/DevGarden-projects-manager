# N5 — Run controls + notifications

> v0.1 의 run 은 \"한 번 발사하면 끝까지 진행\" — 멈출 방법이 없고, 실패해도 사용자가 직접 대시보드를 봐야
> 알았다. v0.2 는 cancel · retry · 알림으로 run lifecycle 을 실사용 수준으로 끌어올린다.

## 1. Goal

- Run cancel — 진행 중 run 을 web 에서 한 번 클릭으로 정지 (sidecar 가 process kill).
- Run retry — 실패 / cancelled run 의 inputs 을 그대로 재실행.
- Notification 채널 — 사용자별 settings:
  - **Web toast** (필수, 무설정) — 로그인 중 다른 탭에서 run 완료 / 실패 시 토스트.
  - **Slack webhook** (선택) — incoming webhook URL.
  - **Email** (선택) — 단순 SMTP relay.
- Notification trigger: SUCCESS / FAILED / CANCELLED 각각 on/off, per-project override.

## 2. 결정 사항

| 항목                  | 선택                                                                        | 이유                                                      |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Cancel 메커니즘       | api 가 `run:cancel` socket 이벤트 emit → sidecar 가 현재 step process kill  | N2 의 sidecar IPC 와 자연스럽게 결합.                     |
| Step process kill     | child_process 의 PID 그룹에 SIGTERM → 5 s 뒤 SIGKILL                        | 이미 process tool 이 PID 추적 중. 추가 wiring 작음.       |
| Cancel 가능 시점      | status === RUNNING 만. QUEUED 도 가능 (그냥 status flip).                   | 직관적.                                                   |
| Retry 동작            | 새 HarnessRun 행 생성 (`retryOfRunId` 로 원본 link) + 같은 inputs + harness | history 보존.                                             |
| Notification settings | `UserNotificationSettings` model — channels + triggers JSON                 | 사용자별, 채널은 enum 으로 확장.                          |
| Email 전송            | nodemailer 로 SMTP relay (사용자가 SMTP 서버 지정)                          | self-hosted 환경에서 SMTP 가 가장 공통. 외부 의존성 회피. |
| Slack 전송            | incoming webhook URL POST                                                   | 가장 단순한 Slack 통합.                                   |
| 토스트 라이브러리     | shadcn/ui 의 `Toast` (N0 에서 도입)                                         | 새 의존성 없음.                                           |

## 3. 산출물

### 3.1 DB schema

```prisma
model HarnessRun {
  // 기존 + 새 필드
  retryOfRunId   String?
  retryOfRun     HarnessRun? @relation(\"RunRetry\", fields: [retryOfRunId], references: [id])
  retries        HarnessRun[] @relation(\"RunRetry\")
  cancelledAt    DateTime?
  cancelReason   String?
}

model UserNotificationSettings {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  webToast        Boolean  @default(true)
  slackWebhookUrl Bytes?   // envelope-encrypted
  emailEnabled    Boolean  @default(false)
  emailAddress    String?
  triggers        Json     @default(\"{ \\\"success\\\": false, \\\"failed\\\": true, \\\"cancelled\\\": false }\")
  perProject      Json     @default(\"{}\")     // { projectId: { success/failed/cancelled overrides } }
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// SMTP / Slack 설정은 시스템 wide
// SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM env vars
```

### 3.2 API

- `POST /internal/runs/:id/cancel` — runs.gateway 가 `run:cancel` emit 후 `cancelRequestedAt` 마킹.
- `POST /internal/runs/:id/retry` — 새 row 생성 + dispatch.
- `GET /internal/users/:id/notification-settings`, `PUT /internal/users/:id/notification-settings`.
- `NotificationService.fanOut(runId, status)` — 사용자 설정 보고 web toast / slack / email 모두 발송.
- 기존 `setStatus(SUCCESS|FAILED|CANCELLED)` 호출 시점에 fanOut 자동 호출.

### 3.3 Sidecar

- `run:cancel` 이벤트 수신:
  - 진행 중인 step 의 child_process group 에 SIGTERM → 5 s 뒤 SIGKILL.
  - 다음 step 으로 안 넘어가도록 runner state machine 에 cancel flag.
  - api 에 `run:status { status: 'CANCELLED', reason: '...' }` 보고.

### 3.4 Web

- Run detail 페이지:
  - status === RUNNING 일 때 우상단 \"Cancel\" 버튼.
  - terminal 상태일 때 \"Retry\" 버튼 (FAILED / CANCELLED 만).
- 새 페이지 `/dashboard/settings/notifications` — channels 토글 + triggers + per-project override grid.
- 토스트 wiring — global `<Toaster>` 가 SSE 의 `run:status` 이벤트를 감시, 사용자 설정 따라 표시.
- Settings 페이지에 \"Send test notification\" 버튼.

### 3.5 NotificationService 채널

- `WebToastChannel` — DB 에 `Notification` row 만 남기고 SSE 로 push. 클라이언트가 토스트.
- `SlackWebhookChannel` — JSON body POST + 5 s timeout + 3 retries.
- `EmailChannel` — nodemailer + SMTP env. 첨부 없음, plain text + link.

## 4. PR 분할 plan

| #   | 제목                                                           | 핵심                                            |
| --- | -------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `feat(api): Cancel + retry endpoints with retryOfRunId model`  | 마이그레이션 + endpoints + status flip.         |
| 2   | `feat(client-runner): Handle run:cancel by killing step procs` | child_process kill + state machine cancel flag. |
| 3   | `feat(api): UserNotificationSettings + NotificationService`    | 모델 + 채널 dispatch 골격 (WebToast 만 먼저).   |
| 4   | `feat(web): /dashboard/settings/notifications`                 | settings UI + test button.                      |
| 5   | `feat(api): Slack webhook channel`                             | POST + retries + per-trigger config.            |
| 6   | `feat(api): Email channel (nodemailer SMTP)`                   | SMTP env + helper + per-trigger config.         |
| 7   | `feat(web): Toast on run status changes via SSE`               | global Toaster + SSE 감시.                      |
| 8   | `feat(web): Cancel / Retry buttons on run detail`              | 두 버튼 + 확인 dialog.                          |
| 9   | `test: e2e + integration for cancel + notification settings`   | 5-6 cases.                                      |

## 5. 테스트 plan

- **단위**: notification fanout (어떤 채널이 어떤 trigger 에 호출되는지), retry input cloning.
- **통합**: cancel endpoint → status flip + cancelRequestedAt 마킹. Slack mock server 에 POST 도착 확인. SMTP 는 fake transport 로 sent envelope 검증.
- **e2e**: settings 페이지에서 web toast 켜고 \"send test\" → 토스트 등장. cancel button click → 확인 dialog → status badge 가 CANCELLED 로.
- **Sidecar smoke**: 진짜로 `sleep 60` 실행 중에 cancel → 5 s 안에 종료.

## 6. 리스크

- **Cancel race condition** — 마지막 step 이 거의 끝났는데 cancel 도착 → cancel 무시하고 그냥 완료 처리? UI 에 \"cancel requested but already finished\" 메시지.
- **SMTP 자격증명** — self-hosted 라 사용자가 SMTP 정보 입력. settings 페이지에 SMTP test send 도 같이 (system admin 만 가능).
- **Notification spam** — 빠르게 여러 run 이 끝나면 alert 폭주. settings 에 \"batch interval\" (5 min coalesce) 추가 가능 — v0.2 는 단순 fanout 만, batching 은 v0.3+.
- **Slack URL 노출** — webhook URL 도 envelope-encrypted. UI 에서는 last 6 chars 만 마스킹 표시.

## 7. Acceptance criteria

- [ ] RUNNING run 을 web 에서 cancel → 5 s 안에 CANCELLED status 로 전이 + sidecar 의 step process 가 정상 kill 됨.
- [ ] FAILED / CANCELLED run 에서 \"Retry\" 클릭 → 같은 inputs / harness 로 새 run 생성, retryOf link 표시.
- [ ] Settings 페이지에서 web toast / Slack / email 채널 on/off + trigger 별 toggle 가능.
- [ ] \"Send test\" 버튼이 각 채널로 실제 발송.
- [ ] 다른 탭에 로그인 중일 때 run 이 FAILED 로 끝나면 토스트가 뜬다.
- [ ] e2e 5+ cases 통과.
