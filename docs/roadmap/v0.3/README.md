# DevGarden v0.3 — Roadmap

> v0.2 는 "운영자 한 명이 매일 쓸 만한 도구" 였다. v0.3 은 그걸 **여러 인스턴스에서, 더 안전하게, 진짜로 운영할 수
> 있는 수준** 으로 끌어올린다. 핵심 키워드는 _production hardening_.

> 본 문서는 큰 그림. 각 마일스톤의 세부 계획 / PR 분할 / 테스트 plan 은 같은 폴더의 개별 `Px-*.md`.

## 1. 비전

v0.2 dogfood 에서 드러난 v0.2 known limitations 중 **운영 위험성** 에 직결된 것들을 v0.3 에서 정리한다.

- **알림 SSE 가 in-process** — api 를 여러 대 띄우면 다른 인스턴스에 붙은 브라우저는 toast 를 놓친다.
- **클라이언트 JWT 가 plain JSON** — `tauri-plugin-store` 가 OS 보안 저장소를 안 거치고 user-config 디렉토리에 평문 저장.
- **OAuth e2e 가 mock cookie 만** — 실 OAuth dance 는 manual smoke 로만 검증. HTTPS 환경 회귀가 안 잡힘.
- **prod build 가 nightly 에서만 검증** — v0.2.1 이 그 사례. PR-time 에서 못 잡으면 release 직후 깨진다.

v0.3 이 끝나면:

- api 를 여러 인스턴스로 띄워도 알림이 정상 동작한다 (Redis pub/sub).
- 클라이언트가 페어링된 후 JWT 가 OS keychain 에 들어간다 (Mac Keychain / Windows Credential Manager / libsecret).
- e2e 가 실제 OAuth dance 를 친다 (HTTPS dev cert + mock GitHub OAuth provider).
- PR 마다 `docker build` + `tauri build` smoke 가 돈다. 구조화된 로그와 `/metrics` 가 나간다.

## 2. 결정 사항 (이 로드맵의 전제)

| 결정             | 선택                                              | 영향                                                                |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| 테마             | **Production hardening**                          | feature 확장 없음. 운영 안전성/관측성/보안 한정.                    |
| 스코프           | **Narrow & deep (4 마일스톤, ~30 PR)**            | v0.2 의 7 마일스톤보다 좁게. v0.3.0 cut 까지 ~1.5 개월 추정.        |
| Pub/sub 백엔드   | **Redis (ioredis)** — env 가 없으면 in-process    | P1 — 단일 인스턴스 사용자 영향 없음, 다중 인스턴스만 REDIS_URL.     |
| Keychain 접근    | **Tauri Rust 의 `keyring` crate 직접 binding**    | P2 — 플러그인 의존 줄이고 fallback 제어. headless 는 file fallback. |
| OAuth e2e        | **mkcert 자체 CA + GitHub OAuth mock provider**   | P3 — 실 GitHub 의존성 회피, e2e 마다 새 cert/cookie 가능.           |
| 로그 라이브러리  | **pino** (Nest Logger override)                   | P4 — 성능 우선, JSON 출력으로 외부 수집기 친화.                     |
| Metrics endpoint | **Prometheus `/metrics` (prom-client 직접 사용)** | P4 — `@willsoto/nestjs-prometheus` 의존 안 추가, 핵심 4~5 메트릭.   |

> 위 결정은 default. 마일스톤별 plan 문서에서 더 자세한 trade-off 와 함께 다시 검토.

## 3. 마일스톤 한눈에

| #   | 마일스톤                                                 | 한 줄 요약                                                                    | 의존성 | 상태              |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ----------------- |
| P1  | [Multi-instance SSE + Redis](./P1-multi-instance-sse.md) | 알림 SSE 와 RunsGateway 의 in-process Subject 를 Redis pub/sub 으로 fan-out   | —      | ⬜ 시작 전        |
| P2  | [Client JWT OS keychain](./P2-jwt-keychain.md)           | `tauri-plugin-store` plain JSON → OS keychain (`keyring` crate) + migration   | —      | ⬜ 시작 전        |
| P3  | [OAuth e2e + HTTPS dev](./P3-oauth-e2e.md)               | mkcert 자체 CA + GitHub OAuth mock + Playwright HTTPS context 로 실 OAuth e2e | —      | ⬜ 시작 전        |
| P4  | [Ops + CI hardening](./P4-ops-ci-hardening.md)           | pino 구조화 로그, `/metrics`, PR-time docker build + tauri build smoke        | —      | 🔄 진행 중 (P4-1) |

