import {
  app,
  BrowserWindow,
  dialog,
  shell,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
} from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { openAppRequest } from './services/open_app'
import {
  configureApplicationSettingsStore,
  getApplicationSettingsStore,
} from './services/application_settings'
import {
  buildSettingsView,
  pickWindowsApplication,
  validateWindowsApplicationTarget,
} from './services/platform_application_adapter'
import {
  configureWindowsApplicationDiscoveryService,
  getWindowsApplicationDiscoveryService,
} from './services/windows_application_discovery'
import {
  configureWebLoginSettingsStore,
  getWebLoginSettingsStore,
  isSameLoginOrigin,
} from './services/web_login_settings'
import appIdentity from '../../build/app_identity.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

configureApplicationSettingsStore(
  path.join(app.getPath('userData'), 'config', 'settings.json'),
)
configureWindowsApplicationDiscoveryService(
  path.join(app.getPath('userData'), 'config', 'application-catalog.json'),
)
configureWebLoginSettingsStore(
  path.join(app.getPath('userData'), 'config', 'web-login.json'),
)

// Disable GPU Acceleration for Windows 7
if (process.platform === 'win32' && os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(appIdentity.appId)

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let browserWindow: BrowserWindow | null = null
let browserPopupGeneration = 0
let tray: Tray | null = null
let isQuitting = false
let gestureNotificationsEnabled = true
let trayBackgroundNoticeShown = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
const APP_ICON_PNG = 'app-icon.png'
const APP_ICON_ICO = 'app-icon.ico'
const BROWSER_PARTITION = 'persist:aircommands-browser'
const GOOGLE_ACCOUNTS_HOST = 'accounts.google.com'

type BrowserStatus = {
  open: boolean
  loading: boolean
  url: string
  title: string
}

const emptyBrowserStatus = (): BrowserStatus => ({
  open: false,
  loading: false,
  url: '',
  title: '',
})

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function getBrowserStatus(): BrowserStatus {
  if (!browserWindow || browserWindow.isDestroyed()) return emptyBrowserStatus()

  return {
    open: true,
    loading: browserWindow.webContents.isLoading(),
    url: browserWindow.webContents.getURL(),
    title: browserWindow.getTitle(),
  }
}

function sendBrowserStatus() {
  if (!win || win.isDestroyed()) return
  win.webContents.send('browser:status', getBrowserStatus())
}

function isGoogleAccountsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === GOOGLE_ACCOUNTS_HOST
  } catch {
    return false
  }
}

async function clickGoogleAccountHint(popup: BrowserWindow): Promise<boolean> {
  if (popup.isDestroyed() || !isGoogleAccountsUrl(popup.webContents.getURL())) return false

  const { loginHint } = await getWebLoginSettingsStore().getSettings()
  const normalizedHint = loginHint.trim().toLowerCase()
  if (!normalizedHint) return false

  const serializedHint = JSON.stringify(normalizedHint)
  const script = `(() => {
    const hint = ${serializedHint};
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const accountElements = Array.from(document.querySelectorAll('[data-identifier], [data-email]'));
    let match = accountElements.find((element) => {
      const identifier = (element.getAttribute('data-identifier') || element.getAttribute('data-email') || '')
        .trim()
        .toLowerCase();
      return identifier === hint && isVisible(element);
    });
    if (!match) {
      match = Array.from(document.querySelectorAll('div, span')).find((element) => {
        if (element.children.length > 0 || !isVisible(element)) return false;
        return (element.textContent || '').trim().toLowerCase() === hint;
      });
    }
    if (!match) return null;
    const target = match.closest('[role="link"], [role="button"], button, a, li') || match;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`

  try {
    const target = await popup.webContents.executeJavaScript(script, true) as { x: number; y: number } | null
    if (!target || popup.isDestroyed()) return false

    popup.show()
    popup.focus()
    popup.webContents.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y })
    popup.webContents.sendInputEvent({
      type: 'mouseDown',
      x: target.x,
      y: target.y,
      button: 'left',
      clickCount: 1,
    })
    popup.webContents.sendInputEvent({
      type: 'mouseUp',
      x: target.x,
      y: target.y,
      button: 'left',
      clickCount: 1,
    })
    return true
  } catch {
    return false
  }
}

