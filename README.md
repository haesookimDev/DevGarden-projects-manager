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

> 아직 부트스트랩 전. 다음 PR들이 머지되면 동작:
> [PR #1 (monorepo)](docs/ROADMAP.md#m0-모노레포-부트스트랩) → [PR #2 (apps scaffold)](docs/ROADMAP.md#m0-모노레포-부트스트랩) → [PR #3 (docker-compose)](docs/ROADMAP.md#m0-모노레포-부트스트랩)

예상 동작:

```bash
pnpm install
cp .env.example .env       # 값 채우기
docker compose -f infra/docker-compose.dev.yml up -d   # postgres
pnpm dev                   # web + api + client 동시 기동
```

## License

TBD
