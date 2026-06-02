# P2 — Client JWT OS keychain

> 페어링된 데스크탑 클라이언트의 JWT 가 현재 `tauri-plugin-store` 의 plain JSON 파일 (`pairing.json`) 에
> 평문 저장된다. OS 보안 저장소 (Mac Keychain / Windows Credential Manager / Linux libsecret) 로 이동.

## 1. Why

`apps/client/src/lib/pairing-storage.ts` 의 TODO 주석에 명시:

```
// TODO: swap for OS keychain (keyring / stronghold) to encrypt at rest.
```

현재 동작 — `~/Library/Application Support/<bundleId>/pairing.json` (Mac), `%AppData%\<bundleId>\pairing.json`
(Win), `~/.config/<bundleId>/pairing.json` (Linux) 에 JSON 으로 JWT 저장. **disk 가 풀 디스크 액세스 권한
이 있는 어떤 프로세스에도 평문 노출**. v0.1 부터 v0.2.x 까지 이어진 known limitation.

v0.1 Known Limitations 인용:
> 클라이언트 JWT 의 OS keychain 저장 (현재 `tauri-plugin-store` plain JSON)

## 2. What (acceptance)

- [ ] `PairingStorage` interface 의 새 구현 `keychainPairingStorage` — 내부적으로 Tauri Rust command 호출
      (`keyring` crate 의 Entry::set_password/get_password/delete_password 매핑).
- [ ] 기존 `pairing.json` 이 존재하면 1회성 migration: 읽어서 keychain 에 쓴 뒤 plain 파일 삭제.
- [ ] keychain 접근 불가 환경 (headless Linux without libsecret, CI) 에서 **명시적 fallback** — 환경변수
      `DEVGARDEN_PAIRING_STORAGE=file` 이거나 keychain 호출이 첫 시도에서 명백히 실패하면 v0.2 동작
      (plain JSON) 유지하고 사용자에게 UI 경고.
- [ ] 페어링 직후, 앱 재시작 후, OS 재시작 후 JWT 가 유지 — 3 가지 모두 수동 dogfood 로 확인.
- [ ] `pairing.json` 에는 JWT 가 **남아 있지 않음** — migration 후 파일 삭제 확인 (file existence assertion
      가능한 vitest 케이스).
- [ ] `docs/SELF-HOSTING.md` 의 "클라이언트 페어링" 섹션이 keychain 동작과 platform 별 위치를 다룸.

## 3. 결정 사항

| 결정          | 선택                                                              | 근거                                                                          |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Keychain 방식 | **Tauri Rust 의 `keyring` crate 직접 binding**                    | 플러그인 의존 줄임. `keyring` crate 가 3 OS 통일 API. 검증된 crate.            |
| Service/Account 이름 | service=`devgarden-client`, account=`pairing-jwt`         | Mac Keychain / Win Credential Manager 의 공통 키.                             |
| Migration     | **자동 1회** — 첫 load 시 plain 파일 발견하면 옮기고 파일 삭제    | 사용자 액션 없이 안전하게 이동. 실패 시 file fallback 유지하고 warn.          |
| Fallback      | **명시적 opt-in 만** — env `DEVGARDEN_PAIRING_STORAGE=file` 또는 keychain unavailable 감지 시. UI 에 \"insecure storage\" 경고 띄움. | dogfood-time 우회 가능하지만 기본은 secure. |
| Linux 환경    | libsecret/gnome-keyring 필요 — 없으면 fallback                    | 최소 의존만 권장 (libsecret-1-0). README 명시.                                |
| `Stronghold`  | 도입 안 함                                                        | 무거움 (별도 vault 파일). 우리 용도 (단일 토큰) 에는 keyring 으로 충분.        |

## 4. PR 분할 plan

| PR    | 한 줄                                                                       | 변경 영역                                                                | 테스트                          |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| P2-1  | `feat(client): add tauri keyring commands (rust)`                           | `apps/client/src-tauri/Cargo.toml` (+ keyring crate), `src/keychain.rs`, `lib.rs` invoke handler | rust unit (mock-keyring) |
| P2-2  | `feat(client): keychainPairingStorage + JS bridge`                          | `apps/client/src/lib/keychain-pairing-storage.ts`, types                | 3 vitest (load/save/clear with mocked invoke) |
| P2-3  | `feat(client): auto-migrate plain pairing.json → keychain`                  | `pairing-storage.ts` (wrapping factory), one-time migration              | 2 vitest (migration happy/fail) |
| P2-4  | `feat(client): file-fallback opt-in + insecure storage UI warning`         | `App.tsx` 또는 settings, env detection                                  | 1 vitest + 1 e2e (warning shows when fallback) |
| P2-5  | `docs(self-hosting): keychain storage section + Linux libsecret requirement` | `docs/SELF-HOSTING.md`, `docs/SECURITY.md` 갱신                          | —                               |

## 5. 테스트 plan

### Rust 단위
- `keychain.rs` 의 set/get/delete 가 mock keyring backend 위에서 동작 (`keyring` crate 의 in-memory mock).
- 에러 매핑 (entry not found → Ok(None) 반환).

### JS (vitest)
- `keychainPairingStorage.spec.ts` — `@tauri-apps/api/core` 의 `invoke` 를 mock 해서 명령 호출 인자/응답 검증.
- `pairing-storage.spec.ts` — migration: file 에 기존 record 있을 때 keychain 에 옮기고 file 삭제.
- fallback path: keychain invoke 가 throw 하면 file storage 로 polling, UI 가 warning 노출.

### E2E
- 기존 `pairing.spec.ts` 에 "after pair, keychain is used (no plaintext file remains)" 가시화 case 추가
  가능하면 추가. Tauri webview 에서 file system 확인이 까다로우면 manual smoke 로.

## 6. 리스크 / 미해결

- **Linux libsecret 없는 환경** — D-Bus / gnome-keyring / kwallet 둘 다 없으면 keyring crate fail. 우리는
  fail-soft (warn + file fallback). CI 환경은 file fallback 강제.
- **CI 의 Tauri build smoke** — keyring crate 가 linux 빌드에 추가 dep (`libdbus-1-dev`). P4 의 tauri-build
  job 도 같이 갱신.
- **Migration 의 idempotency** — file 이 비어 있거나 손상되어 있을 때 keychain 덮어쓰지 않도록 — 파일에서
  읽은 record 가 valid 일 때만 migrate. 손상 → file 로 두고 UI warning.
- **Keychain prompt UX** — Mac 의 경우 첫 keychain 접근 시 시스템 prompt ("Allow access?"). 사용자 가이드
  필요. SELF-HOSTING.md 에 스크린샷 첨부.
- **JWT 갱신 흐름** — 현재 30일 만료 후 재페어링. keychain set 만 다시 호출하면 됨, 추가 작업 없음.

## 7. 의존성 / 영향

- 다른 마일스톤과 독립. P4 의 tauri build smoke job 에 libdbus 의존 추가 필요 (P2-1 머지 후 P4 job 갱신).

## 8. 완료 정의

- [ ] PR P2-1 ~ P2-5 모두 머지.
- [ ] CI green (client unit + rust check + tauri build smoke).
- [ ] dogfood: Mac/Linux 에서 페어링 후 `pairing.json` 안에 JWT 없는 것 확인. OS 재시작 후 자동 재연결 동작.
- [ ] `docs/SELF-HOSTING.md` / `docs/SECURITY.md` 키체인 섹션 머지.
