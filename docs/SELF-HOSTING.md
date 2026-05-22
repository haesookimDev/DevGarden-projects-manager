# Self-hosting DevGarden

> 단일 호스트에 DevGarden 을 직접 운영하기 위한 가이드. 본 문서는 "처음부터 끝까지" 순서로 적었다 — 각 절을
> 그대로 따라 하면 web · api · postgres 가 동시에 healthy 상태가 되고, 첫 사용자가 로그인 가능한 상태까지 도달한다.

## 1. 준비

### 1.1 호스트 요구사항

| 항목     | 권장          | 비고                                                                                     |
| -------- | ------------- | ---------------------------------------------------------------------------------------- |
| OS       | Linux         | macOS/Windows 도 docker 만 있으면 됨. 운영용은 Linux 권장 (HTTPS 인증서 자동 갱신 편함). |
| CPU      | 2 vCPU 이상   | 컴파일은 클라이언트 PC 에서 수행됨 — 호스트는 API + Web 만.                              |
| 메모리   | 2 GB 이상     | compose 가 컨테이너당 1 GB 까지만 사용. postgres + api + web = 3 GB peak.                |
| 디스크   | 10 GB+        | DB 데이터 + 백업 + 로그.                                                                 |
| 네트워크 | 80 / 443 / 22 | 80/443 는 reverse proxy 용 (자체 도메인을 쓸 때), 22 는 ssh.                             |

### 1.2 소프트웨어

```bash
docker --version            # >= 24
docker compose version      # >= 2.20
git --version
```

> 모든 빌드는 `docker build` 안에서 일어나므로 Node·Rust 를 호스트에 설치할 필요는 없다.

### 1.3 GitHub App 설정 (한 번만)

DevGarden 은 두 종류의 GitHub 자격증명을 사용한다 — **OAuth App** (사용자 로그인) 과 **GitHub App** (저장소
접근 + webhook). 보통 같은 도메인에서 두 개를 따로 등록한다.

