# Planar Overlap and Depth Hardening

## Problem

현재 접촉 인식은 MediaPipe fingertip landmark의 화면 평면 좌표를 기준으로
손가락 끝 사이의 거리를 계산한다. 이 방식은 손이 카메라를 정면으로 향하지
않고, 카메라 시선 방향으로 세워지거나 비스듬히 돌아가면 취약하다.

그 자세에서는 실제 3D 공간에서는 손가락이 떨어져 있어도 2D 화면에서는
손끝들이 겹쳐 보인다. 그러면 시스템은 다음을 구분하기 어렵다.

- 실제 접촉
- 깊이 방향으로 겹쳐 보이는 비접촉
- 손가락이 손바닥 뒤에 가려진 상태
- MediaPipe landmark가 흔들리며 임시로 가까워진 상태

즉, 이 문제는 단순 threshold 튜닝으로 해결할 문제가 아니다. 2D 평면 거리만
보고 접촉을 판단하는 구조 자체가 깊이 방향 occlusion에 약하다.

## Current Weak Point

현재 접촉 후보는 대략 다음 흐름으로 결정된다.

```text
fingertipDistance2D / handScale2D -> normalizedDistance
```

이 값이 `TOUCH_ENTER_DISTANCE`보다 작으면 접촉 시작으로 본다. 양손 접촉은
왼손 fingertip 5개와 오른손 fingertip 5개 사이의 25개 거리를 비교하고, 한 손
접촉은 같은 손의 엄지와 검지/중지/약지 사이 거리를 비교한다.

문제는 `x/y` 화면 좌표의 거리가 작다는 사실이 실제 접촉을 의미하지 않는다는
점이다. 특히 다음 자세에서 오탐이 늘어난다.

- 손날이 카메라를 향하는 자세
- 손가락들이 서로 앞뒤로 겹친 자세
- 엄지나 약지가 다른 손가락 뒤로 가려지는 자세
- 손이 너무 가까워 손가락 landmark가 불안정한 자세

## Goal

접촉 인식을 다음 기준으로 바꿔야 한다.

```text
가까워 보이는가?  -> 부족함
실제로 접촉 가능한 손 자세인가? -> 필요
접촉 후보가 시간적으로 안정적인가? -> 필요
깊이/가림 상태가 안전한가? -> 필요
```

좋은 UX는 모든 자세를 억지로 인식하는 것이 아니다. 인식하기 나쁜 자세에서는
명령을 실행하지 않고, 사용자에게 손을 펴거나 카메라와 평행하게 돌리라는
피드백을 주는 쪽이 더 안전하다.

## Recommended Design

### 1. 3D Distance Gate

MediaPipe landmark에는 `z` 값이 있다. 절대 깊이로 신뢰하기는 어렵지만,
같은 손 안에서 상대 깊이 차이를 보는 데는 쓸 수 있다.

현재:

```text
distance2D = hypot(dx, dy)
normalized = distance2D / handScale2D
```

개선:

```text
distance3D = sqrt(dx^2 + dy^2 + (zWeight * dz)^2)
normalized = distance3D / handScale3D
```

권장:

- `zWeight`는 바로 크게 두지 말고 `0.4 ~ 0.8` 사이에서 시작한다.
- 2D 거리는 가까운데 `z` 차이가 큰 후보는 접촉으로 보지 않는다.
- 양손 접촉보다 한 손 접촉에서 더 강하게 적용한다. 한 손 내부 접촉은
  occlusion 오탐이 더 쉽게 생긴다.

### 2. Hand Orientation Quality

손이 카메라에 너무 세워져 있으면 접촉 판정을 보류해야 한다. 손바닥 폭이
화면에서 충분히 보이는지 검사한다.

사용 landmark:

- wrist: `0`
- index MCP: `5`
- pinky MCP: `17`
- middle MCP: `9`

예시 지표:

```text
palmWidth2D = distance2D(indexMcp, pinkyMcp)
palmDepthSpread = abs(indexMcp.z - pinkyMcp.z)
orientationRisk = palmDepthSpread / max(palmWidth2D, epsilon)
```

또는:

```text
projectedPalmQuality = palmWidth2D / distance3D(indexMcp, pinkyMcp)
```

판정:

- `projectedPalmQuality`가 낮으면 손이 화면 평면에서 납작하게 접힌 것이다.
- 이 상태에서는 접촉 후보를 만들지 않는다.
- UI에는 `손을 카메라와 더 평행하게 돌리세요` 같은 상태를 표시한다.

### 3. Finger Visibility and Separation Gate

후보 손가락 끝만 보는 것은 부족하다. 손가락이 실제로 보이는 자세인지도 봐야
한다.

한 손 접촉 예시:

- 엄지 + 검지
- 엄지 + 중지
- 엄지 + 약지

