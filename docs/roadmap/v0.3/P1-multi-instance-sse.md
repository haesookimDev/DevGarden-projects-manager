# P1 — Multi-instance SSE + Redis pub/sub

> v0.2 known limitation 의 가장 큰 항목. api 를 여러 인스턴스로 띄울 때 알림 SSE 와 run-event broadcast 가
> 다른 인스턴스의 이벤트를 받지 못한다. Redis pub/sub 으로 fan-out 해서 해소한다.

## 1. Why

v0.2 N5 PR7 의 알림 SSE 는 `NotificationsService` 안의 `private stream$ = new Subject<{userId, notification}>()`
하나로 전체 fan-out. v0.2 N5 release notes 에서 명시:

> 알림 SSE 는 단일 api 프로세스 기준 in-process 스트림 (다중 인스턴스 공유 버스는 v0.3+).

비슷하게 `RunsGateway` 의 `server.to('run:<id>').emit()` 도 socket.io 의 기본 인메모리 adapter 라
인스턴스 간 broadcast 가 안 된다 — 한 인스턴스에 붙은 client 가 emit 한 step/log 가 다른 인스턴스에 붙은
브라우저로 전달 안 됨. v0.2 까지는 단일 인스턴스 가정이라 묻혔지만 실제 production 에서 docker compose
scale=2 또는 로드밸런서 뒤에 두 대 띄우면 즉시 깨진다.

P1 은 **두 경로 모두** 를 Redis 기반 pub/sub 으로 옮긴다.

## 2. What (acceptance)

- [ ] **NotificationsService** 가 Redis 가 설정되면 stream$ 의 `next()` 를 Redis 채널 `dg:notif:<userId>` 에
      publish, `streamFor(userId)` 는 in-process Subject + Redis subscribe 를 merge 한 Observable 반환.
- [ ] **RunsGateway** 가 socket.io `@socket.io/redis-adapter` 로 fan-out — `server.to('run:<id>').emit()`
      가 다른 인스턴스에 붙은 socket 에도 전달.
- [ ] **REDIS_URL 미설정 시** 기존 in-process 동작 그대로 — 회귀 없음. 단일 인스턴스 사용자는 추가 인프라
      필요 없음.
- [ ] `infra/docker-compose.yml` 에 `redis` 서비스 profile (`--profile multi-instance`) 추가. 기본 compose
      는 redis 없이 부팅.
- [ ] `docs/SELF-HOSTING.md` 에 다중 인스턴스 셋업 섹션 추가 (REDIS_URL, scale=2 예시, 검증 절차).
- [ ] 다중 인스턴스 integration test — 같은 Redis 를 가리키는 두 NotificationsService 인스턴스가 한 쪽에서
      `notify()` 호출 시 다른 쪽 `streamFor()` 가 받는 것 검증.

## 3. 결정 사항

