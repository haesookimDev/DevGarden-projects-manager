# DevGarden v0.4 — Roadmap

> v0.3 은 운영 환경에 안심하고 올릴 수 있는 릴리즈였다. v0.4 는 거기서 한 발 더 나가서 **새 사용자가 첫
> 30 분 안에 막히지 않게** 한다. 핵심 키워드는 _onboarding friction removal_.

> 본 문서는 큰 그림. 각 마일스톤의 세부 계획 / PR 분할 / 테스트 plan 은 같은 폴더의 개별 `Fx-*.md`.

## 1. 비전

v0.3 dogfood 직후 두 가지 벽이 즉시 드러났다:

- **Sidecar 가 시스템 Node 24 에서 silent crash** — `apps/client/src-tauri/src/sidecar.rs` 가 `Command::new("node")` 로 PATH 의 node 를 spawn. 호환 안 되는 Node 버전이 깔린 환경에서 stderr 마지막 `Node.js v24.3.0` 헤더만 노출되고 실 stack trace 가 가려짐.
- **"Refresh from GitHub" 가 무조건 400** — `apps.listInstallationsForAuthenticatedUser` 는 **GitHub App** 의 user-to-server token 만 받는데 `docs/SELF-HOSTING.md` §1.3 가이드가 **별도 OAuth App** 을 만들도록 안내해서 NextAuth 가 잘못된 종류의 token 발급. 첫 사용자가 onboarding 중 100% 부딪힘.

추가로 v0.3 P3 는 mkcert HTTPS dev 셋업을 "real github.com 검증이 필요해질 때" 로 미뤘다. v0.4 가 그 일을 마저 한다.

v0.4 가 끝나면:

- 클라이언트가 시스템 Node 없이 동작한다 (번들된 Node binary).
- GitHub App 하나만 등록하면 로그인 + installation 조회 + repo 접근까지 한 묶음.
- 운영자가 `/dashboard/setup-status` 한 화면에서 어디가 미설정인지 자기진단.
- HTTPS dev 셋업이 mkcert 한 줄로 끝남. SELF-HOSTING.md 가 v0.4 통합 flow 기준으로 재작성.

## 2. 결정 사항 (이 로드맵의 전제)

| 결정             | 선택                                          | 영향                                                                                 |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| 테마             | **Onboarding friction removal**               | feature 확장 없음. dogfood-driven UX 정리 + 셋업 자동화.                             |
| 스코프           | **Narrow & deep (4 마일스톤, ~30 PR)**        | v0.3 패턴 그대로. v0.4.0 cut 까지 ~1.5 개월 추정.                                    |
| Sidecar Node     | **Bundled Node 22 LTS (Tauri `externalBin`)** | F1 — platform 별 prebuilt Node binary 를 다운로드해서 bundle. 시스템 Node 의존 0.    |
| OAuth credential | **GitHub App 의 OAuth feature 만 사용**       | F2 — 기존 OAuth App 별도 등록 가이드 제거. boot warning 으로 잘못된 credential 감지. |
| 헬스체크 면      | **`/dashboard/setup-status` 단일 화면**       | F3 — api `/internal/setup/status` 가 6~7개 probe 결과를 한 JSON 으로 반환.           |
| HTTPS dev cert   | **mkcert 자체 CA**                            | F4 — `infra/dev-https.sh` 가 한 줄로 셋업. Playwright HTTPS profile 도 같이.         |

> 위 결정은 default. 마일스톤별 plan 문서에서 더 자세한 trade-off 와 함께 다시 검토.

## 3. 마일스톤 한눈에

| #   | 마일스톤                                                     | 한 줄 요약                                                                                  | 의존성                                       | 상태       |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------- |
| F1  | [Sidecar bundled Node](./F1-sidecar-node-bundle.md)          | Tauri `externalBin` 으로 Node 22 LTS bundle, 시스템 node 의존 제거 + version guard          | —                                            | ⬜ 시작 전 |
| F2  | [GitHub App unified OAuth](./F2-github-app-unified-oauth.md) | NextAuth provider 가 GitHub App credential 사용, OAuth App 가이드 폐기                      | —                                            | ⬜ 시작 전 |
| F3  | [Setup health-check page](./F3-setup-health-check.md)        | `/dashboard/setup-status` — DB / GitHub App / sidecar / SMTP / Redis 자기진단 한 화면       | F2 (status 가 OAuth 통합 결과를 반영)        | ⬜ 시작 전 |
| F4  | [HTTPS dev cert + docs rewrite](./F4-https-dev-cert.md)      | mkcert 셋업 + dev compose HTTPS profile + Playwright HTTPS profile + SELF-HOSTING.md 재작성 | F1, F2 (재작성된 문서가 v0.4 통합 flow 반영) | ⬜ 시작 전 |

