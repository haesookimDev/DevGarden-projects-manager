# Conventions

> 개발 규칙. 모든 PR이 이 문서를 따른다.

## 1. 브랜치 전략

- 기본 브랜치: `main` (보호: PR 필수, 리뷰 1+, CI 통과)
- 작업 브랜치 네이밍:
  - `feat/<scope>-<short-desc>` — 신규 기능
  - `fix/<scope>-<short-desc>` — 버그 수정
  - `chore/<scope>-<short-desc>` — 빌드/설정
  - `docs/<scope>-<short-desc>` — 문서
  - `refactor/<scope>-<short-desc>` — 리팩토링
  - `test/<scope>-<short-desc>` — 테스트만
- 한 브랜치 = 한 가지 일. 섞지 않는다.

## 2. 개발 절차 (필수)

모든 작업은 다음 순서를 지킨다.

1. `git checkout -b <branch>`
2. 변경 → 테스트 작성/통과 → 문서 동기화
3. `git -c user.name="haesookimDev" -c user.email="ww232330@gmail.com" commit -m "<type>: <subject>"` (한 PR 안에서도 [§4 분리 원칙](#4-커밋-단위-분리-원칙) 적용)
4. `git push -u origin <branch>`
5. `gh pr create` (자세한 본문 포함 — [§5](#5-pr-본문-반드시-작성))
6. CI/테스트 통과 확인 → `gh pr merge` (자동 머지 — [§6](#6-머지))

## 3. 커밋 메시지

- 간결한 제목 (50자 이내)
- 형식: `type: Subject`
  - type: `feat | fix | docs | style | refactor | test | chore`
  - 동사 원형 (Add/Fix/Update), 마침표 금지
- 본문은 필요할 때만, 72자 줄바꿈

예시:

```
feat: Add harness run streaming
fix: Prevent duplicate worktree dir on retry
docs: Update HARNESS-FORMAT with loop semantics
```

## 4. 커밋 단위 (분리 원칙)

한 PR도 **여러 커밋으로 쪼갠다.** 한 PR에서 변경된 모든 파일을 단일 커밋으로 묶지 않는다.

분리 단위:

- **스캐폴딩**: 신규 파일/디렉토리 생성
- **기능 추가**: 논리적으로 1가지 변경
- **버그 픽스**: 별건이면 별 커밋
- **설정 / 포맷팅**: 자동 도구의 부수 효과(예: Next.js의 tsconfig 재포맷, prettier 일괄 적용)는 별 커밋

각 커밋의 조건:

- 단독으로 빌드/typecheck/lint 통과
- 메시지가 그 커밋의 의도만 정확히 설명
- 작업 도중의 임시 상태는 커밋하지 않음 (rebase로 정리)

**이유**: 머지 후에도 부분 revert · cherry-pick · bisect 가 쉬워야 한다. 한 커밋에 여러 의도가 섞이면 한 가지만 되돌리기 위해 수동 패치를 짜야 한다.

**머지 전략**: GitHub PR 머지 설정은 **Merge commit** 또는 **Rebase and merge** 사용 — `Squash and merge`는 커밋 분리의 이점을 없애므로 피한다.

작은 예 (PR 하나 안에서):

```
chore: Add prisma schema
chore: Add prisma migrate npm scripts
test: Add Testcontainers postgres fixture
feat(api): Wire prisma module into AppModule
docs: Update db-schema.md to match prisma file
```

## 5. PR 본문 (반드시 작성)

```markdown
## Summary

- 변경 요약 2~5줄

## Motivation

- 왜 이 변경이 필요한가 (이슈/스펙 링크)

## Changes

- 파일/모듈 단위 핵심 변경
- 사용자에게 보이는 변화 / 보이지 않는 변화 구분

## Test Plan

- [ ] Vitest unit 추가/통과
- [ ] Playwright E2E (해당 시) 추가/통과
- [ ] 수동 검증 절차

## Docs

- [ ] docs/ 갱신 여부 + 어떤 파일

## Screenshots / Logs

(UI 변경 시 캡처, 비-UI도 명령 출력 일부)

## Risk

- 마이그레이션 / 데이터 영향 / 롤백 방법
```

## 6. 머지

CI(Lint · Typecheck) 와 테스트가 모두 통과한 PR은 **`gh` 커맨드로 즉시 머지**한다. 사용자 확인 불필요.

표준 명령:

```bash
gh pr merge <N> --merge --delete-branch
```

- `--merge`: merge commit 생성. 커밋 분리 정책([§4](#4-커밋-단위-분리-원칙))을 유지하기 위해 **`--squash` 금지**. rebase가 필요하면 `--rebase` 사용.
- `--delete-branch`: 머지된 feature 브랜치 원격에서 삭제.

머지 후 절차:

```bash
git checkout main && git pull origin main
```

### 자동 머지 조건 (모두 만족 시)

- CI(Lint · Typecheck · 신설된 test job) 모두 `pass`
- PR 본문의 Test Plan 체크박스가 모두 ✅
- merge conflict 없음

### 예외 — 사용자 확인이 필요한 경우

- DB schema 파괴적 변경(drop column/table, NOT NULL backfill)
- secret 회전 / 권한·결제 모델 변경
- main 브랜치 보호 규칙에 막힌 경우
- CI 일부 실패 / conflict

위 경우는 머지 보류 후 사용자에게 보고.

## 7. 코드 스타일

- TypeScript strict 모드
- 포매터: Prettier (저장 시 자동), 린터: ESLint (`@typescript-eslint`)
- import 순서: node → 외부 → 내부 패키지(`@devgarden/*`) → 상대 경로
- 함수는 작게: 50줄을 넘으면 분리 검토
- React: 서버/클라이언트 컴포넌트 명시, 클라이언트는 `'use client'` 1줄로 시작

## 8. 테스트 규칙

- **백엔드 기능 추가 시 Vitest 테스트 필수**
- **프론트엔드 기능 추가/변경 시 Playwright E2E 필수**
- 외부 의존(GitHub API, LLM)은 인터페이스로 추상화하고 모킹
- DB 의존 테스트는 Testcontainers PostgreSQL 사용 (CI/로컬 일관)
- 자세한 규칙은 [`./TESTING.md`](./TESTING.md)

## 9. 문서 동기화

- 새 기능/수정 시 **반드시 docs/ 해당 파일 동기화**
- PR에서 docs 변경이 없으면 리뷰어가 이유를 묻는다
- CLAUDE.md/AGENTS.md에는 직접 정보 적지 말고, 항상 `docs/...` 링크로 연결

## 10. 보안

- 비밀(API key, GitHub App private key, OAuth secret)은 `.env`에만, 절대 커밋 금지
- `.env*`, `*.pem`, `secrets/**`는 gitignore에 포함
- 새 시크릿 추가 시 `.env.example`에 키만 등록
