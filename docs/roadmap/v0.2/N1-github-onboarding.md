# N1 — GitHub onboarding overhaul

> v0.1 의 가장 큰 운영 마찰. 사용자가 GitHub App 을 손으로 만들고 ID 와 PEM 을 옮겨 붙이고 install 한 뒤
> installation ID 까지 따로 찾는 7~8 단계를 **두 번의 클릭으로** 줄인다.

## 1. Goal

- 두 가지 onboarding path 를 모두 제공:
  - **Manifest flow (기본 / 추천)** — DevGarden 이 만든 App manifest 를 GitHub 에 redirect, GitHub 가 App
    생성 + secret/PEM 발급, callback 으로 자동 저장.
  - **BYO App (fallback)** — 이미 GitHub App 이 있는 사용자가 App ID + PEM 을 한 화면에서 입력하면 즉시
    검증, installation 자동 탐색.
- OAuth user token 으로 `apps.listInstallationsForAuthenticatedUser` 를 호출해 **사용자가 install 한 inst.
  목록 + 각 inst. 의 repo 목록** 을 자동으로 가져온다 — manual installation ID 입력 폐기.
- 권한 / repo access list 가 부족하면 onboarding 화면에서 빨간 경고 + GitHub 설정 페이지로 deep link.

## 2. 결정 사항

| 항목                      | 선택                                                                                   | 이유                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Onboarding 페이지 위치    | 새 `/dashboard/onboarding` (첫 로그인 시 redirect) + `/dashboard/settings/github`      | 첫 사용자는 강제 흐름, 이후엔 settings 에서 reconfigure.    |
| Manifest 저장 방식        | API server-side env 자동 저장 (DB 에 cuid 로 키 ID 저장, secret 은 envelope-encrypted) | `.env` 재시작 강제하지 않고 hot reload 가능하게.            |
| OAuth scope 확장          | `read:user` 유지 + 새로 `repo` 추가 안 함 (App 권한으로 충분)                          | 보안 surface 최소화. installation 정보는 App JWT 로도 충분. |
| BYO 검증 시점             | 입력 즉시 (`octokit.apps.getAuthenticated`) 로 App credentials sanity check            | DB 에 저장 전에 fail-fast.                                  |
| Repo picker               | combobox + search + repo type 필터 (all / forks 제외 / private only)                   | 큰 조직은 수백 repo. 검색 필수.                             |
| Installation 권한 부족 시 | 빨간 banner + \"Update permissions on GitHub\" 버튼 (deep link)                        | 사용자가 GitHub 페이지로 한 번에 이동.                      |

## 3. 산출물

### 3.1 DB schema 변경

기존 `GithubInstance` 같은 명시적 모델 없이 env 만 썼던 부분을 정리:

```prisma
model GithubAppRegistration {
  id              String   @id @default(cuid())
  ownerId         String   @unique           // 1 owner = 1 registration (single-user MVP)
  owner           User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  source          GithubAppSource           // MANIFEST | BYO
  appId           Int
  appSlug         String?
  webhookSecret   Bytes                     // envelope-encrypted (ENCRYPTION_KEY)
  privateKeyPem   Bytes                     // envelope-encrypted
  clientId        String?
  clientSecret    Bytes?                    // envelope-encrypted (manifest 만 받음)
  htmlUrl         String?                   // App 의 GitHub 페이지
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum GithubAppSource { MANIFEST  BYO }

model GithubInstallation {
  id              String    @id @default(cuid())
  registrationId  String
  registration    GithubAppRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  installationId  Int       @unique     // GitHub's numeric ID
  accountLogin    String                // user / org login
  accountType     String                // \"User\" | \"Organization\"
  accountId       Int
  htmlUrl         String?
  permissions     Json                  // last seen permissions
  events          String[]              // last seen subscribed events
  repositorySelection String            // \"all\" | \"selected\"
  syncedAt        DateTime  @default(now())

  @@index([registrationId])
}
```

기존 `Project.githubInstallationId` 는 그대로 두되 새 `installationDbId String?` 추가 → FK 로 `GithubInstallation.id`. 마이그레이션 시 기존 row 는 numeric 매칭으로 backfill.

### 3.2 API

**Manifest flow**:

- `POST /internal/github/manifest` — 현재 호스트 URL 기반 manifest 생성, `state` 토큰 발급 후 GitHub 의 manifest endpoint URL 을 응답. web BFF 가 이걸 받아서 redirect.
- `GET /webhooks/github/manifest-callback` — GitHub 이 부르는 callback. `code` 를 `apps.createFromManifest` 로 교환해 App credentials 받아 envelope-encrypt 후 `GithubAppRegistration` 에 저장. user 의 첫 install 페이지로 redirect.

**BYO flow**:

- `POST /internal/github/registrations` — appId + privateKey (+ webhookSecret 선택) 입력. `octokit.apps.getAuthenticated` 로 검증 후 저장.

**Installations**:

