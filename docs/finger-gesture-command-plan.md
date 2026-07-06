# 손가락 제스처 기반 애플리케이션 실행 기획서

## 1. 목적

웹캠으로 오른손 손가락 움직임을 인식하고, 사용자가 의도한 손가락 제스처를 명령으로 확정한 뒤, Nuxt 서버 API에 요청을 보내 로컬 애플리케이션을 실행한다.

이 문서는 현재 프로젝트의 구조를 기준으로 실현 가능한 MVP와 확장 계획을 정의한다.

구현자는 먼저 [README.md](./README.md)의 읽는 순서를 따른다. 이 문서는 전체 기획 요약이며, 세부 구현은 다음 문서에 나뉘어 있다.

- [01-product-requirements.md](./01-product-requirements.md): 요구사항과 완료 정의
- [02-system-architecture.md](./02-system-architecture.md): 시스템 구조와 모듈 경계
- [03-gesture-recognition-spec.md](./03-gesture-recognition-spec.md): 제스처 인식 알고리즘
- [04-client-implementation-spec.md](./04-client-implementation-spec.md): 클라이언트 구현 사양
- [05-server-api-spec.md](./05-server-api-spec.md): 서버 API 사양
- [06-implementation-roadmap.md](./06-implementation-roadmap.md): 구현 순서
- [07-test-and-verification-plan.md](./07-test-and-verification-plan.md): 테스트 계획
- [08-self-review-and-hardening.md](./08-self-review-and-hardening.md): 자체 재검토와 보강 계획

## 2. 현재 프로젝트 기준

현재 확인된 코드 상태는 다음과 같다.

- 클라이언트: [app/app.vue](../app/app.vue)는 `@mediapipe/tasks-vision`의 `HandLandmarker`로 오른손 검지 끝 landmark 8번을 매 프레임 추적하고, 최근 5초의 이동 경로를 Canvas 2D API로 렌더링한다.
- MediaPipe 초기화: [app/utils/hand_landmark_detection.ts](../app/utils/hand_landmark_detection.ts)는 로컬 `hand_landmarker.task` 모델과 WASM public asset 경로를 사용한다.
- 서버 API: [server/api/open-chrome.post.ts](../server/api/open-chrome.post.ts)는 `body.app` 또는 query `app` 값을 받아 앱 실행 명령을 찾고 `child_process.exec`로 실행한다.
- 앱 목록: [server/utils/apps.ts](../server/utils/apps.ts)는 `chrome`, `firefox`, `notepad`, `vscode`, `terminal` 등 OS별 실행 명령을 보유한다.
- Nuxt 설정: [nuxt.config.ts](../nuxt.config.ts)는 `ssr: false`이며, 브라우저 카메라/MediaPipe 기반 클라이언트 앱에 적합하다.

따라서 새 기능은 완전히 새로 만드는 것이 아니라, 현재의 "검지 좌표 추적"을 "제스처 명령 인식"으로 확장하고, 기존 서버 API를 더 명확한 명령 실행 API로 다듬는 방식이 현실적이다.

## 3. MVP 범위

MVP는 다음 범위까지만 구현한다.

- 오른손만 명령 입력 대상으로 사용한다.
- 손가락 landmark 기반의 간단한 제스처 4-6개를 정의한다.
- 제스처 하나가 바로 앱을 실행하지 않고, "제스처 인식 → 안정화 → 사용자 확인 동작 → API 호출" 흐름을 거친다.
- 한 번 실행된 명령은 짧은 cooldown 동안 재실행되지 않는다.
- 실행 가능한 앱은 서버에 등록된 allowlist만 사용한다.
- 실패 시 화면에 명확한 오류 상태를 보여준다.

MVP에서 제외할 항목은 다음과 같다.

- 복잡한 양손 제스처
- 사용자별 제스처 학습
- 백그라운드 상시 감시
- 운영체제 권한 자동 상승
- 임의 shell 명령 실행
- 원격 기기 제어

