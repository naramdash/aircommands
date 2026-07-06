import { exec } from 'child_process'

export type CommandResult =
  | { success: true }
  | { success: false; message: string }

export function runAppCommand(command: string): Promise<CommandResult> {
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

