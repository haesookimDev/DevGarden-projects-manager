# F4 — HTTPS dev cert (mkcert) + SELF-HOSTING.md 재작성

> v0.3 P3 가 미룬 mkcert HTTPS dev 셋업을 마저 한다. F1/F2/F3 의 결과를 반영해서 SELF-HOSTING.md 를
> v0.4 통합 flow 기준으로 다시 쓴다.

## 1. Why

v0.3 P3 §2.1 (scope reduction) 에서:

> HTTPS / mkcert 셋업을 v0.4+ 백로그로 미루고 기존 HTTP mock provider 위에서 OAuth round-trip e2e 를 추가한다. HTTPS 가 필요한 별도 검증 (Secure cookie attribute, HSTS, 실 GitHub 와의 round-trip) 은 별도 milestone 으로.

v0.4 가 그 일이다. 추가로 v0.4 의 F1+F2+F3 가 셋업 path 자체를 바꾸기 때문에 v0.3 의 `docs/SELF-HOSTING.md` 가 더이상 정확하지 않다 — 전면 재작성이 필요.

직접적 산출:

- mkcert 한 줄 셋업으로 로컬 HTTPS 가능 — GitHub OAuth callback URL 이 `https://localhost:3000` 로 동작 (지금까지 HTTP only).
- Playwright HTTPS profile 로 `oauth-roundtrip.spec.ts` 가 실 cert/Secure cookie 동작도 검증.
- SELF-HOSTING.md 가 v0.4 통합 flow 기준 — OAuth App 별도 등록 제거, sidecar bundled Node 명시, setup-status 페이지 안내.

## 2. What (acceptance)

- [ ] `infra/dev-https.sh` — mkcert 설치 안내 + 자체 CA 신뢰 + `localhost` cert 발급을 한 줄 명령으로.
- [ ] `infra/docker-compose.dev.yml` 에 HTTPS profile — `web` 이 `--experimental-https` 또는 reverse proxy 로 TLS 종단.
- [ ] `playwright.config.ts` 에 dedicated `oauth-https` project — mkcert cert 사용, `ignoreHTTPSErrors: false`.
- [ ] `oauth-roundtrip.spec.ts` 에 HTTPS variant — 같은 happy + denied 시나리오를 HTTPS 로 한 번 더.
- [ ] `docs/SELF-HOSTING.md` 전면 재작성 — v0.1~v0.3 의 잔재 (OAuth App 별도 등록, 시스템 Node 의존) 제거. 새 흐름:
  1. host 요구사항 (Node 불필요)
  2. GitHub App 하나 등록 (callback URL 포함)
  3. `.env` 작성 (간소화)
  4. `docker compose up`
  5. 첫 로그인 → `/dashboard/setup-status` 가 모두 OK 확인
  6. 클라이언트 페어링
  7. (선택) HTTPS dev 셋업 / 다중 인스턴스 / SMTP
  8. 백업 / 업그레이드 / troubleshooting / 보안 / 다음 단계
- [ ] `docs/migration/v0.3-to-v0.4.md` 가 v0.4 단계별 업그레이드 안내.
- [ ] `README.md` 의 quick-start 섹션이 v0.4 흐름 반영.

## 3. 결정 사항

| 결정             | 선택                                                          | 근거                                                                                     |
| ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| HTTPS 방식 (dev) | **Next.js `--experimental-https` + mkcert**                   | Next 15+ 가 native HTTPS dev 지원. reverse proxy 없이 가장 단순.                         |
| HTTPS 방식 (e2e) | **Playwright webServer 가 `--experimental-https` 직접 spawn** | global-setup 가 mkcert path 주입. mock provider 는 HTTP 유지 (oauth4webapi 우회 그대로). |
| Cert 보관        | `infra/cert/` (gitignored) — mkcert 산출물                    | 호스트 별 발급. 절대 커밋 금지.                                                          |
| CI 처리          | CI 는 ubuntu-latest 에 mkcert 설치 + 자체 CA + cert 생성      | apt 한 줄 + `mkcert -install`. macos-runner 에서도 동작.                                 |
| docs 재작성 범위 | SELF-HOSTING.md 전체 + README quickstart                      | 잔재 정리. v0.4 가 onboarding 테마인 만큼 docs 가 끝.                                    |
| Migration 문서   | `docs/migration/v0.3-to-v0.4.md` 신규                         | OAuth credential 교체 + sidecar bundled Node 효과 + setup-status 안내 한 곳에 모음.      |

