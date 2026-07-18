import { exec } from 'node:child_process'

export type CommandResult =
  | { success: true }
  | { success: false; message: string }

export async function runAppCommand(command: string | string[]): Promise<CommandResult> {
  if (Array.isArray(command)) {
    let lastFailureMessage = '실행 가능한 명령을 찾지 못했습니다.'

    for (const candidate of command) {
      const result = await runSingleCommand(candidate)
      if (result.success) return result
      lastFailureMessage = result.message
    }

    return {
      success: false,
      message: lastFailureMessage,
    }
  }

  return runSingleCommand(command)
}

function runSingleCommand(command: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        resolve({
          success: false,
          message: error.message,
        })
        return
      }

      resolve({ success: true })
    })
  })
}