1. **OAuth App** 생성 — [https://github.com/settings/developers](https://github.com/settings/developers) → "New OAuth App"
   - Application name: `DevGarden (myhost)`
   - Homepage URL: `https://devgarden.example.com`
   - Authorization callback URL: `https://devgarden.example.com/api/auth/callback/github`
   - 발급된 Client ID / Secret 을 받아 `.env` 의 `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` 에 채운다.

2. **GitHub App** 생성 — [https://github.com/settings/apps](https://github.com/settings/apps) → "New GitHub App"
   - Homepage URL: 위와 동일
   - Webhook URL: `https://devgarden.example.com/webhooks/github`
   - Webhook secret: 충분히 긴 임의 문자열 (`openssl rand -base64 32`) — `.env` 의 `GITHUB_WEBHOOK_SECRET` 에 동일하게.
   - Permissions
     - Repository: Contents (read & write), Issues (read & write), Pull requests (read & write), Metadata (read).
   - Subscribe to events: `Issues`, `Pull request`, `Push`.
   - 생성 후 "Generate a private key" → `.pem` 다운로드. App ID 도 함께 메모.
   - GitHub App 을 자기 계정 / 조직에 install 해서 사용할 repo 를 선택한다.

> `GITHUB_APP_PRIVATE_KEY` 는 PEM 파일 전체를 한 줄로 (개행은 `\n` 으로) 넣거나, secret mount 로 안전하게
> 전달할 수 있다. compose override 로 `secrets:` 사용을 권장.

## 2. 첫 배포

### 2.1 코드 가져오기

```bash
git clone https://github.com/haesookimDev/DevGarden-projects-manager.git devgarden
cd devgarden
```

### 2.2 `.env` 작성

```bash
cp .env.example .env
```

`.env` 에서 채워야 할 값들:

| 키                                                  | 생성 방법 / 출처                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | 임의 (변경 권장; 외부 노출되지 않지만 백업 파일에 사용자명 포함).                                    |
| `AUTH_SECRET`                                       | `openssl rand -base64 32`                                                                            |
| `ENCRYPTION_KEY`                                    | `openssl rand -base64 32`                                                                            |
| `INTERNAL_API_SECRET`                               | `openssl rand -base64 32`                                                                            |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET`                | OAuth App 발급값 (§1.3).                                                                             |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`           | GitHub App 발급값 (§1.3).                                                                            |
| `GITHUB_WEBHOOK_SECRET`                             | GitHub App Webhook secret 과 **동일** 값.                                                            |
| `OWNER_GITHUB_LOGINS`                               | 로그인 허용할 GitHub login. 콤마 구분.                                                               |
| `AUTH_URL`                                          | 브라우저로 접근하는 **web** 주소 (예: `http://localhost:3000`). OAuth callback redirect_uri 의 base. |
| `NEXT_PUBLIC_API_URL`                               | 브라우저가 접근하는 api 주소. 보통 `https://devgarden.example.com`.                                  |

> ⚠ OAuth App 의 "Authorization callback URL" 은 **`${AUTH_URL}/api/auth/callback/github`** 와 정확히 일치해야 한다. 안 그러면 로그인 후 GitHub 가 `redirect_uri_mismatch` 로 거절한다. 로컬 테스트라면 OAuth App 의 callback URL 을 `http://localhost:3000/api/auth/callback/github` 로 등록.

### 2.3 띄우기

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

빌드는 처음에 5~15 분 (Tauri 빌드는 포함되지 않음 — 클라이언트는 별도). 다음 명령으로 모두 healthy 인지 확인:

```bash
docker compose -f infra/docker-compose.yml ps
```

`STATUS` 가 모두 `(healthy)` 가 되면 준비 완료. `(unhealthy)` 라면 §6 troubleshooting 참고.

### 2.4 첫 로그인

브라우저로 `NEXT_PUBLIC_API_URL` 도메인에 접속 → "Continue with GitHub" → OAuth dance 후 `/dashboard` 도달.
`OWNER_GITHUB_LOGINS` 에 포함된 계정만 통과한다.

## 3. 데스크탑 클라이언트 페어링

1. 웹 대시보드 → "Add client" → 클라이언트 이름 입력 → 1회용 페어링 토큰 발급.
2. 자기 PC 에 데스크탑 클라이언트를 빌드 또는 설치 ([apps/client](../apps/client) `pnpm tauri build`).
3. 클라이언트 앱 열기 → API base URL + 페어링 토큰 입력 → "Pair this client".
4. 페어링되면 토큰은 자동으로 OS-local store 에 저장된다 (현재는 `tauri-plugin-store` plain JSON;
   keychain 전환은 v0.2 백로그).

## 4. 백업 / 복구

### 4.1 백업

```bash
./infra/backup.sh                  # 즉시 1 회 dump
./infra/backup.sh --keep 14        # cron 으로 매일 → 14 일분 보관
```

cron 예시 (`crontab -e`):

```cron
0 3 * * * cd /opt/devgarden && ./infra/backup.sh --keep 14 >> /var/log/devgarden-backup.log 2>&1
```

### 4.2 외부 보관

`infra/backups/` 는 호스트 디스크에 남으므로 호스트가 죽으면 사라진다. S3/Backblaze/외장 디스크로 한 단계 더
복사하는 작업은 자체 환경에 맞춰 구성:

```bash
aws s3 sync infra/backups/ s3://my-bucket/devgarden/
# 또는
rsync -av infra/backups/ user@offsite-host:/data/devgarden-backups/
```

### 4.3 복구

```bash
./infra/restore.sh ./infra/backups/devgarden-20260521T030000Z.sql.gz --yes
docker compose -f infra/docker-compose.yml restart api
```

> `restore.sh` 는 public 스키마를 DROP 한 뒤 dump 를 적재하기 때문에 **현재 데이터를 영구히 잃는다**. 운영 환경에서
> 시험하기 전에 staging 호스트에서 reproducible 한지 확인할 것.

## 5. 업그레이드

```bash
git fetch origin
git checkout main
git pull --ff-only
docker compose -f infra/docker-compose.yml pull          # base images
docker compose -f infra/docker-compose.yml up -d --build # rebuild + 재기동
```

Prisma migration 은 api 컨테이너 부팅 시 `migrate deploy` 가 자동 실행된다 (Dockerfile 에 포함). 그래서 별도
명령은 필요 없지만, 안전을 위해 업그레이드 직전에 백업을 하나 더 떠두는 게 좋다:

```bash
./infra/backup.sh && docker compose -f infra/docker-compose.yml up -d --build
```

## 6. Troubleshooting

### 6.1 `STATUS` 가 `(unhealthy)`

```bash
docker compose -f infra/docker-compose.yml logs --tail=200 api
docker compose -f infra/docker-compose.yml logs --tail=200 postgres
```

- `api unhealthy` 인데 postgres 는 healthy → `/healthz/ready` 가 503 — 보통 DATABASE_URL 오타, 또는 마이그레이션 실패. api 로그 확인.
- `web unhealthy` → `/api/healthz` 가 응답 못 함 — Next 가 부팅 실패. web 로그에서 `Error:` 스택 확인.

### 6.1.0 데스크탑 클라이언트가 "Load failed" 로 페어링 실패

macOS WKWebView 가 CORS 에 의해 차단됐을 때 보여주는 메시지. api 가 응답하지만 `Access-Control-Allow-Origin` 헤더가 없어서 브라우저가 응답을 버린다. v0.1 부터 api 는 `tauri://localhost` / `https://tauri.localhost` 를 기본 allow-list 에 포함한다 — 그 외 origin 에서 호출하려면 `.env` 에 `CORS_ALLOW_ORIGINS=https://your-origin` 을 추가.

확인: `docker compose -f infra/docker-compose.yml logs --tail=50 api | grep CORS` 로 거절 로그 확인.

### 6.1.1 로그인 시 GitHub 에서 `redirect_uri_mismatch` 또는 callback 이 `0.0.0.0` 으로 감

`AUTH_URL` 미설정이거나 OAuth App 의 callback URL 이 일치하지 않을 때. 둘 다 확인:

- `.env` 의 `AUTH_URL` 이 브라우저로 접근하는 web 주소와 같은지 (예: `http://localhost:3000`).
- GitHub OAuth App 의 "Authorization callback URL" 이 `${AUTH_URL}/api/auth/callback/github` 와 정확히 일치하는지 (path 포함, trailing slash 없이).

수정 후 web 컨테이너만 재시작: `docker compose -f infra/docker-compose.yml up -d --force-recreate web`.

### 6.2 로그인했는데 dashboard 진입 직후 401

- `INTERNAL_API_SECRET` 가 web 과 api 컨테이너에서 다를 때. .env 한 곳에서 동일하게 관리하고 두 컨테이너 모두
  rebuild.

### 6.3 webhook 이 안 들어옴

- GitHub Webhook deliveries 페이지에서 redelivery 시도 → 401 / 504 등 응답 확인.
- 401 → `GITHUB_WEBHOOK_SECRET` 미스매치. `.env` 와 GitHub App 양쪽 동일하게.
- 504 → api 가 reverse proxy 뒤에 있고 raw body 가 변조되어 HMAC 실패. nginx 라면 `proxy_request_buffering on;`
  유지 + body 변경 금지.

### 6.4 디스크가 가득 참

- 백업 dir 비대 → `--keep N` 옵션 + 외부 보관 (§4.2).
- docker 로그 비대 → 본 PR 의 prod compose 가 이미 `max-size: 10m × 3` 으로 제한. 추가로 줄이고 싶다면
  `docker system prune -a` 로 사용하지 않는 이미지 정리.

## 7. 보안 체크리스트

- [ ] `.env` 파일은 호스트 외부에 절대 노출하지 않는다 (이미 `.gitignore`).
- [ ] `GITHUB_APP_PRIVATE_KEY` 는 가능하면 `secrets:` 마운트로 (env var 평문 전달 회피).
- [ ] HTTPS 종단은 reverse proxy (Caddy / nginx / Traefik) 에서. 자체 서명 인증서로는 GitHub OAuth 가 실패한다.
- [ ] `OWNER_GITHUB_LOGINS` 가 의도한 사람만 포함하는지 확인.
- [ ] `INTERNAL_API_SECRET` 는 외부에 노출되면 절대 안 됨 — 평문 ws auth.token 으로도 사용되므로 TLS 필수.
- [ ] 정기 백업이 실제로 돌고 있는지 cron 로그 / 별도 모니터로 확인.

## 8. 다음 단계

- 분석/메트릭 → 대시보드: [`/dashboard/runs`](../README.md) (cost / success rate) 와 [`/dashboard/tasks`](../README.md) (GitHub issues + 내부 todo).
- 자동 PR 생성 흐름은 [`docs/HARNESS-FORMAT.md`](./HARNESS-FORMAT.md) 의 `github.openPR` 예시 참고.
- 운영 중 발견된 버그 / 요청은 GitHub Issues 로 — webhook 으로 자동 mirror 된다.
