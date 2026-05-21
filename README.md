# DevGarden — Projects Manager

다량의 사이드/메인 프로젝트를 한 곳에서 관리하고, **로컬 PC의 에이전트(Codex CLI · 로컬 LLM)** 를 웹에서 원격으로 제어하는 self-hosted 개발 운영 플랫폼.

## What is this

- **Project hub**: GitHub 레포 여러 개의 브랜치·이슈·PR·메타데이터를 한 화면에서 관리
- **Web-to-local bridge**: 웹에서 "이 이슈 작업해줘" → 본인 PC에 설치된 데스크탑 클라이언트가 받아서 실제 코드 작업 수행
- **Pluggable LLMs**: Codex CLI, Ollama, LM Studio, vLLM, llama.cpp 등 OpenAI 호환 백엔드 어느 것이든 사용
- **Harness**: 에이전트 실행 파이프라인 + 행동 규칙을 YAML로 정의 → 로컬 LLM의 한계 보완

## Stack

- Web: Next.js 15 + React + TS + Tailwind + shadcn/ui
- API: NestJS + Prisma + PostgreSQL + Socket.io
- Client: Tauri 2 + React
- Test: Vitest + Playwright
- Mono: Turborepo + pnpm

자세한 결정 근거는 [docs/SPEC.md](docs/SPEC.md).
현재 진행 상황은 [docs/ROADMAP.md](docs/ROADMAP.md) (Progress snapshot 섹션).

## Status (2026-05-21)

| 영역                                   | 상태       |
| -------------------------------------- | ---------- |
| 모노레포 부트스트랩                    | ✅         |
| 인증 (OAuth + GitHub App + Projects)   | ✅         |
| 클라이언트 페어링 + Socket.io          | ✅         |
| Harness YAML/IR + 실행 엔진            | ✅         |
| LLM 어댑터 (openai-compatible/codex)   | ✅         |
| Client tools (fs/process/git)          | ✅         |
| Runs CRUD + 대시보드 페이지            | ✅         |
| End-to-end harness 실행 wiring         | ✅         |
| Web run trigger 페이지                 | ✅         |
| Run 실시간 socket broadcast (SSE)      | ✅         |
| GitHub webhook receiver (HMAC + audit) | ✅         |
| **자동 PR 생성 (auto branch/commit)**  | 🟡 진행 중 |

테스트 누적: **155 cases** (api unit 29 · web unit 14 · client unit 24 · harness-core 30 · llm-adapters 10 · api integration 36 · web e2e 12).

## Docs

|                                                  |                                  |
| ------------------------------------------------ | -------------------------------- |
| [docs/SPEC.md](docs/SPEC.md)                     | 프로젝트 스펙 (Why · What · How) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | 컴포넌트·통신·시퀀스             |
| [docs/ROADMAP.md](docs/ROADMAP.md)               | MVP PR 단위 작업 목록            |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md)       | 코드/PR/테스트 규칙              |
| [docs/HARNESS-FORMAT.md](docs/HARNESS-FORMAT.md) | 하네스 YAML 스키마               |
| [docs/TESTING.md](docs/TESTING.md)               | 테스트 정책                      |
| [docs/SECURITY.md](docs/SECURITY.md)             | 보안/시크릿 관리                 |
| [docs/db-schema.md](docs/db-schema.md)           | DB 모델                          |

## Quick start (개발)

요구사항: Node 22+, pnpm 9+, Docker Desktop, Rust 1.77+ (client).

```bash
pnpm install
cp .env.example .env                                   # 최소값(POSTGRES_*)만 채워도 dev 가능
docker compose -f infra/docker-compose.dev.yml up -d   # postgres
pnpm dev                                               # web(3000) + api(3001) + client(1420)
```

## Production (self-hosted)

`.env`의 모든 값을 채운 뒤:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

> 현재 prod 이미지는 unoptimized scaffold. [PR #18](docs/ROADMAP.md#m6-폴리시--출시-준비)에서 multi-stage 최적화·헬스체크 강화·백업 스크립트가 추가된다.

## License

TBD
