# 02. 시스템 아키텍처

## 1. 현재 구조

```text
app/
  app.vue                         # 카메라, MediaPipe 호출, Canvas trail 렌더링
  utils/
    hand_landmark_detection.ts     # MediaPipe FilesetResolver, HandLandmarker 초기화
server/
  api/
    open-chrome.post.ts            # 현재 앱 실행 API
  utils/
    apps.ts                        # OS별 앱 실행 allowlist
docs/
  *.md                             # 구현 문서
```

현재 앱은 `ssr: false` Nuxt SPA로 동작한다. 브라우저에서 카메라와 MediaPipe가 실행되고, 서버는 로컬 앱 실행 요청을 처리한다.

## 2. 목표 구조

```text
app/
  app.vue
  utils/
    hand_landmark_detection.ts
    gesture_command_detection/
      types.ts
      coordinates.ts
      pointer_trail.ts
      swipe.ts
      confirmation.ts
      command_map.ts
      state_machine.ts
server/
  api/
    apps/
      open.post.ts
    open-chrome.post.ts
  utils/
    apps.ts
    app_command_runner.ts
```

## 3. 모듈 책임

### app.vue

책임:

- 카메라 시작/정지
- `handLandmarker.detectForVideo` 호출
- 매 프레임 landmark 결과를 인식 모듈에 전달
- Canvas trail 렌더링
- 상태 UI 표시
- 앱 실행 API 호출

비책임:

- 스와이프 판정 수식 직접 구현
- 앱별 실행 command 관리
- 서버 allowlist 검증

### hand_landmark_detection.ts

책임:

- MediaPipe WASM path 설정
- `hand_landmarker.task` 모델 로딩
- `HandLandmarker` 인스턴스 생성

주의:

- 현재 `numHands: 2`로 설정되어 있으나 MVP 명령 입력은 오른손만 사용한다.
- 이 파일은 top-level await를 사용하므로 import 시점에 초기화가 완료된다.

### gesture_command_detection/types.ts

공용 타입을 둔다.

```ts
export type Handedness = 'Left' | 'Right' | 'Unknown'

export type PointerTrailPoint = {
  x: number
  y: number
  at: number
}

export type GestureName =
  | 'swipe_up'
  | 'swipe_down'
  | 'swipe_left'
  | 'swipe_right'

export type RecognitionState =
  | 'camera_idle'
  | 'tracking'
  | 'candidate'
  | 'confirming'
  | 'executing'
  | 'cooldown'
  | 'error'

export type GestureCandidate = {
  gesture: GestureName
  app: string
  label: string
  confidence: number
  detectedAt: number
}
```

### coordinates.ts

책임:

- raw MediaPipe 좌표를 사용자 화면 기준 좌표로 변환
- 현재 CSS mirror 정책을 한 곳에 캡슐화

현재 `<video>`와 `<canvas>` 모두 `scale-x-[-1]`로 뒤집혀 있다. Canvas에 raw 좌표로 그리면 영상과 맞지만, 사용자가 보는 오른쪽/왼쪽 제스처를 판정할 때는 x축 변환이 필요하다.

```ts
export function toUserFacingPoint(point: PointerTrailPoint): PointerTrailPoint {
  return {
    ...point,
    x: 1 - point.x,
  }
}
```

### pointer_trail.ts

책임:

- 최근 N ms 포인트 유지
- 렌더링용 5초 trail과 인식용 0.8초 window 분리
- 손 미감지 시 trail pruning

### swipe.ts

책임:

- 포인트 배열에서 스와이프 후보 계산
- threshold와 confidence 계산
- DOM과 MediaPipe에 의존하지 않는 순수 함수 제공

### confirmation.ts

책임:

- 후보 명령이 뜬 뒤 검지가 정지했는지 판정
- 확인 진행률 계산
- timeout/cancel 조건 제공

### command_map.ts

책임:

- 제스처와 앱 실행 명령 매핑
- UI label 제공
- 서버로 보낼 `app` 값 제공

### state_machine.ts

책임:

- 매 프레임 입력을 받아 `RecognitionState`와 후보/실행 상태 갱신
- cooldown, timeout, hand missing 정책 관리

주의:

- 외부 라이브러리 없이 단순 reducer 함수로 시작한다.
- 상태가 복잡해진 뒤에만 XState 같은 라이브러리를 다시 검토한다.

### server/api/apps/open.post.ts

책임:

- 앱 실행 요청 body 검증
- allowlist 확인
- 중복 `clientRequestId` 방지
- command runner 호출
- 성공/실패 응답 반환

### server/utils/app_command_runner.ts

책임:

- `child_process.exec` 래핑
- 테스트에서 mock 가능하도록 분리

## 4. 런타임 데이터 흐름

```text
Webcam
  -> HTMLVideoElement
  -> HandLandmarker.detectForVideo(video, now)
  -> result.landmarks + result.handednesses
  -> right hand landmark 선택
  -> index tip landmark 8 추출
  -> pointer trail update
  -> user-facing coordinate 변환
  -> swipe candidate detection
  -> recognition reducer
  -> candidate/confirming/executing UI
  -> POST /api/apps/open
  -> server allowlist lookup
  -> OS command exec
  -> API response
  -> success/error/cooldown UI
```

## 5. 클라이언트 상태 전이

```text
camera_idle
  -> tracking              카메라 시작 및 video ready
tracking
  -> candidate             안정적인 스와이프 후보 감지
  -> error                 카메라/MediaPipe 오류
candidate
  -> confirming            후보 표시 후 검지 정지 시작
  -> tracking              timeout, 손 사라짐, 다른 gesture
confirming
  -> executing             0.8초 정지 확인 완료
  -> tracking              timeout 또는 손 사라짐
executing
  -> cooldown              API 성공/실패 응답 수신
  -> error                 네트워크/예외
cooldown
  -> tracking              2초 경과
error
  -> tracking              복구 가능한 오류 clear
  -> camera_idle           카메라 정지
```

## 6. 서버 데이터 흐름

```text
POST /api/apps/open
  -> readBody
  -> validate body
  -> normalize app name
  -> dedupe clientRequestId
  -> getAppCommand(app)
  -> exec(command)
  -> response
```

## 7. 보안 경계

신뢰 경계는 클라이언트와 서버 API 사이에 있다.

- 클라이언트의 `app` 값은 신뢰하지 않는다.
- 서버의 `AVAILABLE_APPS`가 유일한 실행 허용 목록이다.
- command 문자열은 서버 코드에 하드코딩된 값만 사용한다.
- query/body의 값은 command에 직접 연결하지 않는다.
- 외부 네트워크에 공개할 경우 인증 없이는 사용하면 안 된다.

## 8. 성능 고려

- `detectForVideo`는 매 `requestAnimationFrame`에서 호출할 수 있지만, 성능이 낮으면 30fps 이하로 제한한다.
- trail 렌더링은 Canvas 2D로 유지한다. DOM/SVG 노드를 포인트마다 만들지 않는다.
- 제스처 판정은 최근 0.8초 포인트만 대상으로 한다.
- 5초 trail은 렌더링 목적이므로 최대 포인트 수를 제한할 수 있다. 예: 300개.

