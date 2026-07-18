# AirCommands

AirCommands is a Nuxt app that uses MediaPipe Hand Landmarker to run local app
commands from two-hand finger-touch gestures.

The current interaction model is:

1. Show both hands to the camera.
2. Touch one left-hand fingertip to one right-hand fingertip.
3. Hold the contact briefly.
4. The matching command is executed through the local server API.

The app supports all `5 x 5` fingertip combinations:

- left thumb/index/middle/ring/pinky
- right thumb/index/middle/ring/pinky

## Commands

```bash
bun install
bun run test
bun run build
```

Do not start the dev server automatically for verification. The repository
instructions require static inspection, targeted tests, and production builds
unless the user explicitly approves runtime browser verification.

## Key Files

- `app/app.vue`: camera UI, two-hand fingertip overlay, command execution flow
- `app/utils/gesture_command_detection/touch_detection.ts`: 5x5 touch detection
- `app/utils/gesture_command_detection/recognition_reducer.ts`: touch hold and cooldown state machine
- `app/utils/gesture_command_detection/command_map.ts`: generated 25 gesture command list
- `server/api/apps/open.post.ts`: app launch API
- `server/utils/apps.ts`: allowlisted local apps
- `../../docs/`: current product, architecture, recognition, API, and test documents
