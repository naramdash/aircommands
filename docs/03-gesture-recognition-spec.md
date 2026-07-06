# 03. 제스처 인식 상세 사양

## 1. 목표

오른손 검지 끝 landmark 8번의 최근 좌표만으로 상하좌우 스와이프를 안정적으로 인식한다. 복잡한 손가락 자세 인식보다 현재 코드의 검지 trail 구조를 활용하는 것이 MVP에 적합하다.

## 2. 입력 데이터

MediaPipe `HandLandmarker.detectForVideo(video, now)`의 결과 중 다음 값을 사용한다.

- `result.landmarks`: `NormalizedLandmark[][]`
- `result.handednesses`: 손별 `Left`/`Right` 분류
- 오른손의 `landmarks[8]`: 검지 끝

`NormalizedLandmark`의 `x`, `y`는 0-1 범위다.

## 3. 좌표계 규칙

### 3.1 raw 좌표

MediaPipe raw 좌표:

- `x = 0`: 원본 영상 왼쪽
- `x = 1`: 원본 영상 오른쪽
- `y = 0`: 원본 영상 위
- `y = 1`: 원본 영상 아래

### 3.2 화면 표시 좌표

현재 UI는 `<video>`와 `<canvas>`에 모두 `scale-x-[-1]`을 적용한다. 따라서 raw 좌표로 Canvas에 그려도 사용자가 보는 영상과 trail은 시각적으로 맞는다.

### 3.3 사용자 기준 제스처 좌표

사용자는 거울처럼 보이는 화면을 기준으로 왼쪽/오른쪽을 인식한다. 따라서 제스처 판정에는 다음 변환을 사용한다.

```ts
function toUserFacingPoint(point: PointerTrailPoint): PointerTrailPoint {
  return {
    ...point,
    x: 1 - point.x,
  }
}
```

상하 방향은 변환하지 않는다.

## 4. trail 분리

trail은 두 용도로 나눈다.

| 용도 | 유지 시간 | 사용처 |
| --- | ---: | --- |
| 렌더링 trail | 5000ms | 화면에 초록색 선/점 표시 |
| 인식 window | 800ms | 스와이프 후보 계산 |
| 확인 window | 800ms | 검지 정지 확인 |

렌더링 trail이 길어도 인식은 항상 짧은 window만 사용해야 한다.

## 5. 스와이프 판정

### 5.1 기본 타입

```ts
type SwipeDirection = 'up' | 'down' | 'left' | 'right'

type SwipeDetectionResult =
  | {
      detected: true
      direction: SwipeDirection
      confidence: number
      startedAt: number
      endedAt: number
    }
  | {
      detected: false
      reason:
        | 'not_enough_points'
        | 'too_short'
        | 'too_slow'
        | 'too_fast'
        | 'too_diagonal'
        | 'direction_unstable'
    }
```

### 5.2 기본 threshold

초기값은 다음으로 시작한다.

```ts
const SWIPE_WINDOW_MS = 800
const SWIPE_MIN_DURATION_MS = 120
const SWIPE_MAX_DURATION_MS = 900
const SWIPE_MIN_DISTANCE = 0.12
const SWIPE_AXIS_DOMINANCE_RATIO = 0.7
const SWIPE_MAX_BACKTRACK_RATIO = 0.35
const SWIPE_MIN_POINTS = 4
```

정규화 좌표 기준 `0.12`는 화면 너비/높이의 12% 이동을 의미한다.

### 5.3 알고리즘

1. 현재 시각 `now` 기준 최근 `SWIPE_WINDOW_MS` 포인트를 가져온다.
2. 사용자 기준 좌표로 변환한다.
3. 포인트가 `SWIPE_MIN_POINTS`보다 적으면 실패한다.
4. 첫 점과 마지막 점의 `dx`, `dy`를 계산한다.
5. `duration = last.at - first.at`를 계산한다.
6. `duration`이 너무 짧거나 길면 실패한다.
7. `absDx`, `absDy` 중 큰 축을 주 방향으로 잡는다.
8. 주 방향 이동량이 `SWIPE_MIN_DISTANCE`보다 작으면 실패한다.
9. `mainAxisDistance / (absDx + absDy)`가 `SWIPE_AXIS_DOMINANCE_RATIO`보다 작으면 실패한다.
10. 중간 포인트에서 반대 방향으로 많이 되돌아가면 실패한다.
11. 방향과 confidence를 반환한다.

### 5.4 방향 판정

사용자 기준 좌표에서:

- `dy < 0`이고 y축 우세 -> `up`
- `dy > 0`이고 y축 우세 -> `down`
- `dx < 0`이고 x축 우세 -> `left`
- `dx > 0`이고 x축 우세 -> `right`

