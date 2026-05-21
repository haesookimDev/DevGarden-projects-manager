# DevGarden — Projects Manager Spec (v0.1)

> 다량의 사이드/메인 프로젝트를 한 곳에서 관리하고, **로컬 PC의 에이전트(코덱스 CLI · 로컬 LLM)** 를 웹에서 원격으로 제어하는 self-hosted 개발 운영 플랫폼.

---

## 1. 목적 (Why)

- 여러 프로젝트의 GitHub 활동(이슈/PR/브랜치) 가시성을 한곳에서 확보
- 웹에서 "이 이슈 작업해줘" 같은 요청을 트리거하면, **로컬 PC의 에이전트가 실제 코드 작업**을 수행
- 코덱스 CLI / 로컬 LLM(Ollama/LM Studio/vLLM 등) 어떤 백엔드라도 같은 UI에서 제어
- 작은 단위(서브에이전트 + 하네스 규칙)로 쪼개 실행해서, **로컬 LLM의 한계를 극복하고 품질 확보**

## 2. 사용자 시나리오 (Who · What)

### 2.1 페르소나
- **개인 개발자(주 사용자)**: 본인 + 동료 1~3명. self-hosted 환경에서 사용
- 모든 사용자는 GitHub 계정 보유

### 2.2 핵심 사용자 플로우
1. **온보딩**: 관리자가 인스턴스 구동 → GitHub OAuth App + GitHub App 설치 → 사용자 allow-list 등록
2. **프로젝트 등록**: 웹에서 "프로젝트 추가" → GitHub 레포 선택 → 어떤 클라이언트 PC에 매핑할지 지정
3. **클라이언트 페어링**: 데스크탑 클라이언트(Tauri)를 본인 PC에 설치 → 페어링 토큰 입력 → WebSocket 연결 유지
4. **태스크 트리거**: 웹 이슈 페이지에서 "에이전트에 위임" → 하네스 선택 → 로컬 PC에서 워크트리 생성 후 작업 시작
5. **실시간 관찰**: 웹 화면에 로그/diff/툴콜이 스트림으로 표시
6. **결과 검토**: 작업 끝나면 자동 커밋·푸시·PR 생성 → 웹에서 리뷰

---

## 3. 시스템 아키텍처 (How)

### 3.1 컴포넌트 개요

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                          │
│  - 대시보드 / 프로젝트 / 이슈·PR / 하네스 / 실행 로그       │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS / Socket.io (browser ↔ api)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  API Server (NestJS)                                        │
│  - Auth (GitHub OAuth)                                      │
│  - GitHub App 연동 / Webhook 수신                           │
│  - 프로젝트·하네스·실행 이력 CRUD                           │
│  - 클라이언트 레지스트리 + 메시지 라우팅                    │
│  - Socket.io 서버 (browser ↔ api ↔ client)                  │
└─────────┬───────────────────────────┬───────────────────────┘
          │                           │
          ▼                           ▼
┌──────────────────┐         ┌──────────────────────────────┐
│  PostgreSQL      │         │  Socket.io (outbound)        │
│  (Prisma)        │         │  ▼                           │
└──────────────────┘         │  Desktop Client (Tauri)      │
                             │  - Codex CLI 어댑터          │
                             │  - OpenAI 호환 어댑터        │
                             │  - 하네스 러너               │
                             │  - git/worktree 매니저       │
                             │  - 서브에이전트 실행기       │
                             └──────────────────────────────┘
