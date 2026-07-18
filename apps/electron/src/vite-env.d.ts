/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  aircommands: {
    openApp(payload: {
      app?: unknown
      source?: unknown
      gesture?: unknown
      clientRequestId?: unknown
    }): Promise<
      | {
        success: true
        app: string
        message: string
        requestId: string
      }
      | {
        success: false
        app?: string
        error:
        | 'INVALID_BODY'
        | 'APPLICATION_NOT_FOUND'
        | 'DUPLICATE_REQUEST'
        | 'EXECUTION_FAILED'
        message: string
        availableApps?: string[]
        requestId: string
      }
    >
    notifyGesture(payload: {
      status: 'success' | 'failure'
      gestureLabel: string
      appLabel: string
      message?: string
    }): Promise<{ success: true } | { success: false, error: 'INVALID_NOTIFY_PAYLOAD' }>
    onMainProcessMessage(listener: (message: string) => void): () => void
  }
}
