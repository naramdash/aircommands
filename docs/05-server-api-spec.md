# 05. 서버 API 사양

## 1. 목표

클라이언트가 확정한 제스처 명령을 받아, 서버가 allowlist에 등록된 로컬 애플리케이션만 실행한다.

## 2. 현재 상태

현재 [../server/api/open-chrome.post.ts](../server/api/open-chrome.post.ts)는 이름과 달리 `app` 값을 받아 여러 앱을 실행할 수 있다.

문제:

- 경로 이름이 역할과 맞지 않는다.
- 요청 schema가 명확하지 않다.
- 중복 요청 방지가 없다.
- command 실행 함수가 API handler 안에 직접 있다.

## 3. 목표 API

```http
POST /api/apps/open
Content-Type: application/json
```

### 요청 body

```ts
type OpenAppRequest = {
  app: string
  source?: 'gesture' | 'manual' | 'debug'
  gesture?: 'swipe_up' | 'swipe_down' | 'swipe_left' | 'swipe_right'
  clientRequestId?: string
}
```

필수:

- `app`

선택:

- `source`: 기본값 `manual`
- `gesture`: source가 `gesture`일 때 권장
- `clientRequestId`: 중복 실행 방지에 사용

### 성공 응답

```ts
type OpenAppSuccess = {
  success: true
  app: string
  message: string
  requestId: string
}
```

### 실패 응답

```ts
type OpenAppFailure = {
  success: false
  app?: string
  error:
    | 'INVALID_BODY'
    | 'APPLICATION_NOT_FOUND'
    | 'DUPLICATE_REQUEST'
    | 'EXECUTION_FAILED'
  message: string
  availableApps?: string[]
  requestId: string
}
```

## 4. 앱 allowlist

[../server/utils/apps.ts](../server/utils/apps.ts)의 `AVAILABLE_APPS`를 계속 사용한다.

정책:

- `app` 비교는 lowercase로 한다.
- 등록되지 않은 앱은 실행하지 않는다.
- 요청으로 받은 값을 command 문자열에 직접 넣지 않는다.
- OS별 command는 서버 코드에 정의된 값만 사용한다.

## 5. 중복 요청 방지

서버 메모리에 최근 request id를 짧게 저장한다.

```ts
const REQUEST_DEDUPE_MS = 3000
const recentRequests = new Map<string, number>()
```

처리:

1. `clientRequestId`가 없으면 서버에서 생성한다.
2. 같은 `clientRequestId`가 `REQUEST_DEDUPE_MS` 안에 들어오면 `DUPLICATE_REQUEST`.
3. 오래된 request id는 요청마다 정리한다.

주의:

- 이 방식은 단일 로컬 서버 프로세스 기준이다.
- 분산 서버는 목표 범위가 아니다.

## 6. command runner 분리

새 파일:

```text
server/utils/app_command_runner.ts
```

사양:

```ts
export type CommandResult =
  | { success: true }
  | { success: false; message: string }

export function runAppCommand(command: string): Promise<CommandResult>
```

구현은 `child_process.exec`를 감싼다.

테스트에서는 `runAppCommand`를 mock하거나, API handler의 core function에 runner를 주입한다.

## 7. API handler 처리 순서

1. `readBody(event)`로 body 읽기
2. body가 object인지 확인
3. `app`이 비어 있지 않은 string인지 확인
4. app lowercase normalize
5. `clientRequestId` normalize 또는 생성
6. dedupe 확인
7. `getAppCommand(app)` 호출
8. command가 없으면 `APPLICATION_NOT_FOUND`
9. `runAppCommand(command)` 호출
10. 성공/실패 응답 반환

## 8. 기존 API 호환

기존 경로:

```http
POST /api/open-chrome
```

호환 정책:

- 당장 삭제하지 않는다.
- 내부적으로 새 `openApp` core function을 호출하도록 바꾼다.
- 문서와 클라이언트는 새 `/api/apps/open`을 기준으로 한다.

## 9. 오류 메시지

서버는 기계가 읽을 `error` code와 사람이 읽을 `message`를 함께 반환한다.

예:

```json
{
  "success": false,
  "app": "photoshop",
  "error": "APPLICATION_NOT_FOUND",
  "message": "등록되지 않은 앱입니다: photoshop",
  "availableApps": ["chrome", "firefox", "notepad", "vscode"],
  "requestId": "swipe-up-123"
}
```

## 10. 로그 정책

개발 중에는 다음을 `console.info` 또는 `console.warn`으로 남긴다.

- requestId
- source
- gesture
- app
- success/failure
- error code

command 문자열 전체는 필요 시 debug에서만 출력한다.

## 11. 보안 체크리스트

- [ ] 요청 app 값이 command 문자열에 결합되지 않는다.
- [ ] allowlist 미등록 앱은 실행되지 않는다.
- [ ] 빈 body, 잘못된 타입 body를 실패 처리한다.
- [ ] 중복 request id를 거부한다.
- [ ] 외부 배포 시 인증 없이는 API를 공개하지 않는다는 문서가 남아 있다.