## 4. 사용자 시나리오

1. 사용자가 웹앱을 연다.
2. 브라우저가 카메라 권한을 요청한다.
3. 화면에는 카메라 영상과 손 추적 상태가 표시된다.
4. 사용자가 오른손으로 등록된 제스처를 취한다.
5. 클라이언트는 최근 프레임의 인식 결과를 모아 안정적인 후보 명령을 만든다.
6. 후보 명령이 화면에 표시된다. 예: `Chrome 실행 준비`.
7. 사용자가 확인 제스처를 취한다. 예: 검지로 0.8초 이상 정지하거나 손을 펼쳐 확인.
8. 클라이언트가 서버 API로 `app: "chrome"` 요청을 보낸다.
9. 서버가 allowlist에서 앱 실행 명령을 찾아 실행한다.
10. 클라이언트는 성공/실패 결과를 화면에 표시한다.

## 5. 제스처 설계

### 5.1 인식 원칙

제스처는 손 모양 자체만으로 판단하기보다, 현재 구현되어 있는 검지 이동 경로와 손가락 landmark 상태를 함께 사용한다.

- 정적 제스처: 특정 손가락이 펴졌는지 접혔는지 판단한다.
- 동적 제스처: 최근 N초 동안 검지 끝 좌표가 어떤 방향으로 움직였는지 판단한다.
- 명령 확정: 오작동 방지를 위해 별도 확인 동작이 필요하다.

### 5.2 MVP 제스처 후보

| 제스처 | 판정 기준 | 기본 명령 |
| --- | --- | --- |
| 검지 위로 스와이프 | 최근 0.8초 안에 검지 y 좌표가 충분히 감소 | Chrome 실행 |
| 검지 아래로 스와이프 | 최근 0.8초 안에 검지 y 좌표가 충분히 증가 | Notepad 실행 |
| 검지 오른쪽 스와이프 | 최근 0.8초 안에 검지 x 좌표가 충분히 증가 | VS Code 실행 |
| 검지 왼쪽 스와이프 | 최근 0.8초 안에 검지 x 좌표가 충분히 감소 | Terminal 실행 |
| 검지 원 그리기 | 최근 1.5초 경로가 원형에 가까움 | 앱 목록 표시 |
| 손 펼침 | 4개 이상 손가락이 펴짐 | 취소 또는 초기화 |

주의: 웹캠 화면은 CSS로 좌우 반전되어 있으므로, 사용자 기준 방향과 raw landmark 좌표 방향을 명확히 분리해야 한다. 화면에 보이는 방향을 기준으로 명령을 설명하고, 내부 계산에서는 필요 시 x 좌표를 변환한다.

### 5.3 확인 동작

앱 실행은 위험도가 있는 동작이므로 후보 제스처만으로 즉시 실행하지 않는다.

권장 확인 방식:

- 후보 명령이 뜬 뒤 검지 끝이 같은 위치에 0.8초 이상 머무르면 실행한다.
- 또는 후보 명령이 뜬 뒤 손을 펼치면 실행하고, 주먹을 쥐면 취소한다.

MVP에서는 "검지 정지 0.8초"가 가장 단순하고 현재 trail 데이터와 잘 맞는다.

## 6. 클라이언트 설계

### 6.1 주요 상태

클라이언트는 다음 상태를 가진다.

```ts
type RecognitionState =
  | 'camera_idle'
  | 'tracking'
  | 'candidate'
  | 'confirming'
  | 'executing'
  | 'cooldown'
  | 'error'
```

상태 전이는 다음처럼 동작한다.

1. `camera_idle`: 카메라가 꺼져 있거나 권한 대기.
2. `tracking`: 손을 추적하며 제스처 후보를 찾음.
3. `candidate`: 명령 후보가 안정적으로 잡힘.
4. `confirming`: 확인 동작을 기다림.
5. `executing`: 서버 API 호출 중.
6. `cooldown`: 실행 직후 중복 호출 방지.
7. `error`: 카메라/인식/API 오류.