function automateGoogleAccountChooser(popup: BrowserWindow) {
  void (async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (popup.isDestroyed()) return
      if (await clickGoogleAccountHint(popup)) return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  })()
}

async function dispatchCrossOriginClick(browser: BrowserWindow, x: number, y: number): Promise<boolean> {
  if (browser.isDestroyed()) return false

  const debuggerClient = browser.webContents.debugger
  let attachedHere = false
  try {
    if (!debuggerClient.isAttached()) {
      debuggerClient.attach('1.3')
      attachedHere = true
    }
    await debuggerClient.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
    await debuggerClient.sendCommand('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    await debuggerClient.sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    })
    return true
  } catch (error) {
    console.warn('Failed to dispatch GSI iframe click through Chromium:', error)
    return false
  } finally {
    if (attachedHere && debuggerClient.isAttached()) debuggerClient.detach()
  }
}

async function injectWebLoginHint(options: { clickButton?: boolean } = {}): Promise<boolean> {
  if (!browserWindow || browserWindow.isDestroyed()) return false

  const currentUrl = browserWindow.webContents.getURL()
  const { loginUrl, loginHint } = await getWebLoginSettingsStore().getSettings()
  if (!loginUrl || !loginHint || !isSameLoginOrigin(currentUrl, loginUrl)) return false

  const serializedHint = JSON.stringify(loginHint)
  const script = `(() => {
    const hint = ${serializedHint};
    const root = document.getElementById('g_id_onload');
    if (!root) return { found: false, initialized: false, button: null };
    root.setAttribute('data-login_hint', hint);
    root.removeAttribute('data-use_fedcm_for_button');
    root.removeAttribute('data-button_auto_select');
    const identity = globalThis.google?.accounts?.id;
    const callback = globalThis.onSignIn;
    const clientId = root.getAttribute('data-client_id');
    if (!identity || typeof callback !== 'function' || !clientId) {
      return { found: true, initialized: false, button: null };
    }
    const buttonRoot = document.querySelector('.g_id_signin');
    if (!buttonRoot || typeof identity.renderButton !== 'function') {
      return { found: true, initialized: false, button: null };
    }
    const configuredHint = buttonRoot.getAttribute('data-aircommands-login-hint');
    if (configuredHint !== hint) {
      // The page's HTML API may have rendered this button before we could add
      // data-login_hint. Re-render it after initialize() so the new hint is
      // part of the active GIS configuration used by the button flow.
      identity.initialize({
        client_id: clientId,
        context: root.getAttribute('data-context') || 'signin',
        ux_mode: 'popup',
        callback,
        login_hint: hint,
        auto_select: false,
      });
      const buttonConfig = {};
      for (const name of ['type', 'theme', 'size', 'text', 'shape', 'logo_alignment', 'width', 'locale']) {
        const value = buttonRoot.getAttribute('data-' + name);
        if (value) buttonConfig[name] = value;
      }
      buttonRoot.setAttribute('data-login_hint', hint);
      buttonRoot.replaceChildren();
      identity.renderButton(buttonRoot, buttonConfig);
      // Set the marker only after a render attempt has completed so a later
      // retry can recover if the embedded browser rejected the first one.
      buttonRoot.setAttribute('data-aircommands-login-hint', hint);
    }
    // The clickable surface is the cross-origin iframe generated by GSI. Do
    // not treat the empty host div as a ready target while it is rendering.
    const button = document.querySelector('.g_id_signin iframe');
    const rect = button?.getBoundingClientRect();
    return {
      found: true,
      initialized: true,
      button: rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null,
    };
  })()`

  try {
    const result = await browserWindow.webContents.executeJavaScript(script, true) as {
      initialized?: boolean
      button?: { x: number; y: number } | null
    }

    if (!options.clickButton || !result?.initialized || !result.button) {
      return Boolean(result?.initialized)
    }

    const browser = browserWindow
    if (!browser || browser.isDestroyed()) return false
    const x = Math.round(result.button.x)
    const y = Math.round(result.button.y)
    browser.show()
    browser.focus()
    browser.webContents.focus()
    await new Promise((resolve) => setTimeout(resolve, 80))
    if (browser.isDestroyed()) return false
    return await dispatchCrossOriginClick(browser, x, y)
  } catch (error) {
    console.warn('Failed to inject web login Google account hint:', error)
    return false
  }
}

function getBrowserWindow(): BrowserWindow {
  if (browserWindow && !browserWindow.isDestroyed()) return browserWindow

  browserWindow = new BrowserWindow({
    title: 'Aircommands 브라우저',
    icon: getWindowIconPath(),
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    parent: win ?? undefined,
    webPreferences: {
      partition: BROWSER_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isWebUrl(url)) return { action: 'deny' }

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        title: 'Aircommands 브라우저 팝업',
        icon: getWindowIconPath(),
        width: 720,
        height: 760,
        webPreferences: {
          partition: BROWSER_PARTITION,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      },
    }
  })

  browserWindow.webContents.on('did-create-window', (childWindow) => {
    browserPopupGeneration += 1
    // The regular GSI popup is more reliable than FedCM inside Electron.
    // If Google still shows Account Chooser, select only the exact saved
    // login_hint account; password and 2FA pages are intentionally untouched.
    automateGoogleAccountChooser(childWindow)
  })

  browserWindow.webContents.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault()
  })
  browserWindow.webContents.on('did-start-loading', sendBrowserStatus)
  browserWindow.webContents.on('did-stop-loading', sendBrowserStatus)
  browserWindow.webContents.on('did-finish-load', () => {
    sendBrowserStatus()
  })
  browserWindow.webContents.on('did-navigate', sendBrowserStatus)
  browserWindow.webContents.on('did-navigate-in-page', sendBrowserStatus)
  browserWindow.webContents.on('page-title-updated', sendBrowserStatus)
  browserWindow.webContents.on('render-process-gone', (_event, details) => {
    console.warn('Browser render process exited:', details.reason)
    sendBrowserStatus()
  })
  browserWindow.on('closed', () => {
    browserWindow = null
    sendBrowserStatus()
  })

  return browserWindow
}

