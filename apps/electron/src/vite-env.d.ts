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
    clearGestureAssignments(): Promise<SettingsMutationResponse & {
      canceled?: boolean
      clearedAssignments?: number
    }>
    testApplication(payload: {
      applicationId: string
    }): Promise<OpenAppResponse>
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