### 6.2 데이터 구조

현재 `pointerTrail`을 다음처럼 확장한다.

```ts
type PointerTrailPoint = {
  x: number
  y: number
  at: number
}

type GestureCandidate = {
  gesture: 'swipe_up' | 'swipe_down' | 'swipe_left' | 'swipe_right' | 'circle'
  app: 'chrome' | 'notepad' | 'vscode' | 'terminal'
  confidence: number
  detectedAt: number
}
```

정적 손가락 상태가 필요해지면 다음 구조를 추가한다.

```ts
type FingerPose = {
  thumb: 'open' | 'closed' | 'unknown'
  index: 'open' | 'closed' | 'unknown'
  middle: 'open' | 'closed' | 'unknown'
  ring: 'open' | 'closed' | 'unknown'
  pinky: 'open' | 'closed' | 'unknown'
}
```

### 6.3 제스처 판정 방식

스와이프는 처음부터 복잡한 ML 모델을 쓰지 않고 좌표 기반으로 판정한다.

기본 알고리즘:

1. 최근 0.8초의 `pointerTrail`만 가져온다.
2. 시작점과 끝점의 차이를 계산한다.
3. 전체 이동 거리, 주 방향 이동량, 반대축 흔들림 비율을 계산한다.
4. 조건을 통과하면 후보 제스처를 만든다.

예시 기준:

- 최소 이동 거리: 화면 너비/높이의 12% 이상
- 주 방향 비율: 전체 이동량 중 주 방향 성분 70% 이상
- 시간 제한: 200ms 이상 900ms 이하
- confidence: 이동 거리, 방향 일관성, 손 추적 안정성으로 계산

원 그리기는 MVP 2단계로 미룬다. 스와이프 4방향이 안정화된 뒤 추가한다.

### 6.4 안정화 로직

프레임 단위 인식 결과가 튀지 않도록 다음 로직을 둔다.

- 후보 제스처는 최소 2-3프레임 연속 같은 방향이어야 한다.
- 후보가 잡힌 뒤 1.2초 안에 확인 동작이 없으면 자동 취소한다.
- 실행 후 2초 cooldown 동안 같은 명령을 다시 보내지 않는다.
- 오른손이 사라지면 후보를 취소한다.

### 6.5 화면 구성

MVP 화면은 단순해야 한다.

- 카메라 영상
- 검지 trail Canvas
- 현재 상태: `추적 중`, `Chrome 실행 준비`, `실행 중`, `실행 완료`, `취소됨`
- 후보 명령 이름
- cooldown 남은 시간
- 서버 오류 메시지
- 지원 앱 목록

명령 실행은 사용자가 이해할 수 있어야 하므로, 화면에 "지금 어떤 앱이 실행될 예정인지"를 반드시 표시한다.

## 7. 서버 API 설계

### 7.1 현재 API

현재 API는 [server/api/open-chrome.post.ts](../server/api/open-chrome.post.ts)에 있으며 실제로는 Chrome만 여는 것이 아니라 `app` 파라미터에 따라 여러 앱을 실행한다.

현재 요청 예:

```http
POST /api/open-chrome
Content-Type: application/json

{
  "app": "chrome"
}
```

### 7.2 개선 API

파일명과 역할을 맞추기 위해 MVP에서는 새 API를 추가하는 것이 좋다.

권장 경로:

```http
POST /api/apps/open
```

요청:

```json
{
  "app": "chrome",
  "source": "gesture",
  "gesture": "swipe_up",
  "clientRequestId": "uuid-or-timestamp"
}
```

응답 성공:

```json
{
  "success": true,
  "app": "chrome",
  "message": "chrome opened successfully"
}
```

응답 실패:

```json
{
  "success": false,
  "app": "unknown-app",
  "error": "Application not found",
  "availableApps": ["chrome", "firefox", "notepad"]
}
```

### 7.3 서버 안전장치

