# F1 — Sidecar bundled Node + version guard

> 클라이언트 sidecar 가 시스템 Node 에 의존해서 사용자 환경에 따라 silent crash. Node 22 LTS prebuilt
> binary 를 Tauri `externalBin` 으로 bundle 해서 시스템 의존 제거 + 친절한 진단 메시지.

## 1. Why

v0.3 dogfood 직후 발견된 sidecar crash:

```
Sidecar
● stopped
stderr: Node.js v24.3.0
```

원인: `apps/client/src-tauri/src/sidecar.rs` 의 `Command::new("node")` 가 PATH 의 node 를 spawn.
사용자 환경에 Node v24.3.0 이 깔려 있었고 호환 안 됨. Node 가 unhandled exception 으로 종료할 때
자동으로 stderr 끝에 `Node.js vXX.Y.Z` 헤더를 찍는데 UI 가 마지막 줄만 표시해서 실 stack trace 가
가려짐.

문제는 두 층:

1. **시스템 Node 의존 자체** — 운영자가 호환되는 Node 를 설치/관리해야 함. v0.2 N2 가 명시적으로 미룬 항목 (`docs/roadmap/v0.2/N2-node-sidecar-runner.md`).
2. **에러 surface** — stderr 마지막 줄만 보이고 진단 hint 없음. 사용자가 "어디서부터 봐야" 모름.

## 2. What (acceptance)

- [ ] `apps/client/src-tauri/binaries/` 아래에 platform-target 별 Node 22 LTS binary 가 빌드 시점에 배치됨 (Tauri externalBin 규약: `<name>-<target-triple>`, 예: `node-aarch64-apple-darwin`).
- [ ] `sidecar.rs` 가 시스템 `node` 대신 bundled binary (`tauri::process::CommandChild` 또는 동등) spawn. 시스템 PATH 에 node 가 없어도 동작.
- [ ] `pnpm prepare:sidecar` 가 binary 다운로드 / 캐시 / verify 까지 처리. CI 가 cache hit 시 빠르게.
- [ ] **Dev fallback**: `DEVGARDEN_USE_SYSTEM_NODE=1` env 가 set 이면 기존 시스템 node 동작 유지 (개발자 hot-reload).
- [ ] sidecar 실행 실패 시 webview UI 가 stderr 마지막 한 줄이 아니라 **최근 N 줄 + 종료 코드** 를 표시 + "Open log file" 버튼.
- [ ] Node 버전 check: sidecar 의 첫 JSON line 이 `node-version` event 를 emit, host 가 호환 범위 (Node 22.x) 아니면 warn (bundled binary 가 잘못 packaged 된 경우 자기진단).
- [ ] `docs/SELF-HOSTING.md` §3 의 "별도 Node 설치 필요 없다" 문구 + 트러블슈팅 7.1.0 갱신.

## 3. 결정 사항

| 결정              | 선택                                                                            | 근거                                                                                               |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Node 버전         | **22 LTS** (현 권장 LTS)                                                        | Node 18 LTS 가 2025-04 EOL, 22 는 2027-04 까지. 큰 호환 변화 없음.                                 |
| Binary 출처       | **nodejs.org 공식 tarball** (`https://nodejs.org/dist/v22.X.Y/...`)             | 검증된 출처 + checksum SHA256SUMS. 별도 패키지 빌드 불필요.                                        |
| Bundle 방식       | **Tauri `externalBin`** + platform suffix                                       | 공식 패턴, build script 에서 binary 를 platform target 별로 복사. signing flow 와 호환.            |
| Build 시점        | `pnpm prepare:sidecar` 가 download + 캐시. 캐시 hit 시 무동작.                  | local dev 와 CI 둘 다 동일 path. nightly tauri smoke 가 cache miss case 검증.                      |
| Dev fallback      | **`DEVGARDEN_USE_SYSTEM_NODE=1` env opt-in**                                    | 개발자가 hot-reload 로 sidecar 수정할 때 bundle 거치지 않고 system node 쓰는 일상 워크플로우 보존. |
| Error surface     | last N=20 stderr lines + exit code + "Open log file" 버튼                       | 진단 가능한 데이터 + 사용자가 다음 액션 찾을 수 있게.                                              |
| Version handshake | sidecar 가 부팅 직후 `{event:"node-version", version:"v22.X.Y"}` JSON line emit | host 가 build-time 기대치와 비교, 다르면 amber 배너.                                               |