async function openBrowser(url: string) {
  const browser = getBrowserWindow()
  if (browser.webContents.getURL() !== url) await browser.loadURL(url)
  browser.show()
  browser.focus()
  sendBrowserStatus()
  return getBrowserStatus()
}

async function openWebLogin() {
  const { loginUrl, loginHint } = await getWebLoginSettingsStore().getSettings()
  if (!loginUrl) {
    return {
      success: false as const,
      error: 'WEB_LOGIN_URL_MISSING',
      message: '먼저 웹사이트 주소를 저장하세요.',
    }
  }
  if (!loginHint) {
    return {
      success: false as const,
      error: 'WEB_LOGIN_HINT_MISSING',
      message: '먼저 Google 계정 힌트를 저장하세요.',
    }
  }

  const status = await openBrowser(loginUrl)
  // Wait for GSI to load, configure the button once, and let its iframe settle
  // before sending the native click. Repeatedly replacing the iframe makes it
  // flash and can invalidate the click target.
  let initialized = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await injectWebLoginHint()) {
      initialized = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (initialized) {
    await new Promise((resolve) => setTimeout(resolve, 350))
    const popupGenerationBeforeClick = browserPopupGeneration
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const clickDispatched = await injectWebLoginHint({ clickButton: true })
      if (!clickDispatched) {
        await new Promise((resolve) => setTimeout(resolve, 150))
        continue
      }
      // A GSI popup should be created immediately after a valid button click.
      // Retry only when no popup appeared, which also covers an iframe that
      // was visible but not yet interactive.
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (browserPopupGeneration !== popupGenerationBeforeClick) break
    }
  }
  return { success: true as const, status }
}

function closeBrowserWindow() {
  const browser = browserWindow
  browserWindow = null
  if (browser && !browser.isDestroyed()) browser.close()
  sendBrowserStatus()
}

function getTrayIconPath() {
  return path.join(process.env.VITE_PUBLIC, APP_ICON_PNG)
}

function getNotificationIconPath() {
  return path.join(process.env.VITE_PUBLIC, APP_ICON_PNG)
}

function getWindowIconPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.VITE_PUBLIC, APP_ICON_ICO)
  }

  return path.join(process.env.VITE_PUBLIC, APP_ICON_PNG)
}

function getFallbackTrayIcon() {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAQAAAC1QeVaAAAAV0lEQVR4AWOgO3fu3D8QGv///x8mA0QwQJwBUsLw//9/GA0Q5wJxDkQDJDkQzYHkQDSB5EAwQJwD0QBJDoQzQJIj2Q0QZ0A0gORAMECcA9EASQ6EM0CSI8kNAJY9D0G3gkQ2AAAAAElFTkSuQmCC',
  )
}

