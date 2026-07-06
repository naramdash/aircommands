# 06. 구현 로드맵

## 1. 원칙

- 작은 단계로 구현하고 각 단계마다 빌드/테스트 기준을 둔다.
- 카메라 런타임 검증은 사용자의 명시적 허락 없이 dev server를 켜지 않는다.
- 실제 앱 실행 테스트는 사용자 환경에 영향을 주므로 수동 확인 단계로 분리한다.

## 2. 1단계: 문서와 타입 기반 정리

목표:

- 구현에 필요한 타입과 순수 함수 파일을 만든다.

작업:

- `app/utils/gesture_command_detection/types.ts` 추가
- `coordinates.ts` 추가
- `pointer_trail.ts` 추가
- `command_map.ts` 추가

완료 기준:

- 타입 import가 정상 동작한다.
- `npm run build` 성공.

## 3. 2단계: trail 유틸 분리

목표:

- 현재 `app.vue`에 있는 trail 배열 관리와 pruning을 유틸로 이동한다.

작업:

- `pruneTrail`
- `getRecentPoints`
- `appendTrailPoint`
- `toUserFacingPoint`

완료 기준:

- 기존 5초 초록 trail UI가 유지된다.
- `app.vue`의 trail 관련 코드가 줄어든다.

## 4. 3단계: 스와이프 순수 함수 구현

목표:

- 카메라 없이 배열 입력만으로 스와이프 방향을 판정한다.

작업:

- `swipe.ts` 구현
- `scripts/run-tests.mjs` 추가
- `package.json`에 `test` script 추가
- 테스트 스크립트 추가
- 상하좌우 synthetic points 테스트 작성

완료 기준:

- `npm run test` 성공.
- 네 방향 스와이프 테스트 통과.
- 작은 흔들림/대각선/느린 이동 테스트 실패 처리 통과.

## 5. 4단계: 후보 상태 UI 추가

목표:

- 후보 명령을 화면에 표시한다. 아직 서버 API는 호출하지 않는다.

작업:

- `app.vue`에서 `detectSwipeGesture` 호출
- `gestureCommands`로 label/app 매핑
- 상태 패널에 후보 명령 표시

완료 기준:

- 코드상 API 호출 없이 후보만 표시한다.
- build 성공.
- 런타임 수동 검증은 사용자 허락 후 진행.

## 6. 5단계: 확인 동작 구현

목표:

- 후보 명령 이후 검지 정지 0.8초로 실행 확정 조건을 만든다.

작업:

- `confirmation.ts` 구현
- 확인 progress 계산
- UI에 percent 또는 progress bar 표시

완료 기준:

- 후보 직후 바로 실행되지 않는다.
- 정지 조건이 만족될 때만 `readyToExecute` 상태가 된다.
- 손 사라짐/timeout 시 후보 취소.

## 7. 6단계: 서버 API 추가

목표:

- 새 `/api/apps/open` API를 추가한다.

작업:

- `server/api/apps/open.post.ts`
- `server/utils/app_command_runner.ts`
- request body validation
- dedupe map
- 기존 `/api/open-chrome` 호환 처리

완료 기준:

- 등록 앱 요청 성공.
- 미등록 앱 요청 실패.
- 중복 request id 실패.
- 실제 exec는 테스트에서 mock 가능.

## 8. 7단계: 클라이언트 API 연결

목표:

- 확인 완료 후 서버 API를 호출한다.

작업:

- `$fetch('/api/apps/open')` 호출
- `executing`, `cooldown`, `error` 상태 반영
- 성공/실패 메시지 표시

완료 기준:

- 확인 전 API 미호출.
- 확인 후 API 1회 호출.
- cooldown 중 중복 호출 없음.

## 9. 8단계: 테스트와 검증

목표:

- 자동 테스트와 수동 검증 절차를 모두 통과한다.

작업:

- 제스처 순수 함수 테스트
- 서버 API core 테스트
- `npm run build`
- 사용자 허락 후 카메라 수동 검증

완료 기준:

- `npm run test` 성공.
- [07-test-and-verification-plan.md](./07-test-and-verification-plan.md)의 체크리스트 통과.

## 10. 추천 커밋 단위

1. `docs: expand gesture command implementation plan`
2. `feat: add gesture command detection utilities`
3. `feat: detect swipe candidates from pointer trail`
4. `feat: add gesture confirmation state`
5. `feat: add app open API`
6. `feat: connect gesture confirmation to app launch`
7. `test: cover gesture detection and app API`

## 11. 중단 후 재개 방법

작업을 나중에 재개할 때는 다음 순서로 확인한다.

1. `git status --short`
2. `rg --files docs app server`
3. [docs/README.md](./README.md) 읽기
4. 현재 단계가 [06-implementation-roadmap.md](./06-implementation-roadmap.md)의 어디인지 확인
5. 해당 단계의 완료 기준부터 다시 점검
