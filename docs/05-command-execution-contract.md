# Command Execution Contract

## Request Shape

Electron request fields:

- applicationId: registered application ID
- source: request source label
- gesture: gesture identifier
- clientRequestId: optional dedupe key

The Electron renderer cannot send raw paths, commands, or arguments to the launch
endpoint. Web API requests retain their existing app-name contract.

## Response Shape

### Success

- success: true
- applicationId
- applicationName
- message
- requestId

### Failure

- success: false
- applicationId (optional)
- error (enum)
- message
- requestId
- availableApps (optional)

## Failure Enum

- INVALID_BODY
- APPLICATION_NOT_FOUND
- APPLICATION_TARGET_MISSING (Electron)
- UNSUPPORTED_PLATFORM (Electron)
- DUPLICATE_REQUEST
- EXECUTION_FAILED

## Dedupe Policy

Both app stacks maintain a short in-memory dedupe window (`REQUEST_DEDUPE_MS = 3000`) keyed by requestId.

## Platform Command Mapping

- Electron built-ins allow multiple commands per platform and run them as trusted fallbacks.
- Windows user applications are validated `.exe`/`.lnk` paths and are launched with
  Electron `shell.openPath`, without constructing a shell command.
- Windows AppUserModelID targets are discovered in the main process and launched by
  passing `shell:AppsFolder\<AppID>` as one argument to `explorer.exe`.
- Steam targets persist only a validated numeric App ID. The main process resolves
  `steam.exe` from trusted registry or conventional install locations and launches
  it with separate `-applaunch` and App ID arguments, without shell parsing.
- Discovery IDs are deterministic target hashes and must resolve against the
  main-process discovery cache before registration or assignment.
- Web utilities (`apps/web/server/utils/apps.ts`) currently map to one command per platform.

## Security Note

Launching local apps is a privileged operation. Electron resolves only persisted
application IDs in the main process. Any externally reachable server deployment
must add stronger origin/session protections before exposure.