| 결정             | 선택                                                                | 근거                                                                            |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pub/sub 백엔드   | **Redis (ioredis)**                                                 | 가장 흔한 selbst-host stack. NATS 는 인프라 추가 부담 + 운영자 학습 곡선.       |
| Redis client     | **ioredis**                                                         | Nest 생태 표준, pub/sub mode 안정적. node-redis (v4) 도 가능하지만 ioredis 채택. |
| Socket.io adapter | **`@socket.io/redis-adapter`** (공식)                              | 직접 publish/subscribe 구현 대신 검증된 어댑터 사용. ack/room/namespace 자동.   |
| 채널 명          | `dg:notif:<userId>` (per-user) + socket.io adapter 의 자체 prefix   | per-user 채널로 fan-out 최소화. socket.io 는 adapter 자체 규칙.                 |
| 미설정 시 동작   | **In-process 만** — REDIS_URL 환경변수 없으면 기존 Subject 그대로   | 단일 인스턴스 사용자에게 회귀 0. opt-in 모델.                                   |
| 메시지 직렬화    | JSON (`JSON.stringify` / `JSON.parse`)                              | NotificationView 가 이미 JSON 친화. binary 필요한 데이터 없음.                  |
| 인증/ACL         | Redis 자체 AUTH (rediss:// + password)                              | Redis 노출은 사용자 책임. 앱에서 추가 권한 분리는 v0.4+.                        |

## 4. PR 분할 plan

| PR    | 한 줄                                                                    | 변경 영역                                                | 테스트                                |
| ----- | ------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------- |
| P1-1  | `chore(api): add ioredis + Redis module foundation`                      | `apps/api/src/redis/` 신규, REDIS_URL env, RedisModule    | 1 unit (connect/disconnect)           |
| P1-2  | `feat(api): NotificationsService Redis publish + subscribe (per-user)`  | `notifications.service.ts`, `streamFor` merge            | 2 integration (publish, no-redis fallback) |
| P1-3  | `feat(api): RunsGateway socket.io Redis adapter`                         | `runs.gateway.ts`, `main.ts` bootstrap adapter           | 1 unit + 1 integration (2-instance broadcast) |
| P1-4  | `chore(infra): docker-compose multi-instance profile`                    | `infra/docker-compose.yml`, README                       | manual smoke                          |
| P1-5  | `docs(self-hosting): multi-instance setup section`                       | `docs/SELF-HOSTING.md`                                   | —                                     |

## 5. 테스트 plan

### 단위
- `RedisModule` factory 가 REDIS_URL 없을 때 null pub/sub 클라이언트 반환, 있을 때 ioredis 인스턴스 반환.
- `NotificationsService.streamFor` 가 in-process + Redis 두 소스를 dedupe 없이 merge — 중복은 없는 설계
  (publish 측에서만 emit, 자기 자신은 subscribe 무시 또는 자기 publish 무시).

### Integration (`apps/api/test/integration/`)
- `notifications-multi-instance.spec.ts` (신규)
  - Testcontainer 로 redis spin up
  - 두 NestJS app context 띄우고 같은 REDIS_URL 주입
  - app1.notify(userId, event) 호출 시 app2.streamFor(userId) 가 받는 것 확인
- `notifications.spec.ts` (수정)
  - 기존 케이스에 "no REDIS_URL → in-process 동작" 추가.

### E2E
- 추가 e2e 는 cost 대비 가치 낮음 (인프라 셋업 복잡). dogfood 수동 검증 항목으로 둠.

## 6. 리스크 / 미해결

- **자기 자신 publish 의 echo** — A 인스턴스가 publish 하면 자기 subscribe 도 받음. NotificationsService 는
  in-process Subject.next() 와 Redis publish 를 둘 다 호출하므로 자기 인스턴스 브라우저에는 두 번 emit 될 위험.
  → 해법: publish 만 하고 subscribe handler 에서 stream$.next() 호출. 즉 `notify()` 는 항상 Redis 경유,
  REDIS_URL 없으면 in-process Subject 만 사용. **둘 다 호출하지 않는다**.
- **Redis 장애 시 graceful degrade** — ioredis 가 재연결 동안 publish 실패. 알림은 best-effort 라
  catch + log + 계속 진행. retry 큐는 v0.4+.
- **socket.io adapter 가 namespace 경계 처리** — `/clients` namespace 도 같이 fan-out 되어야 함. 어댑터는
  namespace 인식하므로 기본 동작 OK, 통합 테스트로 검증.
- **테스트 환경 Redis** — Testcontainer 띄우는 비용 (CI 시간). 기존 testcontainers postgres 와 같이 동작
  확인.

## 7. 의존성 / 영향

- 다른 마일스톤과 독립. P4 (metrics) 와 결합되면 Redis pub/sub 메트릭 (publish rate, subscribe count) 가
  의미 있어짐 — 순서 가이드에서 P1 먼저 → P4 metrics 가 P1 결과를 활용.

## 8. 완료 정의

- [ ] PR P1-1 ~ P1-5 모두 머지.
- [ ] CI green + 신규 integration test green.
- [ ] dogfood: `docker compose --profile multi-instance up -d --scale api=2` 후 한 쪽 인스턴스 트리거 →
      양쪽 브라우저가 toast 받음.
- [ ] `docs/SELF-HOSTING.md` 다중 인스턴스 섹션 머지.
