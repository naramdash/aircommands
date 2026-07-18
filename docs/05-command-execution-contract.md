# Command Execution Contract

## Request Shape

Logical request fields:

- app: target app name
- source: request source label
- gesture: gesture identifier
- clientRequestId: optional dedupe key

## Response Shape

### Success

- success: true
- app: normalized app name
- message
- requestId

### Failure

- success: false
- app (optional)
- error (enum)
- message
- requestId
- availableApps (optional)

## Failure Enum

- INVALID_BODY
- APPLICATION_NOT_FOUND
- DUPLICATE_REQUEST
- EXECUTION_FAILED

## Dedupe Policy

Both app stacks maintain a short in-memory dedupe window (`REQUEST_DEDUPE_MS = 3000`) keyed by requestId.

## Platform Command Mapping

- Electron utilities (`apps/electron/electron/main/services/apps.ts`) now allow multiple commands per platform and run them as fallbacks.
- Web utilities (`apps/web/server/utils/apps.ts`) currently map to one command per platform.

## Security Note

Launching local apps is a privileged operation. Any externally reachable server deployment must add stronger origin/session protections before exposure.
