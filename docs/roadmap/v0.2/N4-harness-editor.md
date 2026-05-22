# N4 — Harness editor + templates

> v0.1 까지는 사용자가 harness 를 만들려면 DB 에 직접 row 를 넣거나 별도 도구로 YAML 을 작성하고 api 에 POST
> 해야 했다. v0.2 는 웹에서 YAML 을 편집하고 zod 라이브 검증으로 저장, 그리고 시작 템플릿 카탈로그를 제공한다.

> 노드 UI (drag & drop) 는 v0.3+ 백로그. v0.2 는 코드 친화적인 YAML editor 가 목표.

## 1. Goal

- `/dashboard/harnesses` 페이지 — 소유자별 harness 목록 + 새로 만들기.
- `/dashboard/harnesses/[id]` — Monaco / CodeMirror 기반 YAML editor + 우측 panel 에 zod schema 라이브 검증 + 미리보기.
- `/dashboard/harnesses/new?template=<id>` — 템플릿 카탈로그에서 시작.
- 템플릿 셋: `auto-fix-issue`, `pr-review`, `test-runner`, `dependency-upgrade`, `release-notes`.
- Harness version 보존 — save 시 `version` 자동 증가. project 의 default harness 는 \"latest\" 또는 특정 version pin.

## 2. 결정 사항

| 항목                | 선택                                                                                        | 이유                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 에디터 라이브러리   | **Monaco** (`@monaco-editor/react`)                                                         | VS Code 같은 키맵 → 개발자 친화. YAML 문법 색칠 OOTB.       |
| 검증 시점           | onChange (debounced 200 ms) → zod 결과 우측 panel 표시                                      | 즉시 피드백.                                                |
| Version 정책        | 모든 save 가 새 version row 생성 (immutable history)                                        | Run 이 특정 harness version 으로 실행됐다는 기록 보존 필요. |
| 템플릿 ship 방식    | `packages/harness-templates/` 새 패키지 — yaml 파일 + 메타                                  | 코드와 함께 버전 관리, 향후 community 컨트리뷰션 path.      |
| 미리보기 방식       | dryRun — fake LLM + fake tools 로 step 트리만 evaluate                                      | 실 사이드이펙트 없이 \"이 harness 가 어떻게 흐르나\" 확인.  |
| Default version pin | project 의 `defaultHarnessId` 가 \"latest\" 따라가게 + 옵션으로 `defaultHarnessVersion` pin | 안정성 vs 자동 업데이트 트레이드오프 사용자가 선택.         |

## 3. 산출물

### 3.1 DB schema 변경

기존 `Harness` 가 이미 `version Int @default(1)` + `@@unique([ownerId, name])`. v0.2 는 같은 name 의 새 version 을 저장하면 새 row 생성하도록 유니크 제약 변경:

```prisma
model Harness {
  // 기존 필드 유지
  // 변경: @@unique([ownerId, name]) → @@unique([ownerId, name, version])
}

model Project {
  // 새 필드
  defaultHarnessVersion Int?  // null 이면 latest follow
}
```

### 3.2 API

- `GET /internal/harnesses?ownerId=&name=&latest=true` — 기본 `latest=true` 는 name 별 최신 version 만.
- `GET /internal/harnesses/:id` — 그대로.
- `POST /internal/harnesses` — name 이 같으면 자동 version+1 (기존 endpoint 동작 수정).
- `POST /internal/harnesses/:id/dry-run` — fake llm/tools/host bridge 로 `runHarness` 실행, step 트리 + 예상 동작 반환.
- `GET /internal/harness-templates` — `packages/harness-templates/` 의 카탈로그 반환.

### 3.3 Web

- 새 페이지들:
  - `/dashboard/harnesses` — 목록 (name 별 latest version 만 표시 + history toggle).
  - `/dashboard/harnesses/new` — 빈 editor 또는 `?template=...` 로 시작.
  - `/dashboard/harnesses/[id]` — editor + version history sidebar + dry-run 패널.
