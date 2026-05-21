# Harness Format (v1)

> 하네스 = 에이전트 실행 파이프라인(템플릿) + 행동 규칙. YAML로 정의하고, 내부적으로 정규화된 JSON IR로 변환되어 실행된다.

## 1. 최상위 스키마

```yaml
name: string                    # required, kebab-case, 사용자 내 unique
version: integer                # required, schema version (현재 1)
description: string             # optional
inputs:                         # optional, run 시 사용자 입력
  - name: string
    type: "string" | "number" | "boolean"
    required: boolean
    default: any
defaults:                       # optional, step에서 미지정 시 적용
  llm:
    provider: string            # LlmProvider.id
    model: string
rules:                          # optional
  permissions: { ... }
  policies: [ string, ... ]
  hooks: { preCommit, prePush, postRun }
steps: [ Step, ... ]            # required
```

## 2. Step 종류

### 2.1 `tool`

빌트인 도구 호출.

```yaml
- id: read-issue
  type: tool
  use: github.getIssue # 도구 식별자
  with: { number: '${inputs.issueNumber}' }
  onFail: stop # stop | continue | retry(n)
```

빌트인 도구 (MVP, 구현된 것):

- `git.createBranch`, `git.commit`, `git.push`, `git.diff` (PR #21)
- `fs.read`, `fs.write`, `fs.list` (PR #21)
- `process.run` (allow-list 통과 시) (PR #21)
- `github.openPR` (PR #28) — api 가 GithubAppService 로 호출, 클라이언트는 socket ack 받음

  ```yaml
  - id: open-pr
    type: tool
    use: github.openPR
    with:
      projectId: '${inputs.projectId}'
      head: '${steps.create-branch.output.branch}'
      title: 'auto: ${inputs.title}'
      body: |
        Generated from harness ${run.id}.
      base: main # optional, default 'main'
      draft: false # optional
  ```

빌트인 도구 (백로그):

- `github.getIssue`, `github.listPRs`, `github.comment`

### 2.2 `llm`

LLM 호출.

```yaml
- id: plan
  type: llm
  provider: 'ollama-local' # 미지정 시 defaults.llm.provider
  model: 'qwen2.5-coder:14b'
  system: 'You are a senior engineer...'
  prompt: |
    ${steps.read-issue.body}
  output: text | json # json이면 schema 강제
  schema: { ... } # output: json 일 때
```

### 2.3 `subagent`

서브에이전트 호출 (다른 하네스).

```yaml
- id: implement
  type: subagent
  agent: 'code-writer' # 다른 harness name 또는 빌트인
  input: '${steps.plan.output}'
  loopUntil: 'tests.pass == true' # optional
  maxIterations: 5
```

### 2.4 `condition`

조건 분기.

```yaml
- id: gate
  type: condition
  when: '${steps.tests.exitCode} == 0'
  then: [...steps]
  else: [...steps]
```

### 2.5 `loop`

반복.

```yaml
- id: retry-block
  type: loop
  while: '${steps.tests.exitCode} != 0'
  maxIterations: 3
  do: [...steps]
```

## 3. 컨텍스트 변수

- `${inputs.<name>}`
- `${steps.<id>.<field>}` — 각 step의 출력 필드
- `${run.id}`, `${run.branchName}`, `${run.workingDir}`
- `${project.repo}`, `${project.defaultBranch}`
- `${env.<KEY>}` — 화이트리스트된 환경변수만

표현식 평가: 안전한 JSONata 또는 jexl 서브셋 (eval 금지).

## 4. 정책 (rules)

### 4.1 permissions

```yaml
permissions:
  fs:
    allow: ['**/*.ts', '**/*.tsx', 'package.json']
    deny: ['.env*', '**/secrets/**', '**/node_modules/**']
  process:
    allow: ['git', 'pnpm', 'npm', 'node', 'python', 'pytest', 'vitest']
  network:
    allow: ['api.github.com', 'registry.npmjs.org']
```

### 4.2 policies

프롬프트에 시스템 메시지로 자동 주입되는 자연어 규칙.

```yaml
policies:
  - '한 번에 하나의 파일만 수정'
  - '테스트가 빨간색이면 진행 중단'
  - '외부 네트워크 호출 금지(허용 목록 외)'
```

### 4.3 hooks

특정 시점에 자동 실행되는 명령.

```yaml
hooks:
  preCommit: 'pnpm test --run'
  prePush: 'pnpm lint'
  postRun: 'pnpm format'
```

## 5. 실패·재시도

- step의 `onFail`:
  - `stop` (기본): 전체 run 실패
  - `continue`: 다음 step 진행, 출력은 `null`
  - `retry(n)`: n회 재시도 후 stop
- 전역 `maxIterations`: subagent/loop의 polynomial blow-up 방지

## 6. 실행 결과

각 step 종료 시 다음 필드를 출력으로 가진다:

- `output` (text 또는 객체)
- `exitCode` (process류)
- `durationMs`
- `tokens` (llm/subagent)
- `error` (실패 시)

## 7. 예시 — 전체

```yaml
name: 'fix-issue-from-github'
version: 1
description: 'GitHub 이슈 1건을 받아 수정 → 테스트 → PR'

inputs:
  - { name: issueNumber, type: number, required: true }

defaults:
  llm: { provider: 'ollama-local', model: 'qwen2.5-coder:14b' }

rules:
  permissions:
    fs: { allow: ['**'], deny: ['.env*'] }
    process: { allow: ['git', 'pnpm', 'vitest'] }
  policies:
    - '테스트가 빨간색이면 중단'
  hooks:
    preCommit: 'pnpm vitest --run --reporter=dot'

steps:
  - id: read-issue
    type: tool
    use: github.getIssue
    with: { number: '${inputs.issueNumber}' }

  - id: branch
    type: tool
    use: git.createBranch
    with: { name: 'fix/issue-${inputs.issueNumber}' }

  - id: plan
    type: llm
    prompt: |
      이슈 본문을 읽고 변경 계획을 단계별로 작성.
      ${steps.read-issue.body}

  - id: implement
    type: subagent
    agent: 'code-writer'
    input: '${steps.plan.output}'
    loopUntil: '${steps.last.testsPassed} == true'
    maxIterations: 5

  - id: pr
    type: tool
    use: github.openPullRequest
    with:
      branch: '${run.branchName}'
      title: 'fix: ${steps.read-issue.title}'
      body: "Closes #${inputs.issueNumber}\n\n${steps.plan.output}"
```