## 4. Cross-cutting 원칙

v0.2/v0.3 에서 채택한 원칙 + v0.3 dogfood 의 교훈:

- **에러 메시지가 actionable** — v0.3 의 "Node.js v24.3.0" silent crash 처럼 stderr 마지막 줄만 보이는 패턴 회피. boot/run-time 실패는 항상 다음 단계 안내 포함.
- **첫 사용자 만나는 모든 문서를 same-PR sync** — `docs/SELF-HOSTING.md`, `.env.example`, `docs/SECURITY.md` 가 v0.4 통합 flow 와 일관.
- **회귀 0 default** — bundled Node / GitHub App credential 모두 v0.3 호환 fallback path 유지. 기존 사용자가 업그레이드 후 깨지지 않게.
- **CI 가 prod build 도 PR-time 에 검증** — v0.3 P4 에서 도입한 docker build smoke 유지 + F1 의 Node bundle 산출물도 nightly tauri smoke 가 가드.
- **CI 통과 시 auto-merge** — `gh pr merge --merge --delete-branch`.

## 5. Out of scope (v0.5+ 로 미룸)

- **Team / multi-user 권한 모델** — single-owner 가 v0.4 에서도 유지. team 은 v0.5+.
- **하네스 노드 UI (drag-drop)** — N4 YAML editor 그대로.
- **다중 클라이언트 라우팅 / 큐잉** — v0.5+.
- **Signed installers (Mac/Win/Linux)** — cert 발급 환경 의존, F1 의 bundled Node 만 다룸 (signing 은 별도).
- **Tauri Rust 로 tools 전면 재구현** — sidecar 유지.
- **멀티 LLM provider routing** — v0.5+.
- **외부 일정 도구 연동 (Linear/Jira/Notion)** — v0.5+.
- **i18n / mobile responsive** — v0.5+.
- **per-project 알림 override UI** — v0.2 N5 known limitation 유지.
- **Encrypted backup + secret rotation** — v0.3 backlog 그대로 v0.5+.
- **Redis 장애 retry queue** — best-effort 유지.

## 6. Success criteria

다음 모두 충족하면 v0.4.0 릴리즈:

- [ ] F1~F4 마일스톤의 각 acceptance 항목 완료.
- [ ] `docs/SELF-HOSTING.md` 가 v0.4 통합 flow 기준으로 재작성됨 — GitHub App 만, OAuth App 별도 등록 단계 제거.
- [ ] dogfood: 호스트에 Node 없는 상태에서 클라이언트 빌드 → 페어링 → harness 실행 정상 동작. _(수동 검증 항목)_
- [ ] dogfood: 새 호스트에서 GitHub App 하나만 등록 + .env 채움 → 로그인 → `/dashboard/setup-status` 가 모두 OK → repo picker 가 installations 채움 → harness 실행 → PR. 30 분 이내. _(수동 검증 항목)_
- [ ] CI 6 jobs (Lint / Typecheck / Unit / Integration / E2E / Docker build smoke) 모두 green + nightly tauri build smoke + bundled-Node smoke green, 누적 테스트 ≥ 540 cases.
- [ ] `CHANGELOG.md` v0.4.0 entry 작성 + GitHub Release.

## 7. 작업 순서 가이드

엄격한 순서는 아니지만 의존성 + 가치 우선:

1. **F2 (GitHub App unified OAuth) 먼저** — 첫 사용자가 가장 빨리 만나는 벽 + F3/F4 의 docs 재작성이 F2 결과 반영해야 함.
2. **F1 (Sidecar Node bundle)** F2 와 병행. 클라이언트 빌드 파이프라인이라 web/api 와 충돌 없음.
3. **F3 (Setup health-check)** F2 머지된 후 — status probe 가 OAuth 통합 결과를 반영.
4. **F4 (HTTPS dev cert + docs rewrite)** 마지막 — F1, F2, F3 의 결과를 SELF-HOSTING.md 에 통합.

## 8. 트랙별 진행 보드

각 마일스톤의 PR 단위 작업은 개별 `Fx-*.md` 의 "PR 분할 plan" 참조. 진행 상태는 본 README 의 §3 표와
`docs/ROADMAP.md` 의 Progress snapshot 양쪽에 동기화.