```

### 3.2 통신 모델

- **Browser ↔ API**: HTTPS REST + Socket.io
- **Client ↔ API**: Socket.io (client가 api에 아웃바운드로 연결 후 대기). NAT/방화벽 무관
- **GitHub Webhook → API**: 푸시·PR·이슈 이벤트 수신 → DB 갱신 → 구독 중인 브라우저로 push

### 3.3 멀티 클라이언트 라우팅

- 한 사용자가 여러 PC(노트북·데스크탑·홈서버)에 클라이언트 설치 가능
- 프로젝트별로 "기본 클라이언트" 지정
- 실행 시 클라이언트 ID로 라우팅. 오프라인이면 큐잉(MVP 이후 옵션) 또는 즉시 실패

---

## 4. 도메인 모델 (요약)

```
User              (id, githubId, login, email, role)
Project           (id, ownerId, githubRepoId, defaultClientId, defaultHarnessId)
Client            (id, ownerId, name, lastSeenAt, status, version)
ClientPairing     (id, clientId, pairingTokenHash, expiresAt)
Harness           (id, ownerId, name, version, definition: JSON)
HarnessRun        (id, harnessId, projectId, clientId, triggeredBy,
                   status, startedAt, finishedAt, cost, tokenUsage, branchName)
RunStep           (id, runId, stepIndex, type, input, output, durationMs)
RunLog            (id, runId, ts, level, source, message)
LlmProvider       (id, ownerId, kind: 'openai-compatible'|'codex-cli',
                   baseUrl, defaultModel, credentialRef)
TodoItem          (id, projectId, title, status, sourceType: 'github'|'internal',
                   sourceRef)
```

세부 스키마는 [`./db-schema.md`](./db-schema.md)에서 관리.

---

## 5. 핵심 기능 명세

### 5.1 GitHub 연동
- **로그인**: OAuth App. 스코프 `read:user user:email`
- **레포 접근**: 별도의 GitHub App을 사용자/조직 단위로 설치 → installation token 사용
- **읽기**: 레포 메타, 브랜치 목록, 이슈, PR, 워크플로우 상태
- **쓰기**: 이슈 코멘트, 이슈 생성, PR 생성, PR 코멘트
- **Webhook**: `push`, `pull_request`, `issues`, `issue_comment`, `workflow_run`
- **Rate limit 대응**: GitHub App installation token 사용 (15,000 req/h/installation)

### 5.2 데스크탑 클라이언트
- **페어링**: 웹에서 발급한 1회용 토큰(만료 10분) 입력 → JWT(장기) 교환
- **상태**: heartbeat 30초 간격
- **노출하는 능력(capabilities)**:
  - `git`: 워크트리 추가/제거, 브랜치 생성, 커밋, 푸시
  - `fs`: 허용된 디렉토리 내 read/write
  - `process`: 코덱스 CLI 등 등록된 명령만 실행 (allow-list)
  - `llm.openai-compatible`: 등록된 baseUrl로 chat completion 프록시
- **보안**: 모든 fs/process 접근은 사용자가 등록한 "프로젝트 루트 디렉토리" 하위로 강제. 그 외 경로 차단

### 5.3 하네스 (Harness)
하네스 = **에이전트 실행 파이프라인(템플릿) + 행동 규칙** 의 결합.

#### 5.3.1 정의 형식 (MVP: YAML, v2: 노드 UI)
```yaml
name: "fix-issue-from-github"
version: 1
inputs:
  - { name: issueNumber, type: number, required: true }
defaults:
  llm: { provider: "ollama-local", model: "qwen2.5-coder:14b" }
rules:
  permissions:
    fs:   { allow: ["**"], deny: [".env*", "**/secrets/**"] }
    process: { allow: ["git", "pnpm", "npm", "node", "python", "pytest", "vitest"] }
  policies:
    - "한 번에 하나의 파일만 수정"
    - "테스트가 빨간색이면 더 이상 진행하지 않고 중단"
    - "커밋은 50자 이내 제목"
  hooks:
    preCommit:  "pnpm test --run"
    prePush:    "pnpm lint"
steps:
  - id: read-issue
    type: tool
    use: github.getIssue
    with: { number: "${inputs.issueNumber}" }

  - id: plan
    type: llm
    prompt: |
      이슈 본문을 읽고 변경 계획을 단계별로 작성하라.
      ${steps.read-issue.body}

  - id: implement
    type: subagent
    agent: "code-writer"
    input: "${steps.plan.output}"
    loopUntil: "tests.pass == true"
    maxIterations: 5

  - id: open-pr
    type: tool
    use: github.openPullRequest
    with:
      branch: "${run.branchName}"
      title:  "fix: ${steps.read-issue.title}"
      body:   "${steps.plan.output}"