- 컴포넌트:
  - `HarnessEditor` — Monaco wrapper, zod 검증 결과 우측 표시, save 단축키.
  - `DryRunPanel` — 클릭 시 dry-run + 결과 step 트리 시각화 (tree view).
  - `TemplateCatalog` — `/dashboard/harnesses/new?template=...` 의 그리드.
- 라이브러리: `@monaco-editor/react` + `js-yaml` (이미 의존성).

### 3.4 새 패키지 `packages/harness-templates/`

```
packages/harness-templates/
├── package.json
├── src/
│   ├── index.ts            # catalog metadata export
│   └── catalog/
│       ├── auto-fix-issue.yaml
│       ├── pr-review.yaml
│       ├── test-runner.yaml
│       ├── dependency-upgrade.yaml
│       └── release-notes.yaml
└── tsconfig.json
```

각 yaml 위에 frontmatter-style 주석 (`# title: ... # description: ... # tags: ...`) 으로 메타.

### 3.5 Project 와 연동

- Project detail 의 \"Default harness preview\" 를 정적 step 트리로 → 새 dry-run 결과로 교체.
- `defaultHarnessVersion` 설정 UI (project settings 페이지).

## 4. PR 분할 plan

| #   | 제목                                                           | 핵심                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `chore(workspace): Add packages/harness-templates with 5 yaml` | 새 패키지 + 5 개 템플릿 + index export.           |
| 2   | `feat(api): Versioned harness create + listByName latest`      | 유니크 제약 변경 + endpoint behavior.             |
| 3   | `feat(api): Harness dry-run endpoint`                          | fake llm + fake tools 로 `runHarness` 호출.       |
| 4   | `feat(api): harness-templates catalog endpoint`                | `packages/harness-templates` 노출.                |
| 5   | `feat(web): /dashboard/harnesses list + history`               | name 별 latest + version history.                 |
| 6   | `feat(web): Harness editor (Monaco + zod live + save)`         | 새 페이지 + save flow.                            |
| 7   | `feat(web): DryRunPanel + template start UI`                   | dry-run trigger + 결과 시각화 + template catalog. |
| 8   | `feat(web): Project default harness version pinning`           | settings UI.                                      |
| 9   | `test: e2e for editor save / template start / dry-run`         | 5-6 cases.                                        |

## 5. 테스트 plan

- **단위**: yaml frontmatter parser, version increment logic, dry-run fake-dispatch.
- **통합**: versioned create (같은 name 두 번 → 두 version), dry-run + zod 에러 응답.
- **e2e**: 템플릿 선택 → 편집 → save (v1) → 다시 편집 → save (v2) → history 에 v1 + v2 모두 표시. Dry-run 결과 시각화.

## 6. 리스크

- **Monaco 번들 크기** — `~ 2 MB` gzipped. Dynamic import + `editor-only` chunk 로 split.
- **YAML schema 자동완성** — Monaco 의 YAML language server 가 zod schema 를 모름. 초기엔 syntax highlight + zod validation only. 자동완성은 v0.3+.
- **Versioned create 의 backward compat** — 기존 Harness 가 v1 로 잘 잡혀야 함. 마이그레이션 시 모든 row 의 `version` 이 1 이라 충돌 없음.
- **Dry-run 의 정확성** — fake llm 응답이 늘 같아서 실제 LLM 분기 행동을 못 봄. \"미리보기\" 임을 UI 에 명시.

## 7. Acceptance criteria

- [ ] `/dashboard/harnesses` 에서 새 harness 를 처음부터 또는 템플릿으로 만들 수 있다.
- [ ] YAML 입력 중 zod 에러가 우측에 inline 으로 표시 + save 가 disabled.
- [ ] 같은 name 으로 save 가 새 version row 를 만든다 (history 에 v1, v2, ... 표시).
- [ ] Dry-run 이 step 트리 + 예상 결과를 보여준다.
- [ ] 5 개 템플릿이 catalog 에 있고 각각 클릭 시 새 harness 시작 가능.
- [ ] Project 의 default harness 가 \"latest\" 또는 특정 version pin 설정 가능.
- [ ] e2e 6+ cases 통과.
