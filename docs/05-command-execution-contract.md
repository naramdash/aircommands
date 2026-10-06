# Command Execution Contract

## Request Shape

Electron request fields:

- applicationId: registered application ID
- source: request source label
- gesture: gesture identifier
- clientRequestId: optional dedupe key

The Electron renderer cannot send raw paths, commands, or arguments to the launch
endpoint.

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

The main process maintains a short in-memory dedupe window
(`REQUEST_DEDUPE_MS = 3000`) keyed by requestId.

## Input Sequence & Windows Command Execution Contracts (Electron)

In addition to launching application targets (`app:open`), the Electron main process handles gesture execution for:

### Input Sequence Execution (`input-sequence:execute`)

- **Payload**: `{ gesture: string }`
- **Behavior**: Main process loads the persisted key/delay/scroll sequence for the gesture from settings (`inputSequenceAssignments`), validates it, and generates native keyboard key events and mouse wheel scrolls via Windows `SendInput` API.
- **Success Response**: `{ success: true, label: string, message: string }`
- **Failure Response**: `{ success: false, error: 'INVALID_BODY' | 'INPUT_SEQUENCE_BUSY' | 'INPUT_SEQUENCE_NOT_FOUND' | 'UNSUPPORTED_INPUT_PLATFORM' | 'INPUT_SEQUENCE_EXECUTION_FAILED', message: string }`
- **Security**: The renderer sends only the gesture identifier; it cannot pass arbitrary key codes or command strings to the execution endpoint.

### Windows Command Execution (`windows-command:execute`)

- **Payload**: `{ gesture: string }`
- **Behavior**: Main process loads the stored predefined Windows function identifier (one of 13 supported shortcuts) from settings (`windowsCommandAssignments`), maps it to virtual key sequences, and sends native input via `SendInput`.
- **Success Response**: `{ success: true, label: string, message: string }`
- **Failure Response**: `{ success: false, error: 'INVALID_BODY' | 'WINDOWS_COMMAND_BUSY' | 'WINDOWS_COMMAND_NOT_FOUND' | 'UNSUPPORTED_WINDOWS_COMMAND_PLATFORM' | 'WINDOWS_COMMAND_EXECUTION_FAILED', message: string }`

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

## Security Note

Launching local apps and sending synthetic input events are privileged operations.
Electron resolves only persisted application IDs, input sequences, and Windows
command definitions in the main process. External pages loaded in the login
browser do not receive the AirCommands preload bridge.
