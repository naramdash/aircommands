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
      applicationId?: unknown
      source?: unknown
      gesture?: unknown
      clientRequestId?: unknown
    }): Promise<OpenAppResponse>
    getSettings(): Promise<SettingsResponse>
    discoverApplications(payload?: {
      forceRefresh?: boolean
    }): Promise<ApplicationDiscoveryResponse>
    addDiscoveredApplication(payload: {
      discoveryId: string
    }): Promise<SettingsMutationResponse & {
      applicationId?: string
      created?: boolean
    }>
    assignDiscoveredApplication(payload: {
      gesture: string
      discoveryId: string
    }): Promise<SettingsMutationResponse & {
      applicationId?: string
      created?: boolean
    }>
    pickAndAssignApplication(payload: {
      gesture: string
    }): Promise<SettingsMutationResponse & {
      canceled?: boolean
      applicationId?: string
      created?: boolean
    }>
    replaceApplicationWithDiscovered(payload: {
      applicationId: string
      discoveryId: string
    }): Promise<SettingsMutationResponse>
    pickApplication(): Promise<SettingsMutationResponse & { canceled?: boolean }>
    renameApplication(payload: {
      applicationId: string
      name: string
    }): Promise<SettingsMutationResponse>
    replaceApplicationTarget(payload: {
      applicationId: string
    }): Promise<SettingsMutationResponse & { canceled?: boolean }>
    removeApplication(payload: {
      applicationId: string
    }): Promise<SettingsMutationResponse & { canceled?: boolean, clearedAssignments?: number }>
    assignGesture(payload: {
      gesture: string
      applicationId: string | null
    }): Promise<SettingsMutationResponse>
    assignInputSequence(payload: {
      gesture: string
      steps: InputSequenceStep[]
    }): Promise<SettingsMutationResponse>
    executeInputSequence(payload: {
      gesture: string
    }): Promise<InputSequenceExecutionResponse>
    clearGestureAssignments(): Promise<SettingsMutationResponse & {
      canceled?: boolean
      clearedAssignments?: number
    }>
    testApplication(payload: {
      applicationId: string
    }): Promise<OpenAppResponse>
    closeBrowser(): Promise<BrowserCloseResponse>
    getBrowserStatus(): Promise<BrowserStatusResponse>
    getWebLoginSettings(): Promise<WebLoginSettingsResponse>
    setWebLoginSettings(payload: {
      loginUrl: string
      loginHint: string
    }): Promise<WebLoginSettingsResponse>
    openWebLogin(): Promise<WebLoginResponse>
    onBrowserStatus(listener: (status: BrowserStatus) => void): () => void
    onApplicationCatalogUpdated(
      listener: (result: ApplicationDiscoveryResponse) => void
    ): () => void
    notifyGesture(payload: {
      status: 'success' | 'failure'
      gestureLabel: string
      appLabel: string
      message?: string
    }): Promise<{ success: true } | { success: false, error: 'INVALID_NOTIFY_PAYLOAD' }>
    onMainProcessMessage(listener: (message: string) => void): () => void
  }
}

type OpenAppResponse =
  | {
    success: true
    applicationId: string
    applicationName: string
    message: string
    requestId: string
  }
  | {
    success: false
    applicationId?: string
    error:
    | 'INVALID_BODY'
    | 'APPLICATION_NOT_FOUND'
    | 'APPLICATION_TARGET_MISSING'
    | 'UNSUPPORTED_PLATFORM'
    | 'DUPLICATE_REQUEST'
    | 'EXECUTION_FAILED'
    message: string
    requestId: string
  }

type ApplicationSummary = {
  id: string
  name: string
  targetKind: 'builtin' | 'windows-path' | 'windows-app-id' | 'steam-app'
  targetLabel: string
  iconText: string
  iconDataUrl?: string
}

type DiscoveredApplication = {
  discoveryId: string
  name: string
  targetKind: 'windows-path' | 'windows-app-id' | 'steam-app'
  iconText: string
  iconDataUrl?: string
  registeredApplicationId?: string
}

type ApplicationDiscoveryResponse =
  | {
    success: true
    applications: DiscoveredApplication[]
    warning?: string
  }
  | { success: false, error: string, message: string }

type UserSettingsView = {
  applications: ApplicationSummary[]
  gestureAssignments: Record<string, string | null>
  inputSequenceAssignments: Record<string, InputSequenceStep[] | null>
  platform: string
  supportsCustomApplications: boolean
  recoveryNotice?: string
}

type SettingsResponse =
  | { success: true, settings: UserSettingsView }
  | { success: false, error: string, message: string }

type SettingsMutationResponse =
  | { success: true, settings?: UserSettingsView }
  | { success: false, error: string, message: string }

type InputKey =
  | 'CONTROL'
  | 'ALT'
  | 'SHIFT'
  | 'META'
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'ENTER' | 'SPACE' | 'TAB' | 'ESCAPE' | 'BACKSPACE' | 'DELETE' | 'INSERT'
  | 'HOME' | 'END' | 'PAGE_UP' | 'PAGE_DOWN'
  | 'ARROW_UP' | 'ARROW_DOWN' | 'ARROW_LEFT' | 'ARROW_RIGHT'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6'
  | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12'
  | 'BACKQUOTE' | 'MINUS' | 'EQUAL' | 'BRACKET_LEFT' | 'BRACKET_RIGHT'
  | 'BACKSLASH' | 'SEMICOLON' | 'QUOTE' | 'COMMA' | 'PERIOD' | 'SLASH'

type InputSequenceStep =
  | { type: 'keys', keys: InputKey[] }
  | { type: 'delay', durationMs: number }

type InputSequenceExecutionResponse =
  | { success: true, label: string, message: string }
  | { success: false, error: string, message: string }

type BrowserStatus = {
  open: boolean
  loading: boolean
  url: string
  title: string
}

type BrowserCloseResponse = {
  success: true
  status: BrowserStatus
}

type BrowserStatusResponse = {
  success: true
  status: BrowserStatus
}

type WebLoginSettings = {
  loginUrl: string
  loginHint: string
}

type WebLoginSettingsResponse =
  | { success: true, settings: WebLoginSettings }
  | { success: false, error: string, message: string }

type WebLoginResponse =
  | { success: true, status: BrowserStatus }
  | { success: false, error: string, message: string }
