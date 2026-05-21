# Architecture

> 컴포넌트, 통신 흐름, 핵심 시퀀스를 정리한다. spec은 [`./SPEC.md`](./SPEC.md) 참조.

## 1. 컴포넌트 책임

### `apps/web` (Next.js)

- 사용자 UI만 담당. 비즈니스 로직 최소화
- API 서버 호출은 `apps/api`의 REST + Socket.io 사용
- Next.js Route Handler는 OAuth 콜백·웹훅 프록시 등 최소 용도로만 사용

### `apps/api` (NestJS)

- 인증, 권한, 데이터 영속화, 외부 시스템(GitHub) 호출
- Socket.io 게이트웨이로 web 클라이언트와 desktop 클라이언트를 모두 연결
- 메시지 라우팅: `web → api → client` / `client → api → web`

### `apps/client` (Tauri)

- Rust 코어: 파일/프로세스/네트워크 접근의 최종 게이트 (보안 경계)
- React UI: 페어링·상태·로그 미니뷰
- 노출하는 능력은 capability 토큰으로 게이팅

### `packages/harness-core`

- 하네스 정의 파싱(zod 스키마) → IR(intermediate representation)
- 실행기: step 트래버스, 컨텍스트 바인딩, 정책 적용
- LLM·도구 호출은 인터페이스로 추상화 → 클라이언트가 주입

### `packages/llm-adapters`

- 인터페이스: `LLMProvider.chat()`, `LLMProvider.complete()`, `LLMProvider.embed()`
- 구현: `codex-cli`, `openai-compatible`

---

## 2. 통신 흐름

### 2.1 사용자 → 에이전트 실행 (해피 패스)

```
Browser            API                  Client                   GitHub
  │                 │                     │                         │
  │  POST /runs ──▶│                     │                         │
  │                 │  emit "run:start" ─▶│                         │
  │                 │                     │  git worktree add        │
  │                 │                     │  start harness loop      │
  │ ◀── 201 created │                     │                         │
  │                 │ ◀── emit "log" ─────│                         │
  │ ◀── socket "log"│                     │                         │
  │                 │                     │  llm.chat()             │
  │                 │                     │  tool.fs.write()        │
  │                 │                     │  process.run("pnpm test")│
  │                 │                     │  git commit/push ──────▶│
  │                 │                     │  github.openPR ─────────▶│
  │                 │ ◀── emit "run:done" │                         │
  │ ◀── socket "done"                     │                         │
```

### 2.2 GitHub Webhook

```
GitHub → POST /webhooks/github (HMAC 검증)
       → DB 업데이트 (이슈/PR/푸시 캐시)
       → Socket.io 방 "project:<id>"에 broadcast
```

### 2.2.1 OAuth 로그인 + User upsert (PR #5)

```
Browser ──▶ /signin                          (web)
        ──▶ NextAuth → GitHub OAuth dance
        ◀── signIn callback (web server)
            - allow-list 검사 (OWNER_GITHUB_LOGINS)
            - POST /internal/users/upsert ──▶ api
                    (header: x-internal-secret)
            - api: UsersService.upsertByGithub(prisma)
            - 200 응답 시 NextAuth JWT 세션 발급
        ──▶ /dashboard
```

- 브라우저는 `api`를 직접 호출하지 않는다(MVP). 모든 mutating 호출은 web 서버를 거쳐 `/internal/*` 로 들어간다.
- `INTERNAL_API_SECRET` 은 web ↔ api 만 알아야 한다. 브라우저로 노출되면 안 됨 (server-only env).
- 사용자 측 JWT(NextAuth 세션 쿠키)의 api 직접 검증은 차후 PR에서 추가.

### 2.3 클라이언트 페어링

```
1. 웹: "클라이언트 추가" → API가 1회용 토큰(10분) 발급
2. 데스크탑 클라이언트: 토큰 입력 → /clients/pair (HTTPS)
3. API: 검증 후 장기 JWT + clientId 반환
4. 클라이언트: JWT로 Socket.io 연결 + 30s heartbeat
```

---

## 3. 데이터 흐름

- 실행 중 발생하는 모든 `RunStep` 입출력은 **API가 저장 책임**
  (client는 step 결과를 API에 PUT, API가 DB에 기록 후 web에 push)
- 로그는 두 갈래: (a) Socket.io 실시간 전달, (b) 배치로 DB에 일괄 INSERT(1초 간격)
- 큰 페이로드(diff, 빌드 로그 5KB+)는 별도 blob 테이블(`RunArtifact`)에 저장

---

## 4. 보안 경계

| 경계          | 검증                                              |
| ------------- | ------------------------------------------------- |
| Browser → API | Auth.js 세션, CSRF, rate limit                    |
| Client → API  | per-client JWT, IP 기록, capability 토큰          |
| API → GitHub  | App installation token, HMAC 웹훅                 |
| Client 내부   | fs/process allow-list, 경로 정규화 후 prefix 검사 |
| LLM key 저장  | AES-GCM envelope encryption                       |

자세한 위협 모델은 [`./SECURITY.md`](./SECURITY.md).

---

## 5. 확장 포인트

- **LLM 어댑터**: `packages/llm-adapters/src/<name>/index.ts` 추가
- **Step 타입**: `harness-core`의 `StepKind` enum + 핸들러 등록
- **CLI 에이전트**: `process` 어댑터에 새 명령 등록 + 매니페스트
- **Webhook 이벤트**: `apps/api/src/webhooks/github/handlers/` 핸들러 추가
