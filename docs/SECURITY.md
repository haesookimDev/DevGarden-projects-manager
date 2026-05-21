# Security

## 1. 위협 모델

- self-hosted, 팀 allow-list 기반 인증
- 주적: (a) 외부 인터넷의 일반 공격, (b) 잘못 동작하는 에이전트, (c) 권한 없는 사용자
- 비주적: 사용자 PC 풀 컴프로마이즈 (그 단계면 무엇이든 가능)

## 2. 인증·인가

- 사용자: GitHub OAuth → Auth.js 세션(쿠키, HttpOnly, SameSite=Lax, Secure)
- 클라이언트: per-client JWT (HS256, 30일 만료, 회전 가능)
- 권한 모델: `owner` / `member` 2단계 (MVP)
- 모든 API는 zod 기반 입력 검증

## 3. 시크릿 관리

| 시크릿                     | 보관                                                         |
| -------------------------- | ------------------------------------------------------------ |
| GitHub OAuth client secret | API 환경변수 (`.env`)                                        |
| GitHub App private key     | 파일 마운트 또는 base64 env                                  |
| Session secret             | API 환경변수                                                 |
| LLM provider API key       | DB에 AES-256-GCM envelope encryption, server master key 사용 |
| 클라이언트 페어링 토큰     | DB에 bcrypt 해시, 10분 만료, 1회용                           |

`.env`, `*.pem`은 gitignore. `.env.example`은 키 이름만 포함.

## 4. 클라이언트 격리

- Tauri의 capability + allowlist 사용
- 파일 접근: 사용자가 등록한 "프로젝트 루트 디렉토리" 하위로만. 절대경로 정규화 후 prefix 매칭
- 프로세스 실행: allow-list (`git`, `pnpm`, `npm`, `node`, `python`, 그리고 사용자가 등록한 codex CLI 등)
- 네트워크: 화이트리스트 (api.github.com, 사용자가 등록한 LLM baseUrl)

## 5. GitHub 연동 보안

- Webhook: HMAC SHA-256 서명 검증, replay 방지(timestamp ± 5분)
- Installation token: 1시간 만료, 자동 갱신
- 쓰기 API(이슈 코멘트, PR 생성): 사용자 의도 확인 후에만

## 6. 감사 로그

- 모든 mutating API 호출 (`/runs`, `/projects`, `/clients`, `/harnesses`)
- 로그 항목: 시각, userId, 메서드, 경로, IP, 결과
- 30일 보관

## 7. 의존성 관리

- `pnpm audit` CI 단계
- Dependabot으로 보안 패치 PR 자동 생성
- 메이저 업데이트는 사람이 검토