서버는 앱 실행을 수행하므로 다음 제한이 필수다.

- `AVAILABLE_APPS`에 등록된 앱만 실행한다.
- 요청 body의 값을 shell command로 직접 이어붙이지 않는다.
- 같은 `clientRequestId`는 짧은 시간 안에 중복 실행하지 않는다.
- 서버 로그에 실행 요청 결과를 남긴다.
- API는 로컬 개발 환경을 기본 전제로 하고, 외부 공개 배포 시 인증을 추가한다.

현재 [server/utils/apps.ts](../server/utils/apps.ts)는 allowlist 기반이므로 방향은 적절하다. 다만 Windows의 `start chrome` 같은 command 문자열은 `exec`를 사용하므로, 사용자 입력이 command에 섞이지 않도록 지금 구조를 유지해야 한다.

## 8. 명령 매핑

MVP 기본 매핑은 다음과 같이 시작한다.

| 제스처 | 앱 | 서버 app 값 |
| --- | --- | --- |
| 검지 위로 스와이프 | Chrome | `chrome` |
| 검지 아래로 스와이프 | Notepad | `notepad` |
| 검지 오른쪽 스와이프 | VS Code | `vscode` |
| 검지 왼쪽 스와이프 | Terminal | `terminal` |
| 손 펼침 | 취소 | API 호출 없음 |

추후 설정 파일로 분리할 수 있다.

권장 클라이언트 매핑 구조:

```ts
const gestureCommands = {
  swipe_up: { label: 'Chrome 실행', app: 'chrome' },
  swipe_down: { label: 'Notepad 실행', app: 'notepad' },
  swipe_right: { label: 'VS Code 실행', app: 'vscode' },
  swipe_left: { label: 'Terminal 실행', app: 'terminal' },
} as const
```

## 9. 구현 단계

### 1단계: 현재 검지 trail 정리

- `pointerTrail`을 렌더링용과 인식용으로 분리한다.
- 5초 표시용 trail은 유지하되, 제스처 판정에는 최근 0.8초만 사용한다.
- 화면 좌표 기준 방향과 raw landmark 방향을 명확히 정한다.

완료 기준:

- 검지 이동 경로가 계속 표시된다.
- 내부 함수에서 최근 0.8초의 이동 벡터를 계산할 수 있다.

### 2단계: 스와이프 4방향 후보 인식

- `detectSwipeGesture(points)` 함수를 만든다.
- 상하좌우 후보와 confidence를 반환한다.
- 후보가 안정적으로 유지될 때만 UI에 표시한다.

완료 기준:

- 빠른 상하좌우 검지 이동이 후보 명령으로 표시된다.
- 손을 가만히 둘 때 후보가 뜨지 않는다.
- 작은 흔들림으로 명령이 발생하지 않는다.

### 3단계: 확인 동작과 cooldown

- 후보 명령이 뜬 뒤 검지가 0.8초 이상 작은 반경 안에 머무르면 확정한다.
- 확정 후 API 호출 전 상태를 `executing`으로 바꾼다.
- API 결과 후 2초 cooldown을 둔다.

완료 기준:

- 후보만 뜬 상태에서는 앱이 실행되지 않는다.
- 확인 동작 이후에만 서버 요청이 발생한다.
- 같은 명령이 연속으로 여러 번 실행되지 않는다.

### 4단계: 서버 API 정리

- `server/api/apps/open.post.ts`를 추가한다.
- 기존 `/api/open-chrome`은 유지하거나 새 API로 위임한다.
- 요청/응답 타입을 명확히 한다.
- `AVAILABLE_APPS` 기반 allowlist를 유지한다.

완료 기준:

- `POST /api/apps/open`으로 등록 앱을 실행할 수 있다.
- 등록되지 않은 앱은 실패 응답을 반환한다.
- 클라이언트는 새 API를 사용한다.

### 5단계: UI 정리

