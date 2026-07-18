# Web App (Nuxt)

## Stack

- Nuxt 4
- Nitro server routes
- Vitest for unit tests

## Key Paths

- app/app.vue: web camera UI and gesture flow
- app/utils/gesture_command_detection/*: touch recognition and reducer
- server/api/apps/open.post.ts: main app-launch endpoint
- server/api/open-chrome.post.ts: legacy endpoint
- server/utils/*: request parsing, app allowlist, command runner

## API Behavior

`POST /api/apps/open` accepts request body/query through normalized parsing and returns:

- success response with app and requestId
- failure response with one of:
  - INVALID_BODY
  - APPLICATION_NOT_FOUND
  - DUPLICATE_REQUEST
  - EXECUTION_FAILED

## Tests

Vitest include patterns from `apps/web/vitest.config.ts`:

- app/**/__tests__/*.{test,spec}.ts
- server/**/__tests__/*.{test,spec}.ts
- test/unit/*.{test,spec}.ts
- test/e2e/*.{test,spec}.ts

Current coverage focus:

- gesture command map and detection/reducer logic
- open_app and request parsing utilities

## Divergence From Electron

Web server app-launch utilities still use single-command execution per app, while Electron side has platform fallback command arrays. Aligning these two paths is a recommended follow-up.