```

#### 5.3.2 실행 모델
- 각 step은 `tool` / `llm` / `subagent` / `condition` / `loop` 5종
- 컨텍스트: `${inputs.*}`, `${steps.<id>.*}`, `${run.*}`, `${project.*}`
- 실패 정책: step 단위 `onFail: stop | continue | retry(n)`
- 모든 step의 입력·출력은 DB(`RunStep`)에 저장 → 재현·디버깅·비용 추적

### 5.4 서브에이전트 (Subagents)
- 큰 작업을 작은 책임으로 쪼개 호출 (코드 작성 / 테스트 작성 / 리뷰 / 커밋 메시지 생성 등)
- 로컬 LLM은 컨텍스트·추론력이 약하므로, "작은 입출력으로 좁힌 호출"이 품질 확보의 핵심
- 빌트인 서브에이전트 (MVP):
  - `code-writer`: 단일 파일/함수 수정
  - `test-writer`: 변경된 함수에 대한 테스트 작성
  - `reviewer`: diff를 읽고 risk score / 개선점 제시
  - `commit-message`: staged diff → conventional-style 메시지
- 사용자 정의 서브에이전트도 하네스와 같은 YAML 포맷으로 등록 가능

### 5.5 워크트리 관리
- 기본은 조회 (브랜치/상태/파일 트리)
- 하네스 실행 시: `git worktree add ../<repo>-<runId> -b <branchName>` 자동
- 실행 종료 후 정책: `keep` / `auto-remove(success)` / `auto-remove(always)` 중 선택

### 5.6 LLM 프로바이더
- 추상 인터페이스: `chat({ model, messages, tools, stream }) → stream`
- 빌트인 어댑터:
  - `codex-cli`: 코덱스 CLI subprocess 호출
  - `openai-compatible`: baseUrl + apiKey → Ollama, LM Studio, vLLM, llama.cpp(서버 모드), OpenAI/Anthropic-compatible-proxy 등 모두 지원
- 사용자별 멀티 프로바이더 등록 가능, 하네스/스텝 단위로 선택

### 5.7 실행 관찰 (Observability)
- 라이브 로그 (Socket.io stream): timestamp · level · source(step/tool/llm) · message
- 메트릭: 토큰 사용량, 소요 시간, 성공/실패, 비용(LLM provider 단가 설정 가능)
- 후행 분석: 프로젝트별/하네스별/모델별 성공률 대시보드

### 5.8 태스크/티켓 통합 뷰
- GitHub Issues + 내부 TODO(`TodoItem`)를 한 칼럼에서 칸반/리스트로 보기
- 내부 TODO도 하네스 트리거 대상이 될 수 있음 (예: "리팩토링 메모 → 위임")

### 5.9 프로젝트 메타데이터 대시보드
- 한눈에: 언어/주요 스택(GitHub languages API), 마지막 커밋, 열린 PR 수, 열린 이슈 수, 진행중 하네스 수
- 필터·검색·태그

---

## 6. 비기능 요구사항

### 6.1 보안
- 모든 API: JWT (Auth.js 세션) + CSRF 토큰
- 클라이언트 토큰: per-client JWT, 만료 30일, 회전 가능
- GitHub App private key: 서버 환경변수 (or 마운트된 시크릿)
- LLM API 키: DB에 envelope encryption (server key로 AES-GCM)
- 클라이언트 fs/process: allow-list 강제, 절대경로 정규화 후 prefix 검사

### 6.2 성능
- API 응답 p95 < 300ms (GitHub 프록시 제외)
- 로그 스트림 latency < 500ms (LAN)
- 동시 실행 하네스 ≥ 10 / 사용자

### 6.3 가용성·운영
- self-hosted Docker Compose (web + api + postgres) 단일 명령 기동
- 백업: `pg_dump` 스크립트 + 가이드 문서
- 마이그레이션: Prisma migrate, 시작 시 자동 적용 옵션
- 헬스체크: `/healthz` 엔드포인트

---

## 7. 기술 스택 (확정)

| 영역 | 선택 | 근거 |
|---|---|---|
| 프론트 | Next.js 15 (App Router) + React + TS + Tailwind + shadcn/ui | 보편성·생태계·UI 키트 |
| 백엔드 | NestJS + TypeScript | 모듈러 구조·DI·WebSocket 통합 |
| DB | PostgreSQL 16 + Prisma | 관계형·트랜잭션·JSON 컬럼 |
| 실시간 | Socket.io | NAT 통과·재연결·방 기능 |
| 데스크탑 | Tauri 2 + React | 경량·보안 모델·크로스플랫폼 |
| 인증 | Auth.js (NextAuth v5) + GitHub OAuth + GitHub App | 사용자/레포 권한 분리 |
| 테스트 | Vitest (단위·통합) + Playwright (E2E) | 속도·DX |
| 모노레포 | Turborepo + pnpm workspace | 캐시·태스크 파이프 |
| 배포 | Docker Compose (서버) + Tauri 설치파일 (클라) | self-hosted 표준 |

---

## 8. 모노레포 레이아웃

```
DevGarden-projects-manager/
├─ apps/
│  ├─ web/          # Next.js (App Router)
│  ├─ api/          # NestJS
│  └─ client/       # Tauri + React
├─ packages/
│  ├─ shared/       # 공통 타입 (zod 스키마, 도메인 enum)
│  ├─ harness-core/ # 하네스 정의 파서·실행 엔진(공용)
│  ├─ llm-adapters/ # codex-cli, openai-compatible 어댑터
│  └─ ui/           # shadcn 기반 공유 컴포넌트
├─ docs/
│  ├─ SPEC.md
│  ├─ ARCHITECTURE.md
│  ├─ CONVENTIONS.md
│  ├─ HARNESS-FORMAT.md
│  ├─ SECURITY.md
│  ├─ TESTING.md
│  ├─ ROADMAP.md
│  └─ db-schema.md
├─ infra/
│  ├─ docker-compose.yml
│  └─ docker-compose.dev.yml
├─ .gitignore
├─ CLAUDE.md          # gitignored
├─ AGENTS.md          # gitignored
├─ README.md
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