function getTrayIcon() {
  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) return icon

  const fallback = getFallbackTrayIcon()
  if (!fallback.isEmpty()) return fallback

  return nativeImage.createEmpty()
}

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }

  win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

function updateTrayMenu() {
  if (!tray) return

  const menu = Menu.buildFromTemplate([
    {
      label: 'Aircommands 열기',
      click: () => showMainWindow(),
    },
    {
      label: gestureNotificationsEnabled ? '제스처 알림 끄기' : '제스처 알림 켜기',
      click: () => {
        gestureNotificationsEnabled = !gestureNotificationsEnabled
        updateTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
}

function createTray() {
  if (tray) return

  tray = new Tray(getTrayIcon())
  tray.setToolTip('Aircommands')
  tray.on('double-click', () => showMainWindow())
  tray.on('click', () => showMainWindow())
  updateTrayMenu()
}

function showNotification(title: string, body: string) {
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title,
    body,
    icon: getNotificationIconPath(),
  })

  notification.on('click', () => {
    showMainWindow()
  })

  notification.show()
}

function notifyGesture(payload: {
  status: 'success' | 'failure'
  gestureLabel: string
  appLabel: string
  message?: string
}) {
  if (!gestureNotificationsEnabled) return

  const title = payload.status === 'success'
    ? `제스처 성공: ${payload.gestureLabel}`
    : `제스처 실패: ${payload.gestureLabel}`

  const body = payload.status === 'success'
    ? `${payload.appLabel} 실행 요청을 보냈습니다.`
    : payload.message
      ? `${payload.appLabel} 실행 실패 - ${payload.message}`
      : `${payload.appLabel} 실행에 실패했습니다.`

  showNotification(title, body)
}

function notifyTrayBackgroundRecognition() {
  if (trayBackgroundNoticeShown) return

  trayBackgroundNoticeShown = true

  showNotification(
    'Aircommands가 트레이에서 실행 중입니다',
    '창을 닫아도 제스처 인식은 계속 동작합니다. 다시 열려면 트레이 아이콘을 클릭하세요.',
  )
}

function parseNotifyPayload(payload: unknown): {
  status: 'success' | 'failure'
  gestureLabel: string
  appLabel: string
  message?: string
} | null {
  if (!payload || typeof payload !== 'object') return null

  const candidate = payload as Record<string, unknown>
  if (candidate.status !== 'success' && candidate.status !== 'failure') return null
  if (typeof candidate.gestureLabel !== 'string' || typeof candidate.appLabel !== 'string') return null
  if (candidate.message !== undefined && typeof candidate.message !== 'string') return null

  return {
    status: candidate.status,
    gestureLabel: candidate.gestureLabel,
    appLabel: candidate.appLabel,
    message: candidate.message,
  }
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: getWindowIconPath(),
    webPreferences: {
      preload,
      backgroundThrottling: false,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (event) => {
    if (isQuitting || !tray) return
    event.preventDefault()
    win?.hide()
    notifyTrayBackgroundRecognition()
  })

  win.on('minimize', () => {
    if (isQuitting) return
    win?.hide()
  })

  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

app.whenReady().then(async () => {
  const discoveryService = getWindowsApplicationDiscoveryService()
  await discoveryService.initialize()
  try {
    createTray()
  } catch (error) {
    console.error('Failed to create tray icon:', error)
  }
  createWindow()

  if (process.platform === 'win32') {
    void getApplicationSettingsStore().getSettings()
      .then((settings) => discoveryService.discover(settings, true))
      .then((result) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('application-catalog-updated', result)
        }
      })
      .catch((error) => {
        console.warn('Failed to refresh Windows application catalog:', error)
      })
  }
}).catch((error) => {
  console.error('App initialization failed:', error)
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin' && isQuitting) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  closeBrowserWindow()
})

app.on('second-instance', () => {
  showMainWindow()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

ipcMain.handle('app:open', async (_event, payload) => {
  return openAppRequest(payload)
})

ipcMain.handle('browser:close', async () => {
  closeBrowserWindow()
  return { success: true, status: getBrowserStatus() }
})

ipcMain.handle('browser:get-status', async () => {
  return { success: true, status: getBrowserStatus() }
})

ipcMain.handle('web-login:get-settings', async () => {
  const settings = await getWebLoginSettingsStore().getSettings()
  return { success: true, settings }
})

ipcMain.handle('web-login:set-settings', async (_event, payload) => {
  if (
    !isRecord(payload)
    || typeof payload.loginUrl !== 'string'
    || typeof payload.loginHint !== 'string'
    || !payload.loginUrl.trim()
    || !payload.loginHint.trim()
  ) {
    return {
      success: false,
      error: 'INVALID_WEB_LOGIN_SETTINGS',
      message: '웹사이트 주소와 Google 계정 힌트를 입력하세요.',
    }
  }

  try {
    const settings = await getWebLoginSettingsStore().setSettings({
      loginUrl: payload.loginUrl,
      loginHint: payload.loginHint,
    })
    return { success: true, settings }
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : ''
    return {
      success: false,
      error: 'INVALID_WEB_LOGIN_SETTINGS',
      message: errorCode === 'INVALID_LOGIN_URL'
        ? 'http 또는 https 웹사이트 주소를 입력하세요.'
        : errorCode === 'INVALID_LOGIN_HINT'
          ? '올바른 Google 계정 힌트를 입력하세요.'
          : '웹 로그인 설정을 저장하지 못했습니다.',
    }
  }
})

ipcMain.handle('web-login:open', async () => {
  try {
    return await openWebLogin()
  } catch (error) {
    return {
      success: false,
      error: 'WEB_LOGIN_FAILED',
      message: error instanceof Error ? error.message : 'Google 로그인 화면을 열지 못했습니다.',
    }
  }
})

ipcMain.handle('settings:get', async () => {
  const store = getApplicationSettingsStore()
  const settings = await store.getSettings()
  return {
    success: true,
    settings: await buildSettingsView(settings, store.consumeRecoveryNotice()),
  }
})

ipcMain.handle('application:discover', async (_event, payload) => {
  const forceRefresh = isRecord(payload) && payload.forceRefresh === true
  try {
    const settings = await getApplicationSettingsStore().getSettings()
    const result = await getWindowsApplicationDiscoveryService().discover(
      settings,
      forceRefresh,
    )
    return { success: true, ...result }
  } catch (error) {
    return toDiscoveryError(error)
  }
})

ipcMain.handle('application:add-discovered', async (_event, payload) => {
  if (!isRecord(payload) || typeof payload.discoveryId !== 'string') {
    return { success: false, error: 'INVALID_BODY', message: '설치 앱 정보가 올바르지 않습니다.' }
  }

  try {
    const store = getApplicationSettingsStore()
    const currentSettings = await store.getSettings()
    const discovered = await getWindowsApplicationDiscoveryService().resolve(
      payload.discoveryId,
      currentSettings,
    )
    if (!discovered) {
      return {
        success: false,
        error: 'APPLICATION_DISCOVERY_ITEM_NOT_FOUND',
        message: '설치 앱 목록이 변경되었습니다. 목록을 새로고침하세요.',
      }
    }

    const result = await store.registerApplication(discovered.name, discovered.target)
    return {
      success: true,
      applicationId: result.applicationId,
      created: result.created,
      settings: await buildSettingsView(result.settings),
    }
  } catch (error) {
    return toDiscoveryError(error)
  }
})

ipcMain.handle('application:assign-discovered', async (_event, payload) => {
  if (
    !isRecord(payload) ||
    typeof payload.discoveryId !== 'string' ||
    typeof payload.gesture !== 'string'
  ) {
    return { success: false, error: 'INVALID_BODY', message: '설치 앱 배정 정보가 올바르지 않습니다.' }
  }

  try {
    const store = getApplicationSettingsStore()
    const currentSettings = await store.getSettings()
    const discovered = await getWindowsApplicationDiscoveryService().resolve(
      payload.discoveryId,
      currentSettings,
    )
    if (!discovered) {
      return {
        success: false,
        error: 'APPLICATION_DISCOVERY_ITEM_NOT_FOUND',
        message: '설치 앱 목록이 변경되었습니다. 목록을 새로고침하세요.',
      }
    }

    const result = await store.registerAndAssignApplication(
      payload.gesture,
      discovered.name,
      discovered.target,
    )
    return {
      success: true,
      applicationId: result.applicationId,
      created: result.created,
      settings: await buildSettingsView(result.settings),
    }
  } catch (error) {
    return toDiscoveryError(error)
  }
})

ipcMain.handle('application:pick-and-assign', async (_event, payload) => {
  if (!isRecord(payload) || typeof payload.gesture !== 'string') {
    return { success: false, error: 'INVALID_BODY', message: '제스처 정보가 올바르지 않습니다.' }
  }

  const picked = await pickWindowsApplication(win)
  if (!picked.success || picked.canceled) return picked

  try {
    const result = await getApplicationSettingsStore().registerAndAssignApplication(
      payload.gesture,
      picked.suggestedName,
      { kind: 'windows-path', path: picked.path },
    )
    return {
      success: true,
      canceled: false,
      applicationId: result.applicationId,
      created: result.created,
      settings: await buildSettingsView(result.settings),
    }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('application:replace-discovered', async (_event, payload) => {
  if (
    !isRecord(payload) ||
    typeof payload.applicationId !== 'string' ||
    typeof payload.discoveryId !== 'string'
  ) {
    return { success: false, error: 'INVALID_BODY', message: '대상 교체 정보가 올바르지 않습니다.' }
  }

  try {
    const store = getApplicationSettingsStore()
    const currentSettings = await store.getSettings()
    const discovered = await getWindowsApplicationDiscoveryService().resolve(
      payload.discoveryId,
      currentSettings,
    )
    if (!discovered) {
      return {
        success: false,
        error: 'APPLICATION_DISCOVERY_ITEM_NOT_FOUND',
        message: '설치 앱 목록이 변경되었습니다. 목록을 새로고침하세요.',
      }
    }

    const settings = await store.replaceApplicationTarget(
      payload.applicationId,
      discovered.target,
    )
    return { success: true, settings: await buildSettingsView(settings) }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('application:pick', async () => {
  const picked = await pickWindowsApplication(win)
  if (!picked.success || picked.canceled) return picked

  const store = getApplicationSettingsStore()
  const settings = await store.addWindowsApplication(picked.path, picked.suggestedName)
  return {
    success: true,
    canceled: false,
    settings: await buildSettingsView(settings),
  }
})

ipcMain.handle('application:rename', async (_event, payload) => {
  if (
    !isRecord(payload) ||
    typeof payload.applicationId !== 'string' ||
    typeof payload.name !== 'string'
  ) {
    return { success: false, error: 'INVALID_BODY', message: '프로그램 이름 정보가 올바르지 않습니다.' }
  }

  try {
    const settings = await getApplicationSettingsStore().renameApplication(
      payload.applicationId,
      payload.name,
    )
    return { success: true, settings: await buildSettingsView(settings) }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('application:replace-target', async (_event, payload) => {
  if (!isRecord(payload) || typeof payload.applicationId !== 'string') {
    return { success: false, error: 'INVALID_BODY', message: '프로그램 ID가 올바르지 않습니다.' }
  }

  const picked = await pickWindowsApplication(win)
  if (!picked.success || picked.canceled) return picked

  const validation = await validateWindowsApplicationTarget(picked.path)
  if (!validation.success) return validation

  try {
    const settings = await getApplicationSettingsStore().replaceWithWindowsTarget(
      payload.applicationId,
      picked.path,
    )
    return {
      success: true,
      canceled: false,
      settings: await buildSettingsView(settings),
    }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('application:remove', async (_event, payload) => {
  if (!isRecord(payload) || typeof payload.applicationId !== 'string') {
    return { success: false, error: 'INVALID_BODY', message: '프로그램 ID가 올바르지 않습니다.' }
  }

  const store = getApplicationSettingsStore()
  const settings = await store.getSettings()
  const application = settings.applications.find((item) => item.id === payload.applicationId)
  if (!application) {
    return { success: false, error: 'APPLICATION_NOT_FOUND', message: '프로그램을 찾을 수 없습니다.' }
  }

  const assignmentCount = Object.values(settings.gestureAssignments)
    .filter((applicationId) => applicationId === application.id).length
  const confirmation = await dialog.showMessageBox(win ?? undefined, {
    type: 'warning',
    title: '프로그램 삭제',
    message: `${application.name}을(를) 삭제하시겠습니까?`,
    detail: assignmentCount > 0
      ? `연결된 제스처 ${assignmentCount}개의 프로그램 배정도 해제됩니다.`
      : '저장된 프로그램 설정에서 제거됩니다.',
    buttons: ['삭제', '취소'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (confirmation.response !== 0) return { success: true, canceled: true }

  try {
    const result = await store.removeApplication(application.id)
    return {
      success: true,
      canceled: false,
      clearedAssignments: result.clearedAssignments,
      settings: await buildSettingsView(result.settings),
    }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('gesture:assign', async (_event, payload) => {
  if (
    !isRecord(payload) ||
    typeof payload.gesture !== 'string' ||
    (payload.applicationId !== null && typeof payload.applicationId !== 'string')
  ) {
    return { success: false, error: 'INVALID_BODY', message: '제스처 배정 정보가 올바르지 않습니다.' }
  }

  try {
    const settings = await getApplicationSettingsStore().assignGesture(
      payload.gesture,
      payload.applicationId,
    )
    return { success: true, settings: await buildSettingsView(settings) }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('gesture:clear-all', async () => {
  const store = getApplicationSettingsStore()
  const currentSettings = await store.getSettings()
  const assignmentCount = Object.values(currentSettings.gestureAssignments)
    .filter((applicationId) => applicationId !== null).length

  if (assignmentCount === 0) {
    return {
      success: true,
      canceled: false,
      clearedAssignments: 0,
      settings: await buildSettingsView(currentSettings),
    }
  }

  const confirmation = await dialog.showMessageBox(win ?? undefined, {
    type: 'warning',
    title: '모든 제스처 배정 해제',
    message: '모든 제스처의 프로그램 배정을 해제하시겠습니까?',
    detail: `한손 제스처 ${assignmentCount}개의 배정만 비워집니다. 저장된 프로그램 목록은 유지됩니다.`,
    buttons: ['모두 비우기', '취소'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (confirmation.response !== 0) {
    return { success: true, canceled: true, clearedAssignments: 0 }
  }

  try {
    const result = await store.clearGestureAssignments()
    return {
      success: true,
      canceled: false,
      clearedAssignments: result.clearedAssignments,
      settings: await buildSettingsView(result.settings),
    }
  } catch (error) {
    return toSettingsError(error)
  }
})

ipcMain.handle('application:test', async (_event, payload) => {
  if (!isRecord(payload) || typeof payload.applicationId !== 'string') {
    return { success: false, error: 'INVALID_BODY', message: '프로그램 ID가 올바르지 않습니다.' }
  }

  return openAppRequest({
    applicationId: payload.applicationId,
    source: 'settings',
    clientRequestId: `settings-test-${payload.applicationId}-${Date.now()}`,
  })
})

ipcMain.handle('app:notify-gesture', async (_event, payload) => {
  const notifyPayload = parseNotifyPayload(payload)
  if (!notifyPayload) {
    return { success: false, error: 'INVALID_NOTIFY_PAYLOAD' }
  }

  notifyGesture(notifyPayload)
  return { success: true }
})

function toSettingsError(error: unknown) {
  const code = error instanceof Error ? error.message : 'SETTINGS_UPDATE_FAILED'
  const messages: Record<string, string> = {
    APPLICATION_NOT_FOUND: '프로그램을 찾을 수 없습니다.',
    GESTURE_NOT_FOUND: '제스처를 찾을 수 없습니다.',
    INVALID_APPLICATION_NAME: '프로그램 이름을 입력하세요.',
    APPLICATION_ALREADY_REGISTERED: '이미 등록된 프로그램입니다.',
  }
  return {
    success: false,
    error: code,
    message: messages[code] ?? '설정을 저장하지 못했습니다.',
  }
}

function toDiscoveryError(error: unknown) {
  const code = error instanceof Error ? error.message : 'APPLICATION_DISCOVERY_FAILED'
  const messages: Record<string, string> = {
    UNSUPPORTED_PLATFORM: '설치 앱 검색은 현재 Windows에서만 지원합니다.',
    APPLICATION_DISCOVERY_FAILED: 'Windows 설치 앱 목록을 불러오지 못했습니다.',
  }
  return {
    success: false,
    error: code,
    message: messages[code] ?? '설치 앱을 검색하지 못했습니다.',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
