# Roadmap & TODO

> v0.1(MVP)을 끝까지 돌아가는 시스템으로 만드는 것이 1차 목표.
> 각 단계는 **하나의 PR**로 구성. 모든 PR은 [`./CONVENTIONS.md`](./CONVENTIONS.md) 절차를 따른다.

---

## M0. 모노레포 부트스트랩

- [ ] **PR #1** `chore: bootstrap monorepo`
  - pnpm workspace + Turborepo 셋업
  - 루트 `package.json`, `pnpm-workspace.yaml`, `turbo.json`
  - `.editorconfig`, `.prettierrc`, `.eslintrc`
  - GitHub Actions: lint + typecheck workflow
  - Verify: `pnpm install && pnpm lint && pnpm typecheck` 통과

- [ ] **PR #2** `chore: scaffold apps and packages`
  - `apps/web` (Next.js create), `apps/api` (Nest CLI), `apps/client` (Tauri init)
  - `packages/shared`, `packages/harness-core`, `packages/llm-adapters`, `packages/ui`
  - Verify: 각 앱 `pnpm dev`로 부트 OK (빈 화면)

- [ ] **PR #3** `chore: docker-compose for dev`
  - `infra/docker-compose.dev.yml` (postgres만)
  - `infra/docker-compose.yml` (web+api+postgres)
  - `.env.example` 등록
  - Verify: `docker compose up postgres` → API에서 연결 성공

## M1. 인증 & 기본 도메인

- [ ] **PR #4** `feat(api): prisma schema and migrations`
  - `apps/api/prisma/schema.prisma` 작성 (docs/db-schema.md 기반)
  - 초기 마이그레이션 생성
  - Vitest + Testcontainers 셋업
  - Verify: `pnpm test:int` 마이그레이션 적용 후 기본 CRUD 테스트 통과

- [ ] **PR #5** `feat(web,api): GitHub OAuth login`
  - Auth.js (NextAuth v5) + GitHub provider
  - api 측 세션 검증 미들웨어
  - allow-list (`OWNER_GITHUB_LOGINS` env) 적용
  - E2E: 로그인 → 대시보드 진입 (Playwright + GitHub OAuth mock)
  - Verify: 로컬에서 실제 GitHub 로그인 1회

- [ ] **PR #6** `feat(api): GitHub App installation + repo listing`
  - GitHub App 생성 가이드 (docs)
  - installation token 발급 로직
  - `/projects` POST: 레포 선택 → DB 저장
  - 단위 + 통합 테스트 (octokit 모킹)
  - Verify: web에서 레포 추가 → 목록에 표시

## M2. 데스크탑 클라이언트 페어링

- [ ] **PR #7** `feat(api,client): pairing flow`
  - api: `/clients/pair` 엔드포인트, 1회용 토큰 발급
  - client: 페어링 UI (토큰 입력 폼)
  - client: JWT 보관 (Tauri secure storage)
  - Vitest + 클라이언트 IPC 모킹
  - Verify: 토큰 입력 → 200 + JWT 저장 확인

- [ ] **PR #8** `feat(api,client): socket.io connect + heartbeat`
  - api Gateway, client 어댑터
  - 방(room) 모델: `client:<id>`, `project:<id>`
  - heartbeat 30s + 끊김 감지
  - Verify: 클라이언트 띄우면 web 대시보드에 online 표시

## M3. 하네스 코어 & 첫 실행

- [ ] **PR #9** `feat(harness-core): YAML parser + IR + zod schema`
  - YAML → IR 변환, 컨텍스트 평가기(jexl 서브셋)
  - 단위 테스트: 모든 step kind, 표현식, 실패 케이스
  - Verify: `vitest` 80%+ 커버리지

- [ ] **PR #10** `feat(llm-adapters): codex-cli + openai-compatible`
  - 공통 인터페이스
  - codex-cli: subprocess 호출
  - openai-compatible: fetch 기반 stream
  - 통합 테스트 (mock 서버)
  - Verify: Ollama에 실제 요청 1회

- [ ] **PR #11** `feat(client): harness runner + git/fs/process tools`
  - 빌트인 도구 구현 (allow-list 강제)
  - worktree 생성/제거
  - 로그를 api로 stream
  - Verify: 샘플 하네스(echo + fs.write) 실행 성공

- [ ] **PR #12** `feat(web,api): run UI + live log stream`
  - web 실행 페이지 (단계별 상태, 라이브 로그)
  - api: `/runs` CRUD + socket 라우팅
  - Playwright E2E: 트리거 → 로그 수신 → 완료 표시
  - Verify: end-to-end 실행 1회 성공

## M4. GitHub 연동 마감 + PR 자동 생성

- [ ] **PR #13** `feat(api): GitHub webhook receiver`
  - `/webhooks/github` HMAC 검증
  - 이슈/PR/푸시 이벤트 → DB + socket broadcast
  - Verify: 실제 push → 대시보드 갱신

- [ ] **PR #14** `feat(client): auto branch → commit → push → PR`
  - 하네스의 git/github 도구 마무리
  - 커밋/PR 시 `-c user.name="haesookimDev" -c user.email="ww232330@gmail.com"` 적용
  - E2E: 가짜 이슈 → 자동 PR 생성 → 웹에서 PR 카드 확인
  - Verify: 실 GitHub 레포에서 1회 성공

## M5. 옵저버빌리티 & 메타데이터

- [ ] **PR #15** `feat(web): project metadata dashboard`
  - 언어/스택/열린 PR/이슈 수 카드
  - 캐시 정책 (5분)

- [ ] **PR #16** `feat(web): runs history + cost/success metrics`
  - 하네스별/프로젝트별/모델별 집계
  - 토큰 비용 단가 설정 UI

- [ ] **PR #17** `feat(web): tasks unified view (issues + internal todos)`
  - 칸반/리스트 토글
  - 내부 TODO CRUD + 하네스 트리거 버튼

## M6. 폴리시 & 출시 준비

- [ ] **PR #18** `chore: production docker-compose + healthcheck + backup script`
- [ ] **PR #19** `docs: setup guide for self-hosting`
- [ ] **PR #20** `chore: client signed installers (Mac/Win/Linux)` (선택)

---

## v0.2+ 백로그

- 하네스 노드 UI (드래그-드롭)
- 다중 클라이언트 라우팅 / 큐잉
- 서브에이전트 마켓플레이스
- 외부 일정 도구 연동 (Linear/Jira/Notion)
- 비용 알람·예산 한도
- 멀티 LLM provider routing (cost/latency 기반)
