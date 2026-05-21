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

### 2.2.2 프로젝트 등록 (PR #6 / api 측)

```
Browser ──▶ web (BFF)            ──▶ POST /internal/projects        (api)
            (NextAuth session으로                 (x-internal-secret 헤더)
             user 식별)                          - ProjectsService.createFromGithub
                                                 - GithubAppService.installationOctokit(installationId)
                                                 - octokit.repos.get(owner, repo)  ──▶ GitHub
                                                 - prisma.project.create
                                                 - 409 if (ownerId, githubRepoId) duplicate
            ◀── 201 { id, repoFullName, githubRepoId }
```

- GitHub App credentials는 `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` env. `GithubAppService` 가 installation token을 60s margin으로 캐싱
- web UI: `/dashboard` 에 프로젝트 목록 + `/dashboard/projects/new` 폼 (server action으로 web→api 호출). 자동 picker 는 OAuth user token 활용 PR 에서 추가.

### 2.3 클라이언트 페어링

```
1. Browser ──▶ web (BFF) ──▶ POST /internal/clients/pairings   (api, internal secret)
                              { ownerId, clientName }
                              - ClientsService.issuePairingToken
                                - crypto.randomBytes(32) → base64url
                                - bcrypt 해시 + 10분 만료로 ClientPairing row 생성
                              ◀── 201 { token, expiresAt }
   web 사용자에게 token 표시 (한 번만)

2. Desktop client ──▶ POST /clients/pair                       (api, no internal secret)
                       { token, hostname?, os?, version? }
                       - ClientsService.consumePairingToken
                         - 모든 unconsumed/unexpired pairing에 대해 bcrypt.compare
                         - 일치 시 consumedAt = now, Client row 생성
                         - ClientJwtService.sign({ clientId, ownerId })  → HS256, 30일
                         - jwtTokenHash(bcrypt) 보관
                       ◀── 200 { clientId, jwt, name }

3. 클라이언트는 jwt를 secure storage에 저장 후 Socket.io 연결 (Socket 단계는 다음 PR)
```

- 사용자 발급 JWT: AUTH_SECRET 공유. payload: sub=clientId, ownerId. issuer=devgarden-api, audience=devgarden-client.
- pairing token: 1회용. bcrypt 해시만 저장하므로 server 침해 시에도 plaintext 누설 없음.
- web UI: `/dashboard/clients/new` 폼이 React 19 `useActionState` 로 발급 결과를 페이지 내에서 표시 (URL 에 토큰 노출 X). 토큰은 1회 표시되며 사용자가 복사해 Tauri client 에 입력.
- Tauri client UI (`apps/client/src/App.tsx`): API base URL + 토큰 입력 → `POST /clients/pair` → `tauri-plugin-store` 가 `pairing.json` 에 JWT 영속화. 다음 실행 시 자동 load. unpair 버튼으로 삭제 가능. 현재는 plain JSON store; 향후 OS keychain (`tauri-plugin-stronghold` 또는 `keyring` crate) 으로 전환 예정.

### 2.4 클라이언트 실시간 연결 (Socket.io)

페어링이 끝난 클라이언트는 socket.io 로 api 에 상시 연결되어 상태/명령/로그를 주고받는다.

```
Desktop client ──▶ wss://api/clients  (namespace)
                   auth.token = <pairing JWT>
                   - ClientsGateway.handleConnection
                     - ClientJwtService.verify (Bearer or auth.token)
                     - socket.join('client:<id>')
                     - Client.status = ONLINE, lastSeenAt = now
                   ◀── 연결 유지
   주기적으로 emit 'heartbeat'
                   - ClientsGateway.onHeartbeat
                     - lastSeenAt 갱신, status 유지
                   ◀── ack { ok: true, ts }
   연결 종료
                   - ClientsGateway.handleDisconnect
                     - Client.status = OFFLINE
```

- 네임스페이스 `/clients` 는 데스크탑 클라이언트 전용. 향후 `project:<id>` room 으로 broadcast 추가 예정 (`run:*` 이벤트).
- 클라이언트 측 (`apps/client/src/lib/client-socket.ts`): `startClientSocket()` 가 `socket.io-client` 로 `/clients` 에 connect (auth.token = pairing JWT), reconnection 자동 (2s ~ 30s backoff), connect 시 `HEARTBEAT_INTERVAL_MS = 30_000` 주기로 `heartbeat` emit. `useClientSocket` React hook 이 paired 상태 변경에 따라 자동 연결/해제.
- web 대시보드의 실시간 클라이언트 상태 표시는 또 다음 PR.

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
- **GitHub API 도메인**: `apps/api/src/github/` 에 새 도메인 service 추가 (issues, PRs, runs 등). `GithubAppService.installationOctokit()` 으로 installation-scope octokit 획득.
