# AirCommands 문서 인덱스

이 폴더는 손가락 제스처로 명령을 인식하고 서버 API를 통해 로컬 애플리케이션을 실행하는 기능을 구현하기 위한 실행 문서 세트다.

목표는 "나중에 이 문서만 보고도 구현 가능한 수준"이다. 코드가 바뀌어도 아래 문서의 순서대로 확인하면 요구사항, 설계, API, 구현 단계, 테스트 기준을 다시 복원할 수 있어야 한다.

## 읽는 순서

1. [finger-gesture-command-plan.md](./finger-gesture-command-plan.md)
   - 전체 기획 요약, MVP 범위, 구현 단계 개요.
2. [01-product-requirements.md](./01-product-requirements.md)
   - 사용자 목표, MVP 요구사항, 제외 범위, 완료 정의.
3. [02-system-architecture.md](./02-system-architecture.md)
   - 현재 코드 기준 시스템 구조, 데이터 흐름, 모듈 경계.
4. [03-gesture-recognition-spec.md](./03-gesture-recognition-spec.md)
   - 오른손 검지 기반 제스처 인식 알고리즘, 좌표계, threshold, 상태 안정화.
5. [04-client-implementation-spec.md](./04-client-implementation-spec.md)
   - Nuxt/Vue 클라이언트 구현 타입, 함수, 상태 전이, UI 사양.
6. [05-server-api-spec.md](./05-server-api-spec.md)
   - 앱 실행 서버 API 계약, allowlist, 중복 방지, 오류 응답.
7. [06-implementation-roadmap.md](./06-implementation-roadmap.md)
   - 구현 순서, 커밋 단위, 파일별 작업 목록.
8. [07-test-and-verification-plan.md](./07-test-and-verification-plan.md)
   - 단위 테스트, API 테스트, 수동 카메라 검증 절차.
9. [08-self-review-and-hardening.md](./08-self-review-and-hardening.md)
   - 완성되었다고 판단한 뒤 다시 보강해야 할 점과 최종 점검표.
10. [09-stroke-lifecycle-recognition.md](./09-stroke-lifecycle-recognition.md)
   - 명시적 시작 가능/입력 중/종료 감지 상태와 stroke 기반 경로 인식 규칙.
11. [10-gesture-bias-rebuttal.md](./10-gesture-bias-rebuttal.md)
   - 위 스와이프와 V/W/S 인식 난이도 차이에 대한 20회 반박 검토와 보강 결과.

## 현재 코드 기준 사실

- 클라이언트 진입점은 [../app/app.vue](../app/app.vue)이다.
- 현재 클라이언트는 오른손 검지 끝 landmark 8번을 추적하고 최근 5초의 경로를 Canvas 2D API로 그린다.
- 제스처 인식은 `ready_to_start -> drawing -> stroke_ended -> candidate` lifecycle을 거친다.
- V/W/S 모양 인식은 전체 stroke 템플릿, 앞뒤 마진 trim, 꺾임 구조 판정을 함께 사용한다.
- MediaPipe 초기화는 [../app/utils/hand_landmark_detection.ts](../app/utils/hand_landmark_detection.ts)에 있다.
- 현재 서버 앱 실행 API는 [../server/api/open-chrome.post.ts](../server/api/open-chrome.post.ts)에 있다.
- 앱 allowlist는 [../server/utils/apps.ts](../server/utils/apps.ts)에 있다.
- 자동 dev server 실행은 금지되어 있다. 런타임 검증이 필요하면 사용자에게 먼저 허락을 받아야 한다.

## 구현 원칙

- 손가락 제스처 후보가 잡혀도 즉시 앱을 실행하지 않는다.
- 후보 명령을 화면에 표시하고 별도 확인 동작을 거친 뒤 서버 API를 호출한다.
- 서버는 allowlist에 있는 앱만 실행한다.
- 클라이언트와 서버 모두 중복 실행 방지 장치를 가진다.
- 카메라/MediaPipe 기반 로직은 실제 런타임 오차가 크므로 순수 함수 단위 테스트와 수동 검증을 분리한다.
