# infra/ — operational tooling

본 디렉터리는 self-hosted 배포에서 사용하는 docker compose 파일과 운영 스크립트를 모은다. 본격적인 setup
절차는 [`docs/SELF-HOSTING.md`](../docs/SELF-HOSTING.md) 를 참조.

## Files

| 파일                                                 | 용도                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| [`docker-compose.yml`](./docker-compose.yml)         | Production compose — web · api · postgres + healthchecks    |
| [`docker-compose.dev.yml`](./docker-compose.dev.yml) | 개발용 — Postgres 한 컨테이너만 (web/api 는 호스트에서 dev) |
| [`backup.sh`](./backup.sh)                           | Postgres `pg_dump` 를 `./backups/` 에 gzip 으로 저장        |
| [`restore.sh`](./restore.sh)                         | 백업 파일에서 DB 를 복구 (DESTRUCTIVE — 확인 후 실행)       |

## Healthchecks

세 서비스 모두 healthcheck 가 정의돼 있어 `docker compose ps` 가 "healthy / unhealthy" 를 정확히 보고한다.

- **postgres** → `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB`
- **api** → `wget /healthz/ready` (api 가 Postgres 도 동시에 reachable 한지 확인)
- **web** → `wget /api/healthz` (Next 프로세스 liveness)

depends_on `condition: service_healthy` 체인 덕에 부팅 순서가 자동으로 보장된다 (postgres → api → web).

## Logging / 리소스 제한

`x-logging` 앵커로 모든 서비스에 JSON 로그 회전 (10 MB × 3 파일) 을 걸어 디스크 폭주를 막는다. 각 컨테이너는
1 GB 메모리 제한 (`deploy.resources.limits.memory`) 으로 한 컨테이너가 호스트 자원을 다 잡아먹는 사고를
방지한다. 더 큰 인스턴스가 필요하면 prod 환경에 맞춰 조정.

## Multi-instance (v0.3 P1)

기본 compose 는 단일 api 인스턴스. 두 대 이상 띄우려면 알림 SSE 와 socket.io broadcast 가 인스턴스 간 fan-out 되도록 Redis 가 필요하다.

```bash
# bundled redis 와 함께 부팅. api 는 REDIS_URL 을 자동 사용.
REDIS_URL=redis://redis:6379 docker compose \
  -f infra/docker-compose.yml \
  --profile multi-instance up -d

# 그 다음에 api 만 scale=2 로 (별도 override 파일 또는 swarm/compose v2 의
# replicas 사용). container_name 충돌 회피를 위해 override 가 필요한 점에 유의.
```

- `--profile multi-instance` 없이는 `redis` 서비스가 안 뜸 → 단일 인스턴스 사용자에게 추가 컨테이너 부담 없음.
- 외부 Redis 가 이미 있으면 `REDIS_URL=rediss://...` 만 환경에 주면 됨. profile 은 불필요.
- 자세한 내용: [`docs/SELF-HOSTING.md`](../docs/SELF-HOSTING.md) §6.3 다중 인스턴스 주의.

## Backup

```bash
./infra/backup.sh                # 최신 dump 1 개 추가
./infra/backup.sh --keep 7       # 최신 7 개만 유지, 나머지 prune
```

- 결과: `./infra/backups/devgarden-<UTC timestamp>.sql.gz`
- crontab 예시: `0 3 * * * cd /opt/devgarden && ./infra/backup.sh --keep 14`

## Restore

```bash
./infra/restore.sh ./infra/backups/devgarden-20260521T120000Z.sql.gz --yes
docker compose -f infra/docker-compose.yml restart api
```

- 실수 방지를 위해 `--yes` 또는 `CONFIRM=yes` 환경변수가 없으면 거부됨.
- 복구는 public 스키마를 DROP 후 재생성한다 — 데이터를 영구히 잃는다.
- 복구 후 api 컨테이너를 restart 해서 Prisma 의 prepared statement 캐시를 비울 것.
