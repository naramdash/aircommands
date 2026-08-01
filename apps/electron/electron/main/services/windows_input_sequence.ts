import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  normalizeInputSequence,
  type InputKey,
  type InputSequenceStep,
} from './input_sequence'

type VirtualKey = {
  code: number
  extended?: boolean
}

type WindowsInputSequenceOptions = {
  platform?: NodeJS.Platform
  runPowerShell?: (encodedCommand: string, timeoutMs: number) => Promise<void>
}

const execFileAsync = promisify(execFile)
const KEY_HOLD_MS = 35
const WHEEL_DELTA = 120

const NAMED_VIRTUAL_KEYS: Partial<Record<InputKey, VirtualKey>> = {
  CONTROL: { code: 0x11 },
  ALT: { code: 0x12 },
  SHIFT: { code: 0x10 },
  META: { code: 0x5B, extended: true },
  ENTER: { code: 0x0D },
  SPACE: { code: 0x20 },
  TAB: { code: 0x09 },
  ESCAPE: { code: 0x1B },
  BACKSPACE: { code: 0x08 },
  DELETE: { code: 0x2E, extended: true },
  INSERT: { code: 0x2D, extended: true },
  PRINT_SCREEN: { code: 0x2C, extended: true },
  HOME: { code: 0x24, extended: true },
  END: { code: 0x23, extended: true },
  PAGE_UP: { code: 0x21, extended: true },
  PAGE_DOWN: { code: 0x22, extended: true },
  ARROW_UP: { code: 0x26, extended: true },
  ARROW_DOWN: { code: 0x28, extended: true },
  ARROW_LEFT: { code: 0x25, extended: true },
  ARROW_RIGHT: { code: 0x27, extended: true },
  BACKQUOTE: { code: 0xC0 },
  MINUS: { code: 0xBD },
  EQUAL: { code: 0xBB },
  BRACKET_LEFT: { code: 0xDB },
  BRACKET_RIGHT: { code: 0xDD },
  BACKSLASH: { code: 0xDC },
  SEMICOLON: { code: 0xBA },
  QUOTE: { code: 0xDE },
  COMMA: { code: 0xBC },
  PERIOD: { code: 0xBE },
  SLASH: { code: 0xBF },
}

const NATIVE_INPUT_TYPE = String.raw`
using System;
using System.Runtime.InteropServices;

public static class AircommandsNativeInput
{
    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const int WHEEL_DELTA = 120;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion data;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public HARDWAREINPUT hardware;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint inputCount, INPUT[] inputs, int inputSize);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    public static void Key(ushort virtualKey, bool release, bool extended)
    {
        uint flags = release ? KEYEVENTF_KEYUP : 0;
        if (extended) flags |= KEYEVENTF_EXTENDEDKEY;

        INPUT input = new INPUT
        {
            type = INPUT_KEYBOARD,
            data = new InputUnion
            {
                keyboard = new KEYBDINPUT
                {
                    wVk = virtualKey,
                    wScan = 0,
                    dwFlags = flags,
                    time = 0,
                    dwExtraInfo = UIntPtr.Zero
                }
            }
        };

        if (SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT))) != 1)
        {
            throw new InvalidOperationException("SendInput failed: " + Marshal.GetLastWin32Error());
        }
    }

    public static void Wheel(int delta)
    {
        int absoluteDelta = Math.Abs(delta);
        int sign = delta >= 0 ? 1 : -1;
        int steps = absoluteDelta / WHEEL_DELTA;
        if (steps == 0) steps = 1;

        for (int i = 0; i < steps; i++)
        {
            INPUT input = new INPUT
            {
                type = INPUT_MOUSE,
                data = new InputUnion
                {
                    mouse = new MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = unchecked((uint)(sign * WHEEL_DELTA)),
                        dwFlags = MOUSEEVENTF_WHEEL,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            };

            if (SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT))) != 1)
            {
                throw new InvalidOperationException("SendInput failed: " + Marshal.GetLastWin32Error());
            }

            if (steps > 1)
            {
                System.Threading.Thread.Sleep(20);
            }
        }
    }
}
`

export async function executeWindowsInputSequence(
  steps: InputSequenceStep[],
  options: WindowsInputSequenceOptions = {},
): Promise<void> {
  if ((options.platform ?? process.platform) !== 'win32') {
    throw new Error('UNSUPPORTED_INPUT_PLATFORM')
  }

  const normalized = normalizeInputSequence(steps)
  if (!normalized) throw new Error('INVALID_INPUT_SEQUENCE')

  const encodedCommand = Buffer.from(buildPowerShellInputScript(normalized), 'utf16le')
    .toString('base64')
  const expectedDurationMs = normalized.reduce((duration, step) =>
    duration + (step.type === 'delay' ? step.durationMs : KEY_HOLD_MS), 0)
  const timeoutMs = Math.max(5_000, expectedDurationMs + 5_000)

  try {
    await (options.runPowerShell ?? runPowerShell)(encodedCommand, timeoutMs)
  } catch {
    throw new Error('INPUT_SEQUENCE_EXECUTION_FAILED')
  }
}

export function buildPowerShellInputScript(steps: InputSequenceStep[]): string {
  const commands = steps.map((step) => {
    if (step.type === 'delay') {
      return `Start-Sleep -Milliseconds ${step.durationMs}`
    }

    if (step.type === 'scroll') {
      const delta = step.notches * WHEEL_DELTA * (step.direction === 'up' ? 1 : -1)
      return `[AircommandsNativeInput]::Wheel(${delta})`
    }

    const virtualKeys = step.keys.map(getVirtualKey)
    const keyDown = virtualKeys.map((key) => toPowerShellKeyCommand(key, false)).join('\n')
    const keyUp = virtualKeys.toReversed()
      .map((key) => toPowerShellKeyCommand(key, true))
      .join('\n')

    return `try {\n${keyDown}\nStart-Sleep -Milliseconds ${KEY_HOLD_MS}\n} finally {\n${keyUp}\n}`
  }).join('\n')

  return `$ErrorActionPreference = 'Stop'\nAdd-Type -TypeDefinition @'\n${NATIVE_INPUT_TYPE}\n'@\n${commands}\n`
}

export function getVirtualKey(key: InputKey): VirtualKey {
  const named = NAMED_VIRTUAL_KEYS[key]
  if (named) return named

  if (/^[A-Z]$/.test(key)) return { code: key.charCodeAt(0) }
  if (/^[0-9]$/.test(key)) return { code: key.charCodeAt(0) }
  if (/^F(?:[1-9]|1[0-2])$/.test(key)) {
    return { code: 0x70 + Number(key.slice(1)) - 1 }
  }

  throw new Error('INVALID_INPUT_KEY')
}

function toPowerShellKeyCommand(key: VirtualKey, release: boolean): string {
  return `[AircommandsNativeInput]::Key(${key.code}, $${release}, $${Boolean(key.extended)})`
}

async function runPowerShell(encodedCommand: string, timeoutMs: number): Promise<void> {
  await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
    {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    },
  )
}