- `GET /internal/github/installations?ownerId=` — OAuth user token (NextAuth session 의 `access_token`) 로 `apps.listInstallationsForAuthenticatedUser` 호출, 각 installation 의 metadata + 권한 + repo 목록까지 동기화 후 반환.
- `POST /internal/github/installations/:id/sync` — 단일 installation 의 repo 목록을 최신화.

**Repo discovery**:

- `GET /internal/github/installations/:id/repos?q=&type=` — `apps.listReposAccessibleToInstallation` (App JWT) + 검색 / 필터. 페이지네이션.

### 3.3 Web

- 새 페이지 `/dashboard/onboarding` — step indicator (1. Connect GitHub, 2. Install on accounts, 3. Pick first project).
- `apps/web/src/lib/api/github.ts` — manifest / registration / installation / repos helper.
- 기존 `/dashboard/projects/new` 를 picker 기반으로 재작성 — repo combobox + 자동 detect installation + clone path 자동 제안 (workspace/owner-repo).
- `/dashboard/settings/github` — registration 상태 + installation 목록 + 권한 점검 + \"Update permissions\" deep link.

### 3.4 보안

- App secret / PEM / webhookSecret 모두 `ENCRYPTION_KEY` 로 envelope-encrypted (AES-GCM, libsodium-style helper). DB 에는 ciphertext + nonce + tag.
- `GithubAppService.privateKey()` 가 env 우선 → 없으면 DB lookup 으로 fallback (registrationId 가 필요하므로 caller 가 ownerId 를 넘김). 마이그레이션 기간 동안 env path 도 유지.

## 4. PR 분할 plan

| #   | 제목                                                                | 핵심 변경                                                                |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `feat(api): Add GithubAppRegistration + Installation prisma models` | 마이그레이션 + envelope encryption helper.                               |
| 2   | `feat(api): BYO registration endpoint with sanity check`            | `POST /internal/github/registrations` + getAuthenticated 검증.           |
| 3   | `feat(api): Manifest flow endpoints (create + callback)`            | `/internal/github/manifest` + `/webhooks/github/manifest-callback`.      |
| 4   | `feat(api): List installations + repos for owner`                   | OAuth user token 활용 + App JWT 활용 둘 다.                              |
| 5   | `feat(web): /dashboard/onboarding (manifest + BYO) entry`           | 새 페이지 + step indicator + 두 path 모두 UI.                            |
| 6   | `feat(web): Repo picker on /dashboard/projects/new`                 | combobox + 자동 detect installation + clone path 제안 (N3 와 협업).      |
| 7   | `feat(web): /dashboard/settings/github (status + repermit)`         | 권한 / repo access 점검 + GitHub deep link.                              |
| 8   | `chore: Deprecate env GITHUB_APP_* (warn) + migrate guide`          | env 기반 path 는 1 minor 더 유지하되 boot 시 warn. SELF-HOSTING.md 갱신. |

## 5. 테스트 plan

- **단위**: envelope crypt helper, manifest URL builder, installation sync mapper.
- **통합 (api)**: registration CRUD + manifest callback (mocked GitHub) + listing endpoints with mocked octokit.
- **e2e (web)**: 새 onboarding 플로우 — manifest 가짜 callback → installation list → repo picker → 첫 project 생성.

## 6. 리스크

- **Manifest flow 의 callback URL 필요** — `AUTH_URL` 동일 origin 으로 충분. localhost 는 GitHub 가 거부 → 문서에 \"Manifest flow 는 public URL 필수\" + BYO fallback 의 가치 명시.
- **OAuth user token 의 scope** — 사용자 token 이 App installation 정보를 보려면 scope `read:org` 필요할 수 있음. NextAuth 가 발급하는 scope 확인 + 부족하면 scope 추가 또는 App JWT path 로 우회.
- **기존 사용자 마이그레이션** — env 기반으로 이미 동작 중인 인스턴스가 DB 모델로 전환되면 깨질 수 있음. 1 minor 동안 env path 병행 + 마이그레이션 가이드 + `npm run` 형태의 import 스크립트 제공.
- **OS keyring 으로 secret 옮기는 작업은 v0.3+** — v0.2 는 envelope-encrypted DB 까지가 한계.

## 7. Acceptance criteria

- [ ] 새 호스트에서 \"Continue with GitHub\" 후 onboarding 페이지로 redirect.
- [ ] Manifest flow: \"Create GitHub App\" 한 번 클릭 → GitHub 로 redirect → 돌아오면 App credentials 자동 저장 + install 화면.
- [ ] BYO flow: app ID + PEM 한 번에 붙여넣기 → 즉시 검증 → 저장.
- [ ] Installation 목록이 picker 에 자동 표시. repo combobox 가 검색 동작.
- [ ] `/dashboard/projects/new` 에서 installation ID 직접 입력 폼이 없어졌고 repo picker 만 있다.
- [ ] 권한 부족 시 onboarding 페이지가 빨간 banner + GitHub deep link 표시.
- [ ] 기존 env 기반 인스턴스가 startup 시 warning log + 마이그레이션 안내 출력.
