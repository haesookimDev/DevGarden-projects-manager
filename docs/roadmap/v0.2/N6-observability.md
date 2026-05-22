# N6 — Observability deepening

> v0.1 의 `/dashboard/runs` 는 최근 50 개 + 7 일 stats 그리드만. 운영을 길게 하면 \"왜 이번 주에 비용이
> 폭증했지\", \"어떤 step 에서 가장 오래 걸리지\", \"이 webhook 이 왜 안 들어왔지\" 같은 질문이 늘어난다.
> N6 은 그 질문들에 답할 수 있는 화면들을 추가한다.

## 1. Goal

- **Runs search + filter** — date range / status / project / harness / triggered-by 로 좁히기, URL 기반 share.
- **Step timeline view** — run detail 에서 step 별 Gantt 차트, 병목 한눈에.
- **Webhook delivery dashboard** — GithubEvent audit 을 화면으로 노출, 재전송 trigger.
- **Cost / token usage trends** — 30/90 일 라인 차트, project / harness 별 break-down.
- **Budget alarms** — 사용자 설정 한도 초과 시 N5 의 notification 채널로 alert.

## 2. 결정 사항

| 항목              | 선택                                                                      | 이유                                                |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| 차트 라이브러리   | **Recharts** (React-friendly, SSR-safe)                                   | 가볍고 shadcn 예제 풍부. Tauri webview 호환.        |
| Timeline 시각화   | Recharts 의 Bar (수평) + 자체 hover overlay                               | 라이브러리 추가 회피.                               |
| Search 필터링     | server-side (api 가 query param 받아 prisma where 빌드)                   | 큰 운영 데이터 대비.                                |
| URL share         | search params 인코딩 (project=X&status=FAILED&since=...)                  | 북마크 가능.                                        |
| Webhook 재전송    | `POST /internal/github/events/:id/redeliver` — App JWT 로 GitHub API 호출 | GitHub 의 redelivery API 활용. 별도 storage 불필요. |
| Cost trend window | day 단위 sum, 최대 90 일                                                  | 운영 의미 + DB 부담 사이.                           |
| Budget 한도 모델  | per-owner monthly USD limit, 80% / 100% threshold 에서 alert              | 가장 흔한 사용 패턴.                                |

## 3. 산출물

### 3.1 DB 변경 (소량)

```prisma
model OwnerBudget {
  ownerId         String   @id
  owner           User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  monthlyUsdLimit Decimal? @db.Decimal(10, 2)
  warnAt          Int      @default(80)   // % of limit
  resetDay        Int      @default(1)    // day-of-month
  updatedAt       DateTime @updatedAt
}
```

새 daily aggregate 도 prisma raw query 로 day 별 sum — view 또는 materialized view 도입은 over-engineering.

### 3.2 API

- `GET /internal/runs/search?ownerId=&projectId=&status=&harnessId=&since=&until=&triggeredByUserId=&q=&page=&pageSize=`
- `GET /internal/runs/:id/timeline` — steps 의 `startedAt` / `finishedAt` 만 추출해 Gantt 데이터.
- `GET /internal/github/events?projectId=&type=&since=&pageSize=` — webhook audit listing.
- `POST /internal/github/events/:id/redeliver` — GitHub API `apps.redeliverWebhookDelivery`.
- `GET /internal/stats/cost-trend?ownerId=&days=30` — 일별 cost / token 합.
- `GET / PUT /internal/owner-budget/:ownerId` — budget 설정.
- `BudgetMonitorService` — `RunsService.setStatus(SUCCESS/FAILED)` 시 호출, 한도 초과시 `NotificationService.fanOut('budget-warn'|'budget-exceeded')`.

### 3.3 Web

- `/dashboard/runs` 개편:
  - 좌측 sidebar 에 filter (date range, status, project, harness).
  - 메인 영역에 filter 결과 list (현재 50 개 → pagination).
  - URL share — 필터 state 가 ?params= 로 인코딩.
