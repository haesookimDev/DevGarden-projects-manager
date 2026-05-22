# N0 — Design system foundation

> 모든 후속 트랙이 일관된 컴포넌트 위에서 작업하도록 디자인 시스템을 먼저 깐다. v0.1 의 ad-hoc tailwind 스타일을
> shadcn/ui 기반으로 정리하고, 테마 / 빈 상태 / 로딩 / 에러 boundary 같은 표준 패턴을 도입한다.

## 1. Goal

- shadcn/ui 본격 도입 — Button / Input / Select / Card / Dialog / Toast / Tabs / Badge / Skeleton 등 자주 쓰는 primitive 합의.
- light / dark / system 테마 토글 — `next-themes` 도입.
- 모든 페이지에 일관된 empty / loading / error 상태.
- `apps/web` + Tauri client UI 양쪽이 공통 컴포넌트 패턴 (가능한 한 `packages/ui` 재활용).

## 2. 결정 사항

| 항목                     | 선택                                                              | 이유                                                           |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| 컴포넌트 라이브러리      | **shadcn/ui** (Radix primitives + tailwind)                       | 이미 README stack 에 명시. 코드 ownership 유지 (npm dep 아님). |
| 테마 라이브러리          | **next-themes**                                                   | Next 15 app router + SSR-safe. shadcn 가이드와 결합.           |
| 아이콘                   | **lucide-react**                                                  | shadcn 기본. tree-shaking 우수.                                |
| Tauri client 의 컴포넌트 | `packages/ui` 에서 _server-component-free_ primitive 만 re-export | webview 는 client-side 만, Next 의존성 회피.                   |
| 디자인 토큰              | Tailwind theme + CSS variables (light/dark/system)                | shadcn 표준.                                                   |
| 폰트                     | system stack 유지 (`-apple-system, ...`)                          | 외부 폰트 의존 회피.                                           |

## 3. 산출물

### 3.1 패키지 정리

- `packages/ui/src/` 를 비우고 shadcn primitive 들 generate:
  ```
  button.tsx · input.tsx · select.tsx · textarea.tsx · card.tsx
  dialog.tsx · sheet.tsx · tabs.tsx · badge.tsx · skeleton.tsx
  toast.tsx · toaster.tsx · use-toast.ts · dropdown-menu.tsx
  separator.tsx · scroll-area.tsx · tooltip.tsx
  ```
- `packages/ui/src/lib/cn.ts` — `clsx` + `tailwind-merge` helper.
- `packages/ui/tailwind.preset.ts` — color / radius / animation 토큰. apps/web · apps/client 가 모두 extends.

### 3.2 apps/web 적용

- `next-themes` `ThemeProvider` 를 root layout 에 wrap.
- 상단 nav 에 `Theme toggle` (system / light / dark).
- 기존 페이지의 raw `<button>` / `<input>` / `<select>` 를 `<Button>` / `<Input>` / `<Select>` 로 교체.
- 모든 list 페이지에 표준 패턴 적용:
  - **Empty state**: `<EmptyState icon={...} title={...} description={...} action={...} />`
  - **Loading**: `<Skeleton />` 으로 카드 형태.
  - **Error boundary**: `error.tsx` per route + 표준 `<ErrorState />`.

### 3.3 apps/client 적용

- 페어링 화면 / status 화면 / 향후 sidecar 상태 표시 — 같은 primitive 재사용.
- `packages/ui` 의 client-safe export 만 사용.

### 3.4 e2e 테스트

- Theme toggle 동작 (system → dark → light).
- Empty state · error boundary 트리거 시 렌더 검증.

## 4. PR 분할 plan

| #   | 제목                                                        | 핵심 변경                                                                                           |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `chore(ui): Bootstrap shadcn/ui primitives in packages/ui`  | shadcn init + 18 개 primitive 생성, tailwind preset, cn helper.                                     |
| 2   | `feat(web): Wrap root layout with ThemeProvider + toggle`   | next-themes 통합, 헤더에 theme switcher, system 기본값.                                             |
| 3   | `refactor(web): Migrate dashboard pages to @devgarden/ui`   | `/dashboard` + `/dashboard/projects` + `/dashboard/clients` 의 raw input/button 을 ui primitive 로. |
| 4   | `refactor(web): Migrate runs + tasks pages`                 | `/dashboard/runs/*` + `/dashboard/tasks` 마이그.                                                    |
| 5   | `feat(web): Standardize empty / loading / error states`     | 공통 `<EmptyState>` `<LoadingSkeleton>` `<ErrorState>`, `error.tsx` per route.                      |
| 6   | `refactor(client): Use @devgarden/ui primitives in webview` | pairing form + status pill 재구현.                                                                  |
| 7   | `test(web): Playwright e2e for theme toggle + empty states` | 4~5 cases.                                                                                          |

## 5. 테스트 plan

- **단위**: shadcn primitive 자체는 검증 불필요 (Radix 가 보장). cn helper / ui re-exports 만 sanity test.
- **e2e**: 위 §3.4 항목.
- **회귀**: 기존 e2e (auth-guard, dashboard, runs, tasks, project-detail, run-trigger, runs-history) 가 컴포넌트 교체 후에도 모두 통과해야 함 → 각 PR 에서 회귀 확인 필수.

## 6. 리스크

- **마이그레이션 양이 큼** — apps/web 의 모든 페이지가 한 번씩 손봄. PR 잘게 쪼개기 (PR3, PR4 가 그 분할).
- **테마 토큰과 기존 \`bg-neutral-\*\` 클래스 충돌** — shadcn 의 `background` / `foreground` 토큰으로 일괄 교체 필요. 대규모 find/replace.
- **Tauri webview 의 system theme 감지** — `prefers-color-scheme` 은 OS 따라가지만 Tauri 에서 강제 override 옵션이 있음. macOS 다크 모드 + Tauri 의 native chrome 색상 조합 사전 확인.

## 7. Acceptance criteria

- [ ] `packages/ui` 에 위 §3.1 primitive 들 모두 존재 + lint 통과.
- [ ] apps/web 의 raw `<button>` / `<input>` / `<select>` 개수가 0 (검색으로 확인).
- [ ] Theme toggle 동작: system / light / dark 세 모드 모두 시각적으로 일관.
- [ ] 빈 state, 로딩 state, 에러 state 가 모든 list 페이지에서 표준 컴포넌트로 렌더링.
- [ ] Tauri client 페어링 화면이 새 primitive 로 동작 + macOS dark 모드에서 native chrome 와 시각적 충돌 없음.
- [ ] e2e 16+ cases → 20+ cases (+4 theme/empty/error 시나리오).
