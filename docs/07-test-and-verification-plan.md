# 07. 테스트 및 검증 계획

## 1. 목표

제스처 인식과 앱 실행은 오작동 비용이 있다. 따라서 자동 테스트, 빌드 검증, 수동 카메라 검증을 분리한다.

## 2. 자동 테스트 범위

자동 테스트는 카메라나 실제 앱 실행 없이 가능한 영역을 대상으로 한다.

- 좌표 변환
- trail window 추출
- 스와이프 판정
- 확인 동작 판정
- 제스처-명령 매핑
- 서버 request validation
- 서버 allowlist 실패
- 중복 request id 실패

## 2.1 테스트 도구와 package script

현재 구현은 외부 테스트 의존성을 추가하지 않고 `esbuild`와 Node 기본 test runner를 사용한다. `esbuild`는 Nuxt/Vite 의존성으로 이미 설치되어 있으며, 테스트 스크립트가 TypeScript 테스트 파일을 `.tmp/tests` 아래 임시 ESM 파일로 번들한 뒤 `node --test`를 실행한다.

현재 script:

```json
"test": "node scripts/run-tests.mjs"
```

테스트 파일 위치:

```text
app/utils/gesture_command_detection/__tests__/
  coordinates.test.ts
  pointer_trail.test.ts
  swipe.test.ts
  confirmation.test.ts
  command_map.test.ts
server/utils/__tests__/
  open_app.test.ts
```

실제 앱 실행 API는 `child_process.exec`를 직접 호출하지 않도록 core function 또는 runner를 mock한다.

Vitest는 추후 테스트 watch mode와 browser-like matcher가 필요해질 때 도입한다.

## 3. 제스처 테스트 데이터

정규화 좌표 기반 synthetic points를 사용한다.

```ts
function makePoints(
  points: Array<[number, number]>,
  startAt = 0,
  interval = 100,
): PointerTrailPoint[] {
  return points.map(([x, y], index) => ({
    x,
    y,
    at: startAt + index * interval,
  }))
}
```

### 3.1 위 스와이프

사용자 기준 좌표에서 y가 감소해야 한다.

```ts
makePoints([
  [0.5, 0.75],
  [0.5, 0.65],
  [0.5, 0.55],
  [0.5, 0.45],
])
```

기대:

- `detected: true`
- `direction: 'up'`
- `confidence >= 0.65`

### 3.2 아래 스와이프

```ts
makePoints([
  [0.5, 0.35],
  [0.5, 0.45],
  [0.5, 0.55],
  [0.5, 0.68],
])
```

기대: `down`

### 3.3 오른쪽 스와이프

```ts
makePoints([
  [0.25, 0.5],
  [0.38, 0.5],
  [0.5, 0.5],
  [0.65, 0.5],
])
```

기대: `right`

### 3.4 왼쪽 스와이프

```ts
makePoints([
  [0.75, 0.5],
  [0.62, 0.5],
  [0.5, 0.5],
  [0.35, 0.5],
])
```

기대: `left`

### 3.5 실패 케이스

| 케이스 | 데이터 | 기대 |
| --- | --- | --- |
| 너무 짧음 | 총 이동 0.05 | `too_short` |
| 너무 느림 | duration 1500ms | `too_slow` |
| 너무 빠름 | duration 50ms | `too_fast` |
| 대각선 | dx와 dy가 비슷함 | `too_diagonal` |
| 되돌림 많음 | 오른쪽 이동 중 왼쪽 흔들림 | `direction_unstable` |
| 포인트 부족 | 2 points | `not_enough_points` |

## 4. 확인 동작 테스트

### 4.1 확인 성공

후보 감지 후 800ms 동안 반경 0.025 안에서 움직인다.

기대:

- `confirmed: true`
- `progress: 1`

### 4.2 확인 실패

반경 0.025 밖으로 이동한다.

기대:

- `confirmed: false`
- `reason: 'moved_too_far'`

### 4.3 진행률

400ms 동안 정지했다.

기대:

- `confirmed: false`
- `progress`는 약 0.5

## 5. 서버 API 테스트

실제 앱 실행 없이 core function 또는 runner mock으로 검증한다.

### 5.1 성공

요청:

```json
{
  "app": "chrome",
  "source": "gesture",
  "gesture": "swipe_up",
  "clientRequestId": "test-1"
}
```

기대:

- `success: true`
- runner가 allowlist command로 1회 호출

### 5.2 미등록 앱

요청:

```json
{
  "app": "photoshop",
  "clientRequestId": "test-2"
}
```

기대:

- `success: false`
- `error: 'APPLICATION_NOT_FOUND'`
- runner 미호출

### 5.3 잘못된 body

요청:

```json
{
  "app": ""
}
```

기대:

- `success: false`
- `error: 'INVALID_BODY'`

### 5.4 중복 요청

동일 `clientRequestId`로 3초 안에 두 번 요청.

기대:

- 첫 요청은 성공 또는 실행 시도
- 두 번째 요청은 `DUPLICATE_REQUEST`

## 6. 빌드 검증

명령:

```bash
npm run test
npm run build
```

기대:

- test exit code 0
- exit code 0
- sourcemap/deprecation warning은 현재 프로젝트에서 알려진 경고로 분류 가능
- TypeScript import 오류 없음

## 7. 수동 카메라 검증

dev server 또는 브라우저 런타임 검증은 사용자 허락 후에만 진행한다.

### 7.1 준비

- 조명이 충분한 환경
- 웹캠 정면
- 오른손 전체가 화면에 들어옴
- 배경과 손이 구분됨

### 7.2 체크리스트

- [ ] 카메라 권한 허용 후 영상 표시
- [ ] 오른손 검지 trail 표시
- [ ] 위 스와이프 후 `Chrome 실행 준비` 표시
- [ ] 아래 스와이프 후 `메모장 실행 준비` 표시
- [ ] 오른쪽 스와이프 후 `VS Code 실행 준비` 표시
- [ ] 왼쪽 스와이프 후 `터미널 실행 준비` 표시
- [ ] 후보 후 정지 전에는 앱 실행 안 됨
- [ ] 후보 후 0.8초 정지하면 실행 API 호출
- [ ] 실행 후 2초 cooldown 표시
- [ ] cooldown 중 같은 명령 반복 실행 안 됨
- [ ] 손을 화면 밖으로 빼면 후보 취소
- [ ] 카메라 권한 거부 시 한국어 오류 표시

## 8. 회귀 테스트 체크리스트

새로운 제스처나 앱을 추가할 때마다 확인한다.

- [ ] 기존 4방향 스와이프 테스트가 깨지지 않는다.
- [ ] 기존 앱 매핑이 유지된다.
- [ ] allowlist 밖 앱은 계속 실패한다.
- [ ] API 응답 schema가 유지된다.
- [ ] build가 성공한다.