## 4. PR 분할 plan

| PR   | 한 줄                                                                    | 변경 영역                                                                                 | 테스트                      |
| ---- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------- |
| F1-1 | `chore(client): Add Node 22 LTS download script + cache`                 | `apps/client/scripts/download-node.mjs`, `prepare:sidecar` script 갱신, gitignore         | 1 unit (cache hit/miss)     |
| F1-2 | `feat(client): sidecar.rs spawns bundled Node binary`                    | `apps/client/src-tauri/src/sidecar.rs`, `tauri.conf.json` externalBin entry, capabilities | rust unit (path resolve)    |
| F1-3 | `feat(client): DEVGARDEN_USE_SYSTEM_NODE=1 dev fallback`                 | `sidecar.rs` env 분기                                                                     | rust unit (env on/off)      |
| F1-4 | `feat(client): better sidecar error surface (last N lines + exit + log)` | `App.tsx` sidecar status panel, `sidecar.rs` 가 buffer 유지                               | 2 vitest                    |
| F1-5 | `feat(client,client-runner): node-version handshake event`               | `apps/client-runner/src/main.ts` 첫 emit, host side handler                               | 1 vitest (handshake parses) |
| F1-6 | `ci: bundled-Node smoke job + tauri smoke 갱신`                          | `.github/workflows/tauri-build-smoke.yml` 가 download-node 캐시 검증, dedicated smoke job | CI self-test                |
| F1-7 | `docs(self-hosting): bundled Node section + troubleshooting 갱신`        | `docs/SELF-HOSTING.md` §3 / §7                                                            | —                           |

## 5. 테스트 plan

### 단위 (Rust + JS)

- `download-node.mjs` 가 cache 디렉토리 존재 시 skip, 없으면 download + checksum verify.
- `sidecar.rs` 의 binary path resolve 가 platform 별로 정확 (mock fs).
- env `DEVGARDEN_USE_SYSTEM_NODE=1` 셋 시 기존 path 로 fallback.

### 통합 / e2e

- 기존 client e2e 가 bundle 으로 동작 (CI 환경에서 Node 가 없는 user 와 비슷한 조건). 회귀 0.
- nightly tauri smoke 가 download 캐시 cold-start + warm-start 둘 다 검증.

### 수동 dogfood

- Node 24 환경 + bundle 으로 sidecar 정상 부팅.
- Node 미설치 환경에서도 정상 부팅.
- 일부러 손상된 binary 일 때 error UI 가 actionable.

## 6. 리스크 / 미해결

- **Bundle 크기 증가** — Node 22 LTS binary 가 ~50MB (압축). DMG/MSI 크기 ~60MB 증가. v0.2 N2 가 미룬 이유. 수용.
- **Platform 별 build matrix** — macOS x64/arm64, Linux x64/arm64, Windows x64. 5 ~ 6개 target. CI 의 tauri smoke 가 일부만 검증, 나머지는 release-time 수동 dogfood.
- **Code signing 영향** — bundled Node binary 가 Tauri 의 codesign 단계에 포함되어야. unsigned tauri build smoke 만 PR-time, signing 은 별도 P5+.
- **License** — Node.js 는 MIT, distribution 가능. License 표기 추가.
- **download flake** — nodejs.org 다운로드 실패 → CI red. checksum verify + 3 retry + 명확한 에러.

## 7. 의존성 / 영향

- 다른 마일스톤과 독립. F4 의 SELF-HOSTING.md 재작성이 F1 결과 반영.

## 8. 완료 정의

- [ ] PR F1-1 ~ F1-7 모두 머지.
- [ ] CI green + nightly tauri smoke 의 download 캐시 cold + warm 둘 다 green.
- [ ] Node 미설치 호스트에서 sidecar 정상 부팅 (수동 dogfood).
- [ ] 손상 binary 시 actionable error UI (수동).
- [ ] `docs/SELF-HOSTING.md` §3 + §7 머지.