- `/dashboard/runs/[id]` 의 \"Timeline\" 탭 — 가로 Gantt 차트 (Recharts).
- 새 페이지 `/dashboard/webhooks` — GithubEvent 목록 (project · event type · action · time) + \"Redeliver\" 버튼 + payload preview (JSON).
- 새 페이지 `/dashboard/insights` — cost trend 차트 + project / harness 별 break-down.
- 새 페이지 `/dashboard/settings/budget` — monthly limit + warn threshold + reset day.

### 3.4 트리거

- N5 의 NotificationService 에 budget trigger 추가:
  - `budget-warn` (80%)
  - `budget-exceeded` (100%)

### 3.5 Performance / 인덱스

- `HarnessRun(ownerId via project relation, startedAt)` — search 의 핵심.
- `HarnessRun(harnessId, startedAt)`.
- `GithubEvent(projectId, eventType, receivedAt)` — webhook list 용.
- 필요시 PG `EXPLAIN ANALYZE` 로 검증.

## 4. PR 분할 plan

| #   | 제목                                                          | 핵심                                              |
| --- | ------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `feat(api): runs search endpoint (filter + pagination)`       | `/internal/runs/search` + prisma where 빌더.      |
| 2   | `feat(web): /dashboard/runs filter sidebar + URL state`       | filter UI + page param + share-able URL.          |
| 3   | `feat(api): run timeline endpoint`                            | steps 의 시간 데이터 추출.                        |
| 4   | `feat(web): Timeline tab on run detail (Recharts Gantt)`      | tab + 차트.                                       |
| 5   | `feat(api): webhooks listing + redeliver endpoint`            | GithubEvent listing + redeliver via App JWT.      |
| 6   | `feat(web): /dashboard/webhooks (list + payload + redeliver)` | 화면 + JSON preview.                              |
| 7   | `feat(api): cost trend aggregate endpoint`                    | day 별 sum + project / harness break-down.        |
| 8   | `feat(web): /dashboard/insights (cost line chart)`            | Recharts line + Tabs (project / harness / total). |
| 9   | `feat(api,web): OwnerBudget + alarms`                         | budget CRUD + threshold check + N5 채널로 alert.  |
| 10  | `test: e2e for search + timeline + redeliver + budget alert`  | 6+ cases.                                         |

## 5. 테스트 plan

- **단위**: search query builder (filter 조합), budget threshold detection.
- **통합**: pagination + filter accuracy, GithubEvent redeliver mocked octokit, daily aggregate.
- **e2e**: filter 적용 → URL 변경 + 결과 갱신 / timeline 탭 / webhook redeliver button / budget warn alert.

## 6. 리스크

- **Recharts SSR / hydration** — Next 15 app router 에서 차트는 \`'use client'\` + dynamic import 필요. Recharts SSR 이슈가 있어 client component 안에서만.
- **Search 의 big query** — 운영 데이터가 커지면 timestamp 인덱스 핵심. `(ownerId via project, startedAt)` 인덱스 확인.
- **Webhook redeliver** — GitHub API rate limit. UI 에서 throttle (3 회 연속 redeliver 시 30 s wait).
- **Budget false positive** — Decimal cost 가 floating round 로 약간씩 어긋남 (`Number(decimal)` 변환). 임계점 근처에서 misfire 가능 → 안전 margin 으로 99.5% / 100.5% 같은 가드.

## 7. Acceptance criteria

- [ ] `/dashboard/runs` 에서 status / project / date range 필터 적용 + URL 공유 가능.
- [ ] Run detail 의 Timeline 탭이 step 별 Gantt 를 표시 + 가장 긴 step 강조.
- [ ] `/dashboard/webhooks` 에서 최근 이벤트 + payload + redeliver 동작.
- [ ] `/dashboard/insights` 에서 30 일 cost line + project / harness break-down.
- [ ] Budget 설정 후 한도 80% / 100% 도달 시 N5 채널 (web toast / Slack / email) 로 alert.
- [ ] e2e 6+ cases 통과.
