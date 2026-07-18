# AirCommands Web App

Nuxt app and Nitro API for gesture-driven local app launch.

## Gesture Model

Current recognition is touch-based:

- two-hand touches: 5 x 5 fingertip combinations (25)
- one-hand touches: thumb + index/middle/ring on each hand (6)

Total supported command gestures: 31.

## Commands

```bash
bun install
bun run test
bun run build
```

Optional local runtime commands:

```bash
bun run dev
bun run preview
```

## Server Endpoints

- POST /api/apps/open
- POST /api/open-chrome (legacy compatibility route)

## Key Files

- app/app.vue: camera UI and recognition flow
- app/utils/gesture_command_detection/command_map.ts
- app/utils/gesture_command_detection/touch_detection.ts
- app/utils/gesture_command_detection/recognition_reducer.ts
- server/api/apps/open.post.ts
- server/utils/open_app.ts

## Test Scope

Vitest runs tests from:

- app/**/__tests__
- server/**/__tests__
- test/unit
- test/e2e

## Verification Policy

- Do not auto-start dev server for verification tasks.
- Prefer static analysis, targeted tests, and build checks unless runtime verification is explicitly requested.
