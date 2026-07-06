# 08. 자체 재검토 및 보강 계획

## 1. 재검토 목적

문서를 한 번 완성했다고 판단한 뒤, 실제 구현자가 이 문서만 보고 작업할 때 막힐 수 있는 지점을 다시 점검한다. 이 문서는 보강이 필요한 부분과 완료 전 최종 점검 기준을 기록한다.

## 2. 재검토 결과 요약

보강해야 할 주요 지점은 다음이다.

1. 좌우 반전 좌표계가 구현 중 혼동될 수 있다.
2. 스와이프 threshold는 환경에 따라 조정이 필요하다.
3. API가 실제 로컬 앱을 실행하므로 테스트와 수동 검증을 분리해야 한다.
4. 후보 명령이 바로 실행되면 위험하므로 확인 동작이 반드시 필요하다.
5. 현재 문서는 구현 계획이며, 실제 구현 중 변경된 값은 문서에 다시 반영해야 한다.

이 점을 반영해 다음 보강 문서를 추가했다.

- [03-gesture-recognition-spec.md](./03-gesture-recognition-spec.md): 좌표계, threshold, confidence, 확인 동작 상세화
- [04-client-implementation-spec.md](./04-client-implementation-spec.md): 파일별 구현 함수와 타입 명시
- [05-server-api-spec.md](./05-server-api-spec.md): API schema, dedupe, allowlist, runner 분리 명시
- [07-test-and-verification-plan.md](./07-test-and-verification-plan.md): synthetic point 테스트와 수동 체크리스트 명시

추가 재검토에서 테스트 도구가 빠져 있음을 확인했고, [07-test-and-verification-plan.md](./07-test-and-verification-plan.md)에 현재 구현된 Node+esbuild 테스트 runner, `package.json` 스크립트, 테스트 파일 위치를 보강했다.

## 3. 구현 전 보강하면 좋은 점

### 3.1 API 이름 정리

현재 API 파일명은 `open-chrome.post.ts`지만 실제로는 여러 앱을 실행한다. 구현 전 `server/api/apps/open.post.ts`를 추가하고 기존 API는 호환 wrapper로 낮추는 것이 좋다.

### 3.2 앱 실행 command 안정화

현재 `AVAILABLE_APPS`는 플랫폼별 command 문자열을 갖고 있다. 추후에는 다음 정보를 추가하면 운영이 쉬워진다.

```ts
type AppConfig = {
  name: string
  label: string
  windows: string
  darwin: string
  linux: string
  installedCheck?: string
}
```

MVP에서는 필수는 아니지만, "앱이 설치되지 않아 실행 실패"와 "등록되지 않은 앱"을 구분하려면 필요하다.

### 3.3 debug panel

카메라 기반 기능은 튜닝이 중요하다. 개발 모드에서만 다음 값을 표시하는 debug panel이 있으면 좋다.

- raw x/y
- user-facing x/y
- recent window point count
- detected direction
- confidence
- failure reason
- confirmation progress
- cooldown remaining

### 3.4 threshold 조정 UI

처음에는 상수로 구현하되, 실제 검증 때는 threshold 조정이 필요할 수 있다. 개발 모드에서만 slider를 제공하면 튜닝 시간이 줄어든다.

우선순위:

1. `SWIPE_MIN_DISTANCE`
2. `SWIPE_AXIS_DOMINANCE_RATIO`
3. `CONFIRM_STATIONARY_RADIUS`
4. `CONFIRM_HOLD_MS`

### 3.5 request id 설계

`clientRequestId`는 중복 실행 방지의 핵심이다. 단순 timestamp도 가능하지만, 다음 형태가 더 추적하기 좋다.

```ts
`${gesture}-${app}-${Math.round(candidate.detectedAt)}`
```

서버는 source/gesture/app/requestId를 함께 로그로 남긴다.

## 4. 구현 중 주의해야 할 실패 모드

| 실패 모드 | 증상 | 대응 |
| --- | --- | --- |
| 좌우 반전 반대로 인식 | 오른쪽 스와이프가 왼쪽 명령으로 뜸 | user-facing 좌표 변환 테스트 추가 |
| 너무 민감한 인식 | 손 떨림만으로 후보 발생 | min distance 증가, confidence threshold 증가 |
| 확인이 너무 어려움 | 후보 후 정지해도 실행 안 됨 | stationary radius 증가 또는 hold time 감소 |
| API 중복 호출 | 앱이 여러 번 열림 | client executing flag, cooldown, server dedupe |
| 서버 command 실패 | success false | 오류 메시지와 앱 설치 안내 |
| 성능 저하 | 프레임 드랍 | 인식 주기 제한, point cap |

## 5. 최종 구현 완료 전 감사 체크리스트

### 문서 일치성

- [ ] 구현된 파일 구조가 [02-system-architecture.md](./02-system-architecture.md)의 목표 구조와 크게 어긋나지 않는다.
- [ ] 실제 threshold 값이 [03-gesture-recognition-spec.md](./03-gesture-recognition-spec.md)에 반영되어 있다.
- [ ] 실제 API schema가 [05-server-api-spec.md](./05-server-api-spec.md)와 일치한다.
- [ ] 테스트 절차가 [07-test-and-verification-plan.md](./07-test-and-verification-plan.md)에 반영되어 있다.

### 기능 완성도

- [ ] 오른손 검지 스와이프 4방향이 후보로 표시된다.
- [ ] 후보 상태에서 앱 이름이 명확히 표시된다.
- [ ] 확인 동작 전 API 호출이 없다.
- [ ] 확인 동작 후 API 호출이 정확히 1회 발생한다.
- [ ] cooldown 중 중복 실행이 없다.
- [ ] 손 사라짐/timeout 취소가 동작한다.

### 안전성

- [ ] 서버 allowlist 밖 앱은 실행되지 않는다.
- [ ] 사용자 입력이 shell command에 직접 들어가지 않는다.
- [ ] 중복 request id가 거부된다.
- [ ] 실제 앱 실행 테스트는 사용자가 의도한 환경에서만 수행한다.

### 검증

- [ ] `npm run build` 성공
- [ ] `npm run test` 성공
- [ ] 제스처 순수 함수 테스트 성공
- [ ] 서버 API 테스트 성공
- [ ] 사용자 허락 후 수동 카메라 검증 성공

## 6. 추가 개선 후보

MVP 이후에 고려할 수 있는 개선:

- 원 그리기 제스처로 앱 목록 열기
- 두 손가락 탭으로 확인
- 사용자별 threshold calibration
- 앱 실행 대신 URL 열기, 단축키 실행 등 command type 확장
- 제스처 기록 replay 도구
- 시각적 튜토리얼

## 7. 결론

현재 문서 세트는 구현자가 요구사항, 파일 구조, 타입, 알고리즘, API, 테스트를 따라 MVP를 만들 수 있는 수준까지 구체화되어 있다. 실제 구현 후에는 변경된 threshold, API 응답, UI 상태명을 이 문서에 다시 반영해야 문서와 코드가 계속 일치한다.
