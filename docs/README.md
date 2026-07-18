# AirCommands 문서 인덱스

이 문서 세트는 현재 코드 기준의 양손 손가락 접촉 명령 시스템을 설명한다.

현재 구현은 오른손 검지 궤적, swipe, V/W/S shape 인식이 아니다. 왼손
5개 fingertip과 오른손 5개 fingertip의 접촉 조합 `5 x 5 = 25개`와,
한 손의 `엄지 + 검지/중지/약지` 접촉 3개를 지원한다. 접촉 유지 시간이
충족되면 서버 API로 allowlisted 앱을 실행한다.

## 읽는 순서

1. [finger-gesture-command-plan.md](./finger-gesture-command-plan.md)
   - 전체 기획 요약과 현재 MVP 방향.
2. [01-product-requirements.md](./01-product-requirements.md)
   - 사용자 목표, 지원 제스처, 완료 정의.
3. [02-system-architecture.md](./02-system-architecture.md)
   - 클라이언트/서버 모듈 구조와 데이터 흐름.
4. [03-gesture-recognition-spec.md](./03-gesture-recognition-spec.md)
   - 양손 fingertip 접촉 인식 알고리즘.
5. [04-client-implementation-spec.md](./04-client-implementation-spec.md)
   - Nuxt/Vue 클라이언트 구현 상세.
6. [05-server-api-spec.md](./05-server-api-spec.md)
   - 앱 실행 API 계약과 allowlist.
7. [06-implementation-roadmap.md](./06-implementation-roadmap.md)
   - 현재 구현 단계와 이후 작업.
8. [07-test-and-verification-plan.md](./07-test-and-verification-plan.md)
   - 자동 테스트와 수동 카메라 검증 기준.
9. [08-self-review-and-hardening.md](./08-self-review-and-hardening.md)
   - 남은 리스크와 하드닝 체크리스트.
10. [09-stroke-lifecycle-recognition.md](./09-stroke-lifecycle-recognition.md)
   - 이름은 유지하지만, 현재는 touch lifecycle 문서다.
11. [10-gesture-bias-rebuttal.md](./10-gesture-bias-rebuttal.md)
   - 궤적 기반 인식을 버리고 접촉 기반으로 전환한 판단 기록.
12. [11-planar-overlap-and-depth-hardening.md](./11-planar-overlap-and-depth-hardening.md)
   - 손가락이 화면 평면에서 겹쳐 보이는 자세의 한계와 깊이/자세 품질 개선안.
13. [12-fist-pose-hold-policy.md](./12-fist-pose-hold-policy.md)
   - 주먹처럼 손가락이 접힌 폐쇄 손 자세를 보류하는 기준과 구현 정책.

## 현재 코드 기준 사실

- 클라이언트 진입점은 [../apps/aircommands-web/app/app.vue](../apps/aircommands-web/app/app.vue)이다.
- MediaPipe `HandLandmarker`는 `numHands: 2`로 초기화된다.
- 접촉 인식은 [../apps/aircommands-web/app/utils/gesture_command_detection/touch_detection.ts](../apps/aircommands-web/app/utils/gesture_command_detection/touch_detection.ts)에 있다.
- 인식 상태 머신은 [../apps/aircommands-web/app/utils/gesture_command_detection/recognition_reducer.ts](../apps/aircommands-web/app/utils/gesture_command_detection/recognition_reducer.ts)에 있다.
- 지원 제스처 목록은 [../apps/aircommands-web/app/utils/gesture_command_detection/command_map.ts](../apps/aircommands-web/app/utils/gesture_command_detection/command_map.ts)에서 생성된다.
- 서버 앱 실행 API는 [../apps/aircommands-web/server/api/apps/open.post.ts](../apps/aircommands-web/server/api/apps/open.post.ts)이다.
- 앱 allowlist는 [../apps/aircommands-web/server/utils/apps.ts](../apps/aircommands-web/server/utils/apps.ts)에 있다.
- 자동 dev server 실행은 금지되어 있다. 런타임 검증이 필요하면 사용자에게 먼저 허락을 받아야 한다.
