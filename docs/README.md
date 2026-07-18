# AirCommands Docs Index

현재 문서 세트는 모노레포의 실제 코드 상태(`apps/electron`, `apps/web`)를 기준으로 유지한다.

## 문서 구조

1. [01-workspace-overview.md](./01-workspace-overview.md)
   - 모노레포 구조, 패키지 역할, 공통 규칙
2. [02-electron-app.md](./02-electron-app.md)
   - Electron 앱 아키텍처, 트레이/알림/IPC 동작
3. [03-web-app.md](./03-web-app.md)
   - Nuxt 웹 앱/서버 구성, 테스트 구조
4. [04-gesture-engine.md](./04-gesture-engine.md)
   - 제스처 인식 엔진과 상태 흐름
5. [05-command-execution-contract.md](./05-command-execution-contract.md)
   - 앱 실행 계약(Request/Response), 중복 방지, 플랫폼 분기
6. [06-build-test-and-ops.md](./06-build-test-and-ops.md)
   - 빌드/테스트/운영 시 지켜야 할 실무 규칙
7. [07-known-issues-and-next-steps.md](./07-known-issues-and-next-steps.md)
   - 현재 리스크와 권장 개선 순서

## 관리 원칙

- 문서는 기능 계획보다 현재 코드의 사실을 우선한다.
- 경로 예시는 실제 저장소 경로를 사용한다.
- 검증 명령은 Bun 기준으로 작성한다.
- 런타임 검증을 위해 dev server를 자동 실행하지 않는다.