추가 조건:

- target finger의 MCP/PIP/DIP/TIP 체인이 너무 한 점에 겹치면 보류한다.
- thumb tip과 target tip이 가깝더라도, target finger가 다른 손가락 뒤에
  묻혀 있으면 보류한다.
- 같은 손의 여러 fingertip이 동시에 거의 같은 위치에 몰리면 보류한다.

간단한 지표:

```text
fingerSpread = average pairwise distance among visible fingertips
```

`fingerSpread`가 너무 낮으면 손가락들이 화면상에서 겹친 자세로 보고 접촉
명령을 막는다.

### 4. Contact Candidate Stability

현재 hold time은 접촉 후보가 일정 시간 유지되는지 본다. 여기에 후보 품질도
같이 누적해야 한다.

현재:

```text
sameGesture && distanceWithinExitThreshold && heldFor280ms
```

개선:

```text
sameGesture
&& distanceWithinExitThreshold
&& orientationQualityGood
&& zSeparationAcceptable
&& candidateRankStable
&& heldFor280ms
```

`candidateRankStable`은 가까운 후보 1위가 프레임마다 바뀌지 않는지 보는 값이다.
손이 겹친 자세에서는 엄지+검지, 엄지+중지, 엄지+약지 후보가 빠르게 뒤집힐 수
있다. 이런 경우는 접촉이 아니라 occlusion 또는 landmark jitter로 보는 편이
맞다.

### 5. Ambiguous State in UI

나쁜 자세에서 조용히 실패하면 사용자는 원인을 모른다. 따라서 인식 상태에
`ambiguous` 또는 `poor_pose` 계열 상태를 추가하는 것이 좋다.

표시 예시:

- `손가락이 겹쳐 보입니다`
- `손을 카메라와 더 평행하게 돌리세요`
- `접촉 후보가 불안정합니다`

이 피드백은 명령표보다 카메라 위 overlay에 작게 표시하는 것이 낫다. 사용자는
표를 보고 있는 것이 아니라 손을 움직이고 있기 때문이다.

## Implementation Plan

### Phase 1: Low-risk Guards

1. `Point3D` 또는 `LandmarkPoint` 타입을 추가해 fingertip의 `z`를 보존한다.
2. `getFingerTips`가 `{ x, y, z }`를 반환하게 한다.
3. 2D distance와 별도로 `normalizedDepthDelta`를 계산한다.
4. 한 손 접촉에서 `z` 차이가 큰 후보를 reject한다.
5. 손가락 spread가 너무 낮으면 `closestContact = null`로 둔다.

이 단계는 명령 매핑을 바꾸지 않고 오탐만 줄인다.

### Phase 2: Orientation Quality

1. 손별 `handPoseQuality`를 계산한다.
2. `TwoHandTouchFrame`에 `leftPoseQuality`, `rightPoseQuality`를 추가한다.
3. `recognition_reducer`에서 pose quality가 낮으면 접촉 상태를 시작하지 않는다.
4. UI 상태 패널에 poor pose 메시지를 표시한다.

### Phase 3: Candidate Stability

1. 최근 `N = 5 ~ 8` 프레임의 후보 gesture와 normalized distance를 저장한다.
2. 후보 gesture가 자주 바뀌면 hold progress를 증가시키지 않는다.
3. distance가 threshold 안에 있어도 품질이 낮으면 progress를 감소 또는 reset한다.

### Phase 4: Calibration

수동 카메라 검증 케이스를 추가한다.

| Case | Expected |
| --- | --- |
| 손바닥이 카메라와 평행하고 엄지+검지 접촉 | 인식 |
| 손날이 카메라를 향하고 손가락이 겹침 | 보류 |
| 엄지와 약지가 깊이상 떨어져 있지만 2D로 겹침 | 보류 |
| 양손 접촉이 실제로 유지됨 | 인식 |
| 후보가 프레임마다 검지/중지/약지로 흔들림 | 보류 |

## Non-goals

- 모든 손 회전 상태에서 무조건 인식하는 것은 목표가 아니다.
- `z` 값을 절대 거리처럼 신뢰하지 않는다.
- 모델을 새로 학습하지 않는다.
- 접촉이 아닌 복잡한 손 모양 분류로 되돌아가지 않는다.

## Recommendation

가장 먼저 해야 할 일은 `3D distance gate`와 `hand orientation quality`다. 이 둘이
없으면 한 손 접촉 명령은 손이 겹쳐 보이는 자세에서 오탐이 생길 수밖에 없다.

실사용 UX 기준으로는 다음 정책이 맞다.

```text
좋은 자세에서는 빠르게 인식한다.
나쁜 자세에서는 실행하지 않는다.
나쁜 자세의 이유를 화면에 즉시 알려준다.
```

