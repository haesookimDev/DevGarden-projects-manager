# N2 — Node sidecar runner

> v0.1 의 가장 큰 미해결 한계. Tauri webview 는 브라우저 context 라 \`node:fs\` / \`node:child_process\` 가
> 없다 → harness runner 가 webview 에서 실행 불가. v0.2 는 Rust 바이너리가 **Node sidecar 프로세스** 를
> spawn 하고, 거기서 기존 TS runner + tools 를 그대로 돌린다.

## 1. Goal

- 데스크탑 client 가 페어링되면 Rust 측이 Node sidecar 를 자동 spawn.
- Sidecar 가 API 의 `run:start` 이벤트를 받아 `runHarness` 호출 → fs/process/git/github.openPR 등 모든 도구를 정상 실행.
- Webview ↔ sidecar IPC 는 Tauri 의 stdio JSON-RPC (또는 Unix domain socket / named pipe) 로 표준화.
- Sidecar 가 죽으면 Rust 가 자동 재시작 (backoff) + webview 의 connection pill 이 \"sidecar offline\" 표시.

## 2. 결정 사항

| 항목                       | 선택                                                                                            | 이유                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Sidecar bundling           | Tauri 의 `tauri.conf.json` 의 `bundle.externalBin` 으로 Node 바이너리 + sidecar JS 를 같이 ship | 사용자 머신에 Node 설치 강제하지 않음. macOS / Win / Linux 별 prebuilt Node. |
| Sidecar 실체               | Node.js 22 LTS prebuilt + esbuild 로 bundle 된 single-file JS                                   | `node_modules` 까지 ship 하면 용량 폭발. esbuild bundling 으로 한 파일.      |
| IPC                        | Rust ↔ sidecar: stdio JSON Lines / sidecar ↔ api: 기존 socket.io 그대로                         | 단순. Rust 의 \`tauri-plugin-shell\` sidecar 가 이미 stdio 지원.             |
| Sidecar 인증               | Pairing JWT 를 Rust 가 storage 에서 읽어 sidecar 에 전달                                        | sidecar 가 직접 storage 접근 안 함 → 보안 경계 명확.                         |
| 재시작 전략                | exponential backoff 2 s → 30 s + jitter, 5 회 연속 실패시 \"pair re-required\" 상태로 표시      | infinite loop 회피.                                                          |
| Webview ↔ sidecar 상호작용 | webview 는 사이드카 상태만 display, 직접 IPC 안 함                                              | 보안 경계 + 단순함.                                                          |

## 3. 산출물

### 3.1 Rust 측 (`apps/client/src-tauri/`)

- `src/sidecar.rs` — `tauri::async_runtime::spawn` 에서 sidecar 프로세스 관리. `Stdio::piped()`, stdout 라인별 JSON 파싱 → Tauri event `sidecar:status` 로 webview 에 전파.
- `src/lib.rs` — pairing 완료 후 sidecar 자동 시작. unpair 시 종료.
- `tauri.conf.json` — `bundle.externalBin` 에 `bin/devgarden-runner-darwin-arm64`, `...-x64`, `...-linux-x64`, `...-windows-x64.exe` 등록.
- `src/main.rs` 의 capability 에 sidecar IPC 권한 추가.

### 3.2 Sidecar 자체 (`apps/client-runner/`)

새 워크스페이스 패키지:

- `package.json` — `bundleDependencies` 로 `@devgarden/harness-core`, `@devgarden/shared`, `socket.io-client`, `bcrypt` 등.
- `src/main.ts` — 진입점:
  1. stdin 에서 첫 JSON `{ apiBaseUrl, jwt }` 받기
  2. socket.io-client 로 api 연결 + heartbeat 시작
  3. `run:start` 이벤트 시 기존 `executeRun` (현 `apps/client/src/lib/run-executor.ts` 코드 그대로 옮김) 호출
  4. step / log / status / sidecar 자체 헬스 stdout 으로 출력
- `src/tools/` — 현재 `apps/client/src/tools/` 의 fs/process/git/github 그대로 옮김 (정말 _그대로_).
- `scripts/build-sidecar.mjs` — esbuild bundle → `dist/runner.js` → 각 OS 별 prebuilt Node 와 함께 `dist/bin/` 으로 묶기.
- `vitest` 설정 — 기존 client tools test 들이 그대로 통과해야 함 (지금은 `apps/client/src/tools/` 에 있는 것).

### 3.3 Webview (`apps/client/src/`)

- `lib/sidecar.ts` — Tauri event subscribe: `sidecar:status` → React state.
- `App.tsx` — 페어링 카드 옆에 새 \"Sidecar status\" 카드 — running / restarting / failed / disabled.
- 기존 `tools/` 와 `lib/run-executor.ts` 는 `apps/client-runner/src/` 로 **이동** (apps/client 에서 삭제). vitest 도 같이.

### 3.4 빌드 / CI

- `pnpm tauri build` 가 `pnpm --filter @devgarden/client-runner build` 를 dependency 로 자동 호출.
- CI 의 `Unit tests` job 이 client-runner tests 도 포함.
- CI 의 `E2E tests` 와 별개로 새 `Tauri build smoke` job (nightly) — actual `pnpm tauri build` 가 끝까지 가는지 확인 (binaries 는 artifact 로 업로드, 항상 실행은 무거우니 push to main 만).

## 4. PR 분할 plan

| #   | 제목                                                           | 핵심 변경                                                                                 |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | `chore(workspace): Add apps/client-runner package`             | 빈 패키지 + build 설정 + esbuild + prebuilt Node 다운로드 스크립트.                       |
| 2   | `refactor(client): Move tools + run-executor to client-runner` | apps/client/src/tools + lib/run-executor + 관련 spec 모두 이동. webview 에서 import 끊김. |
| 3   | `feat(client-runner): stdio bootstrap (auth + heartbeat)`      | stdin 에서 pairing 받아 socket.io 연결 + heartbeat. 그 후엔 idle.                         |
| 4   | `feat(client-runner): run:start handler that calls executeRun` | 기존 run-executor 와 동일 시나리오.                                                       |
| 5   | `feat(tauri): Spawn + supervise Node sidecar via externalBin`  | sidecar.rs + tauri.conf.json + capability.                                                |
| 6   | `feat(client): Sidecar status card in webview`                 | Tauri event subscribe + 상태 표시.                                                        |
| 7   | `chore(ci): Nightly tauri-build smoke job`                     | macOS arm64 + linux x64 빌드.                                                             |

## 5. 테스트 plan

- 기존 tools / run-executor unit 28 → 그대로 client-runner 에서 28+ 동작.
- 새 단위: sidecar bootstrap (stdin parsing) + tools wiring.
- 통합: api integration 기존 그대로 (runs-gateway-broadcast 등). 추가로 sidecar 와 api 간 실 socket 연결 통합 1 case (Testcontainers 위에서 spawn 한 sidecar 가 run:start 받아 시뮬 실행).
- Manual smoke: pair → 작은 harness 실행 (fs.write README + git.commit + git.push + github.openPR) 완주.

## 6. 리스크

- **Prebuilt Node 용량** — `~30 MB` per platform. Tauri DMG/MSI 가 평소 5 MB 였던 게 35 MB+ 됨. 허용 범위. 향후 system-installed Node 자동 detect 옵션 (있으면 사용, 없으면 ship).
- **macOS code-signing + sidecar bin** — Tauri 가 자동으로 `externalBin` 도 sign 하긴 함. Apple Developer cert 가 없으면 unsigned 라 사용자가 manual 'Open' 확인 필요. signed installer (v0.3+) 백로그.
- **Sidecar 가 멈춰서 backoff loop 시 부담** — 5 회 연속 실패시 자동 비활성 + 사용자 알림.
- **기존 e2e 회귀** — `apps/client` 의 tools spec 들이 이동되면서 path 변경. e2e 영향은 거의 없지만 import 경로 일제 확인 필요.
- **Cross-platform git binary** — sidecar 가 `git` 호출. Win 에서는 `git.exe` 가 PATH 에 없을 수 있음. Tauri shell 확장 또는 사용자에게 git 사전 설치 안내.

## 7. Acceptance criteria

- [ ] `apps/client-runner` 가 별도 workspace 패키지로 존재 + 자체 build 동작.
- [ ] `pnpm tauri build` 결과 .dmg / .app 안에 sidecar bin + Node prebuilt 가 포함되어 있다 (`find ... -name 'devgarden-runner-*'`).
- [ ] 페어링 후 webview 의 \"Sidecar status\" 가 running.
- [ ] api 가 보낸 `run:start` 가 sidecar 에서 `executeRun` 으로 흘러 step/log/status 가 정상 보고됨 (manual smoke 로 fs.write + git.push + github.openPR 1 회).
- [ ] sidecar 강제 kill 시 Rust 가 5 s 안에 재시작, 5 회 연속 실패하면 \"failed\" 표시 + 자동 재시도 멈춤.
- [ ] CI 의 nightly `Tauri build smoke` 가 main push 시 통과.
- [ ] v0.1 의 \"Desktop client 의 실 harness 실행 path\" 백로그 항목이 ROADMAP 에서 ✅ 로 마킹.