---

## 9. MVP 범위 (v0.1 = "돌아가는 최소")

**포함**
- GitHub OAuth 로그인 + GitHub App 1회 설치
- 프로젝트 등록 (레포 선택, 클라이언트 매핑)
- 데스크탑 클라이언트 페어링 (1대)
- 이슈/PR 조회 + 코멘트
- 단일 하네스 (YAML 파일 등록) — 노드 UI 없이
- 코덱스 CLI 어댑터 + Ollama(OpenAI 호환) 어댑터 1종
- 실행 로그 라이브 스트림
- 자동 브랜치 생성 → 커밋 → 푸시 → PR
- 실행 이력·토큰·성공률 기본 지표

**v0.2 이후로 미룸**
- 하네스 노드 UI (드래그-드롭)
- 다중 클라이언트 라우팅 / 큐잉
- 외부 일정 도구(Linear/Jira/Notion) 연동
- 사용자 정의 서브에이전트 마켓플레이스
- 비용 알람·예산 한도

---

## 10. 열린 결정사항 (TBD — 개발 중 결정)

- `harness-core` 패키지를 client에서만 실행할지, server에도 두고 dry-run을 제공할지
- LLM 응답 JSON 강제(grammar/json-mode) 적용 범위
- 하네스 YAML vs JSON: 1차는 YAML, 저장/실행은 정규화된 JSON으로
- 실행 도중 사용자 인터럽트(중단·일시정지·수동 step) UX 디테일
- 코덱스 CLI 외 다른 CLI 에이전트(예: `claude code`, `aider`, `gemini-cli`) 어댑터 우선순위