## 4. PR 분할 plan

| PR   | 한 줄                                                          | 변경 영역                                                                  | 테스트                |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| F4-1 | `chore(infra): dev-https.sh + mkcert cert dir gitignore`       | `infra/dev-https.sh`, `infra/cert/.gitignore`, `infra/README.md`           | manual smoke          |
| F4-2 | `chore(infra): docker-compose.dev https profile`               | `infra/docker-compose.dev.yml`                                             | manual                |
| F4-3 | `feat(web,e2e): playwright oauth-https project + spec variant` | `playwright.config.ts`, `e2e/oauth-roundtrip.spec.ts` (HTTPS variant 추가) | 1 e2e (HTTPS variant) |
| F4-4 | `ci: install mkcert + generate cert in e2e job`                | `.github/workflows/ci.yml` E2E job                                         | CI self-test          |
| F4-5 | `docs(self-hosting): rewrite for v0.4 unified onboarding flow` | `docs/SELF-HOSTING.md` 전체 재작성                                         | —                     |
| F4-6 | `docs(migration): v0.3 → v0.4 step-by-step guide`              | `docs/migration/v0.3-to-v0.4.md` (신규)                                    | —                     |
| F4-7 | `docs(readme): quickstart 가 v0.4 flow 반영`                   | `README.md`                                                                | —                     |

## 5. 테스트 plan

### 신규 e2e

- `oauth-roundtrip.spec.ts` 의 HTTPS variant — 동일 happy + denied 시나리오를 HTTPS profile 로 한 번 더.
- 기존 HTTP variant 도 유지 (cost 가성비 높음).

### CI

- E2E job 가 `apt install libnss3-tools mkcert` (또는 binary release) + `mkcert -install` + cert 생성 후 Playwright HTTPS profile 실행.

## 6. 리스크 / 미해결

- **mkcert CI 셋업 안정성** — `mkcert -install` 가 nss DB 권한 문제로 가끔 깨질 수 있음. fallback: `ignoreHTTPSErrors: true` 로 cert 신뢰 생략하고 HTTPS 동작만 검증.
- **Next `--experimental-https`** 가 v15 에서 stable 진입 여부 확인 필요. 깨지면 reverse proxy (Caddy local) 로 대체.
- **macOS keychain prompt** — `mkcert -install` 가 keychain 접근 prompt → CI runner 가 사용자 인터랙션 없는 옵션으로 실행.
- **docs 재작성 범위** — SELF-HOSTING.md 가 350+ 줄 → 큰 PR. F4-5 를 단독 PR 로 분리.

## 7. 의존성 / 영향

- F1, F2, F3 머지된 후 F4 — 재작성된 docs 가 모든 v0.4 결과 반영.
- F2 의 SELF-HOSTING.md §1.3 갱신과 F4-5 의 전면 재작성 충돌 위험 — F4-5 가 F2 결과 위에서 작성.

## 8. 완료 정의

- [ ] PR F4-1 ~ F4-7 모두 머지.
- [ ] CI 의 e2e job 이 HTTPS profile 도 green.
- [ ] dogfood: 새 호스트에서 `dev-https.sh` 한 줄 → `https://localhost:3000` 로 OAuth dance 정상.
- [ ] `docs/SELF-HOSTING.md` 전면 재작성 + `docs/migration/v0.3-to-v0.4.md` + `README.md` quickstart 머지.
- [ ] `CHANGELOG.md` v0.4.0 entry 작성 + GitHub Release.