- 현재 후보 명령, 확인 진행률, 실행 결과를 표시한다.
- 지원 앱 목록과 제스처 매핑을 보여준다.
- 오류와 취소 상태를 한국어로 표시한다.

완료 기준:

- 사용자가 현재 앱이 실행될 예정인지 알 수 있다.
- 실패 시 어떤 이유인지 알 수 있다.

### 6단계: 검증

- 좌표 판정 함수는 순수 함수로 분리해 단위 테스트한다.
- 서버 API는 allowlist 성공/실패를 테스트한다.
- 수동 검증은 카메라 환경에서 실제 제스처로 진행한다.

완료 기준:

- `npm run build`가 성공한다.
- 제스처 판정 함수 테스트가 성공한다.
- 실제 카메라에서 오작동 없이 앱 실행까지 확인한다.

## 10. 테스트 계획

### 10.1 단위 테스트

테스트 대상:

- `detectSwipeGesture`
- `isPointerStationary`
- `normalizeUserFacingPoint`
- `mapGestureToCommand`

테스트 케이스:

- 충분히 긴 위/아래/왼쪽/오른쪽 이동
- 너무 짧은 이동
- 대각선 이동
- 지그재그 이동
- 오래된 포인트 포함
- 손이 사라진 경우

### 10.2 API 테스트

테스트 대상:

- 등록 앱 실행 요청
- 미등록 앱 요청
- 빈 body 요청
- 중복 `clientRequestId` 요청

주의: 실제 앱 실행은 테스트에서 mock 처리하는 것이 좋다. `child_process.exec`를 직접 실행하는 테스트는 개발자 환경에 영향을 줄 수 있다.

### 10.3 수동 테스트

수동 테스트 항목:

- 카메라 권한 거부 시 오류 표시
- 오른손만 인식되는지 확인
- 스와이프 후보 표시
- 확인 동작 전에는 앱 미실행
- 확인 후 앱 실행
- cooldown 중 중복 실행 방지
- 손을 화면 밖으로 빼면 후보 취소

## 11. 리스크와 대응

| 리스크 | 원인 | 대응 |
| --- | --- | --- |
| 손 떨림으로 오인식 | landmark 좌표 노이즈 | 최근 프레임 smoothing, 최소 이동 거리, 방향 일관성 |
| 좌우 방향 혼동 | 영상 좌우 반전 | 사용자 기준 좌표 변환 함수 분리 |
| 명령 중복 실행 | 매 프레임 인식 | 확인 동작, cooldown, request id dedupe |
| 임의 명령 실행 위험 | 사용자 입력을 shell에 전달 | allowlist만 사용 |
| 앱 실행 실패 | OS별 명령 차이, 앱 미설치 | 실패 메시지와 지원 앱 목록 표시 |
| 카메라 성능 저하 | MediaPipe 프레임 처리 비용 | 필요 시 인식 주기 제한, 렌더링과 판정 분리 |

## 12. 권장 파일 구조

```text
app/
  app.vue
  utils/
    hand_landmark_detection.ts
    gesture_command_detection/
      pointer_trail.ts
      swipe.ts
      confirmation.ts
      command_map.ts
server/
  api/
    apps/
      open.post.ts
  utils/
    apps.ts
docs/
  finger-gesture-command-plan.md
```

## 13. 최종 완료 정의

이 기획의 완료 상태는 다음 조건을 모두 만족해야 한다.

- 오른손 검지 기반 스와이프 4방향을 안정적으로 후보 명령으로 인식한다.
- 후보 명령은 화면에 명확히 표시된다.
- 확인 동작 없이는 앱 실행 API가 호출되지 않는다.
- 확인 동작 후 서버 API로 등록 앱이 실행된다.
- 미등록 앱이나 실패 상황은 사용자에게 오류로 표시된다.
- 중복 실행 방지 로직이 있다.
- 앱 실행 서버 API는 allowlist만 사용한다.
- 빌드와 핵심 순수 함수 테스트가 통과한다.
