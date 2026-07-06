# 04. 클라이언트 구현 사양

## 1. 구현 목표

[../app/app.vue](../app/app.vue)의 현재 검지 trail 프로토타입을 유지하면서, 제스처 후보 인식, 확인 동작, API 호출, 상태 UI를 추가한다.

## 2. 구현 파일

새 파일:

```text
app/utils/gesture_command_detection/
  types.ts
  coordinates.ts
  pointer_trail.ts
  swipe.ts
  confirmation.ts
  command_map.ts
  recognition_reducer.ts
```

수정 파일:

```text
app/app.vue
```

## 3. 타입 사양

`types.ts`

```ts
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Handedness = 'Left' | 'Right' | 'Unknown'

export type HandednessCategory = {
  categoryName?: string
  displayName?: string
}

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

export type AppName = 'chrome' | 'notepad' | 'vscode' | 'terminal'

export type GestureCommand = {
  gesture: GestureName
  app: AppName
  label: string
}

export type GestureCandidate = GestureCommand & {
  confidence: number
  detectedAt: number
}

export type RecognitionState =
  | 'tracking'
  | 'candidate'
  | 'confirming'
  | 'executing'
  | 'cooldown'
  | 'error'

export type HandFrame = {
  landmarks: NormalizedLandmark[] | null
  handedness: Handedness
  at: number
}
```

## 4. 좌표 변환

`coordinates.ts`

필수 함수:

```ts
export function toUserFacingPoint(point: PointerTrailPoint): PointerTrailPoint
export function getHandedness(categories?: HandednessCategory[]): Handedness
export function getRightHandIndex(handednesses?: HandednessCategory[][]): number
```

규칙:

- Canvas 렌더링에는 raw 좌표를 사용한다.
- 제스처 판정에는 `toUserFacingPoint`를 적용한다.
- `getRightHandIndex`가 `-1`이면 그 프레임은 오른손 없음으로 처리한다.

## 5. pointer trail 관리

`pointer_trail.ts`

상수:

```ts
export const RENDER_TRAIL_MS = 5000
export const RECOGNITION_WINDOW_MS = 800
export const MAX_RENDER_TRAIL_POINTS = 300
```

필수 함수:

```ts
export function pruneTrail(
  points: PointerTrailPoint[],
  now: number,
  maxAgeMs: number,
): PointerTrailPoint[]

export function getRecentPoints(
  points: PointerTrailPoint[],
  now: number,
  windowMs: number,
): PointerTrailPoint[]

export function appendTrailPoint(
  points: PointerTrailPoint[],
  point: PointerTrailPoint,
): PointerTrailPoint[]
```

요구사항:

- `appendTrailPoint`는 `MAX_RENDER_TRAIL_POINTS`를 넘으면 오래된 점부터 제거한다.
- 인식 함수에는 `getRecentPoints(points, now, 800)` 결과를 넘긴다.
- 렌더링에는 `pruneTrail(points, now, 5000)` 결과를 사용한다.

## 6. 스와이프 판정

`swipe.ts`

상수는 [03-gesture-recognition-spec.md](./03-gesture-recognition-spec.md)의 값을 사용한다.

필수 함수:

```ts
export function detectSwipeGesture(
  rawPoints: PointerTrailPoint[],
  now: number,
): SwipeDetectionResult
```

중요:

- 함수 내부에서 raw point를 사용자 기준 좌표로 변환한다.
- DOM, Vue ref, MediaPipe 객체를 참조하지 않는다.
- 테스트 가능한 순수 함수여야 한다.

## 7. 확인 동작

`confirmation.ts`

필수 함수:

```ts
export function getConfirmationProgress(
  points: PointerTrailPoint[],
  candidateDetectedAt: number,
  now: number,
): {
  confirmed: boolean
  progress: number
  reason?: 'not_enough_time' | 'moved_too_far' | 'not_enough_points'
}
```

기준:

- `CONFIRM_HOLD_MS = 800`
- `CONFIRM_STATIONARY_RADIUS = 0.025`
- `progress`는 0-1 범위

## 8. 명령 매핑

`command_map.ts`