## 4. Cross-cutting 원칙

v0.2 에서 채택한 원칙 그대로 유지 + v0.2.1 의 교훈:

- **CI 가 prod build 도 PR-time 에 검증** — v0.2 의 "nightly 만" 정책으로 v0.2.1 사고. P4 에서 정책 자체를 강화.
- **docs 와 코드 same-PR sync** — 운영 변경은 `docs/SELF-HOSTING.md` 영향이 크다. 같은 PR 에서 갱신.
- **한 PR 안에서도 commit 분리** — [`CONVENTIONS §4`](../../CONVENTIONS.md#4-커밋-단위-분리-원칙).
- **CI 통과 시 auto-merge** — `gh pr merge --merge --delete-branch`.
- **기본값은 v0.2 동작** — Redis 미설정/keychain 없음 등은 in-process/file 로 fallback. 단일 인스턴스 사용자에게 회귀 없음.

## 5. Out of scope (v0.4+ 로 미룸)

- **Team / multi-user 권한 모델** — single-owner 가 v0.3 에서도 유지. team 은 v0.4+.
- **하네스 노드 UI (drag-drop)** — N4 YAML editor 그대로. 노드 UI 는 v0.4+.
- **다중 클라이언트 라우팅 / 큐잉** — v0.4+.
- **Signed installers (Mac/Win/Linux)** — cert 발급이 환경 의존. P4 에서 unsigned tauri build smoke 까지만.
- **Tauri Rust 로 tools 전면 재구현** — v0.2 sidecar 유지. Rust port 는 v0.4+.
- **멀티 LLM provider routing** — v0.4+.
- **외부 일정 도구 연동 (Linear/Jira/Notion)** — v0.4+.
- **i18n / mobile responsive** — v0.4+.
- **per-project 알림 override UI** — v0.2 N5 known limitation 유지. v0.4+.
- **Encrypted backup + secret rotation** — 별도 P6 후보였지만 v0.3 scope 에서 제외. v0.4+.

## 6. Success criteria

다음 모두 충족하면 v0.3.0 릴리즈:

- [ ] P1~P4 마일스톤의 각 acceptance 항목 완료.
- [ ] `docs/SELF-HOSTING.md` 가 Redis 옵션 + keychain 동작 + metrics endpoint 를 다룸.
- [ ] dogfood: api 2 인스턴스 (또는 docker scale=2) 띄우고 한 쪽 인스턴스에 붙은 브라우저가 다른 쪽 인스턴스에서 발생한 run 알림을 받는다. _(수동 검증 항목)_
- [ ] dogfood: 새 호스트에서 페어링 후 클라이언트 재시작/OS 재시작 후에도 JWT 유지, plain JSON 파일에서는 토큰 흔적 없음. _(수동 검증 항목)_
- [ ] CI 5 jobs 모두 green + PR-time docker build smoke green + nightly tauri build smoke green, 누적 테스트 ≥ 500 cases.
- [ ] `CHANGELOG.md` v0.3.0 entry 작성 + GitHub Release.

## 7. 작업 순서 가이드

엄격한 순서는 아니지만 의존성 + 가치 우선:

1. **P4 (Ops + CI hardening) 의 docker-in-PR-CI 먼저** — 다른 마일스톤 PR 들도 그 보호 아래서 안전하게 머지. 1~3 일.
2. **P1 (Redis SSE) 와 P2 (keychain) 병행** — 의존성 없음.
3. **P3 (OAuth e2e)** P1/P2 진행 중 병행 가능. mkcert/HTTPS 셋업이 selbst 완결.
4. **P4 나머지 (pino + /metrics)** P1 다음에 — 다중 인스턴스 환경에서 의미 있는 metrics 가 더 명확해짐.

## 8. 트랙별 진행 보드

각 마일스톤의 PR 단위 작업은 개별 `Px-*.md` 의 "PR 분할 plan" 참조. 진행 상태는 본 README 의 §3 표와
`docs/ROADMAP.md` 의 Progress snapshot 양쪽에 동기화.