### 5.5 confidence 계산

초기 confidence는 다음 세 요소의 평균으로 계산한다.

```ts
distanceScore = clamp(mainDistance / 0.25, 0, 1)
axisScore = clamp(axisDominanceRatio, 0, 1)
smoothnessScore = 1 - clamp(backtrackRatio, 0, 1)
confidence = (distanceScore * 0.4) + (axisScore * 0.4) + (smoothnessScore * 0.2)
```

후보로 인정할 최소 confidence:

```ts
const SWIPE_MIN_CONFIDENCE = 0.65
```

## 6. backtrack 계산

스와이프 중 손이 반대 방향으로 많이 흔들리면 오인식 가능성이 높다.

예: 오른쪽 스와이프라면 각 구간의 `deltaX` 중 음수 합을 backtrack으로 본다.

```ts
function getBacktrackRatio(points, axis, expectedSign) {
  let forward = 0
  let backward = 0

  for (let i = 1; i < points.length; i += 1) {
    const delta = points[i][axis] - points[i - 1][axis]
    if (Math.sign(delta) === expectedSign) {
      forward += Math.abs(delta)
    } else {
      backward += Math.abs(delta)
    }
  }

  return backward / Math.max(forward + backward, 0.0001)
}
```

`backtrackRatio > 0.35`이면 실패한다.

## 7. 후보 안정화

스와이프 판정은 한 프레임의 결과만으로 확정하지 않는다.

```ts
const CANDIDATE_MIN_REPEAT = 2
const CANDIDATE_MAX_AGE_MS = 300
```

같은 방향 후보가 300ms 안에 2회 이상 감지되면 `candidate` 상태로 전환한다.

## 8. 확인 동작

### 8.1 검지 정지 확인

후보가 표시된 뒤 최근 800ms 동안 검지 끝이 작은 반경 안에 머무르면 실행한다.

```ts
const CONFIRM_HOLD_MS = 800
const CONFIRM_STATIONARY_RADIUS = 0.025
```

정지 판정:

1. 후보 감지 이후의 포인트만 사용한다.
2. 최근 `CONFIRM_HOLD_MS` 동안의 포인트를 가져온다.
3. 모든 포인트가 중심점에서 `CONFIRM_STATIONARY_RADIUS` 안에 있으면 확인 완료.
4. 진행률은 `heldDuration / CONFIRM_HOLD_MS`로 계산한다.

### 8.2 취소 조건

- 오른손이 사라짐
- 후보와 다른 방향의 강한 스와이프 감지
- 후보 생성 후 1200ms 경과
- 손 위치가 stationary radius 밖으로 크게 벗어남
- cooldown 중 새 실행 요청 발생

## 9. 제스처-명령 매핑

```ts
const gestureCommands = {
  swipe_up: {
    label: 'Chrome 실행',
    app: 'chrome',
  },
  swipe_down: {
    label: '메모장 실행',
    app: 'notepad',
  },
  swipe_right: {
    label: 'VS Code 실행',
    app: 'vscode',
  },
  swipe_left: {
    label: '터미널 실행',
    app: 'terminal',
  },
} as const
```

## 10. 실패 사례와 기대 동작

| 입력 | 기대 동작 |
| --- | --- |
| 손이 화면에 없음 | 후보 없음, `오른손 대기 중` |
| 검지가 작게 떨림 | 후보 없음 |
| 대각선 이동 | 후보 없음 또는 더 우세한 축만 낮은 confidence |
| 천천히 오른쪽 이동 | 후보 없음 |
| 빠르게 오른쪽 이동 후 정지 | `VS Code 실행 준비` 후 확인 진행 |
| 후보 후 손 사라짐 | 후보 취소 |
| 후보 후 1.2초 방치 | 후보 취소 |
| 실행 직후 같은 제스처 | cooldown 표시, API 미호출 |

## 11. 조정 가능한 값

처음 구현 후 실제 카메라에서 조정할 가능성이 높은 값:

- `SWIPE_MIN_DISTANCE`: 너무 민감하면 0.15로 증가, 너무 둔하면 0.10으로 감소
- `SWIPE_AXIS_DOMINANCE_RATIO`: 대각선 오인식이 많으면 0.8로 증가
- `CONFIRM_STATIONARY_RADIUS`: 확인이 어렵다면 0.035로 증가
- `CONFIRM_HOLD_MS`: 너무 느리면 600, 오작동이 많으면 1000
- `COOLDOWN_MS`: 반복 실행이 많으면 3000으로 증가