```ts
export const gestureCommands = {
  swipe_up: { gesture: 'swipe_up', label: 'Chrome 실행', app: 'chrome' },
  swipe_down: { gesture: 'swipe_down', label: '메모장 실행', app: 'notepad' },
  swipe_right: { gesture: 'swipe_right', label: 'VS Code 실행', app: 'vscode' },
  swipe_left: { gesture: 'swipe_left', label: '터미널 실행', app: 'terminal' },
} as const

export function mapGestureToCommand(gesture: GestureName): GestureCommand
```

## 9. 상태 reducer

`recognition_reducer.ts`

상태 데이터:

```ts
export type RecognitionContext = {
  state: RecognitionState
  candidate: GestureCandidate | null
  confirmationProgress: number
  lastExecutedAt: number
  cooldownUntil: number
  errorMessage: string
}
```

이벤트:

```ts
export type RecognitionEvent =
  | { type: 'FRAME'; points: PointerTrailPoint[]; now: number; rightHandVisible: boolean }
  | { type: 'EXECUTE_START'; now: number }
  | { type: 'EXECUTE_SUCCESS'; now: number }
  | { type: 'EXECUTE_FAILURE'; now: number; message: string }
  | { type: 'RESET' }
```

정책:

- `tracking`에서 안정적인 swipe가 감지되면 `candidate`.
- `candidate`에서 확인 progress가 0보다 커지면 `confirming`.
- `confirming`에서 confirmed가 true이면 `executing`을 위한 플래그를 반환한다.
- 실제 API 호출은 reducer 밖 `app.vue`에서 수행한다.
- API 완료 후 `cooldownUntil = now + 2000`.

## 10. app.vue 통합 흐름

`drawPointerFrame`에서 해야 할 일:

1. video/canvas/context 확인
2. `detectForVideo(video, now)`
3. 오른손 index tip 추출
4. `pointerTrail` 갱신
5. `recognitionContext` 갱신
6. 필요하면 API 호출
7. Canvas trail 렌더링
8. `requestAnimationFrame(drawPointerFrame)`

API 호출은 같은 프레임에서 여러 번 발생하지 않도록 `isExecutingRequest` 플래그를 둔다.

```ts
let isExecutingRequest = false

async function executeCandidate(candidate: GestureCandidate) {
  if (isExecutingRequest) return
  isExecutingRequest = true
  try {
    const response = await $fetch('/api/apps/open', {
      method: 'POST',
      body: {
        app: candidate.app,
        source: 'gesture',
        gesture: candidate.gesture,
        clientRequestId: `${candidate.gesture}-${candidate.detectedAt}`,
      },
    })
    // success/failure event dispatch
  } finally {
    isExecutingRequest = false
  }
}
```

## 11. UI 사양

현재 상태 패널 3칸을 5칸으로 확장한다.

| 항목 | 표시 예 |
| --- | --- |
| 상태 | 추적 중, 실행 준비, 확인 중, 실행 중, 대기 |
| 현재 후보 | Chrome 실행 |
| 확인 | 65% |
| 기록 | 128 |
| 유지 | 5초 |

아래에는 지원 명령 목록을 표시한다.

```text
위로: Chrome
아래로: 메모장
오른쪽: VS Code
왼쪽: 터미널
```

## 12. 렌더링 사양

Canvas 렌더링은 현재 방식 유지:

- 점: 반지름 3.5 기준
- 선: 2px
- 색상: `rgb(34, 197, 94)`
- 오래된 점/선은 alpha 감소

명령 후보가 있는 경우 현재 검지 위치 주변에 확인 progress ring을 추가할 수 있다. 이 ring도 Canvas로 그린다.

## 13. 구현 시 주의사항

- `pointerTrail`을 Vue ref로 만들 필요는 없다. 매 프레임 전체 배열 reactive update는 비용이 크다.
- 화면에 보여야 하는 값만 `ref`로 둔다.
- API 실행 상태는 프레임 루프와 분리한다.
- 손이 사라졌을 때 trail은 5초 동안 사라지게 둘 수 있지만 후보는 즉시 취소한다.
- dev server 자동 실행 금지 지침을 지킨다.

