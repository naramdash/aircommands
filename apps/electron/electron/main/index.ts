import { app, BrowserWindow, shell, ipcMain, Menu, Notification, Tray, nativeImage } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { openAppRequest } from './services/open_app'

const require = createRequire(import.meta.url)
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

// Disable GPU Acceleration for Windows 7
if (process.platform === 'win32' && os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let gestureNotificationsEnabled = true
let trayBackgroundNoticeShown = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function getTrayIconPath() {
  return path.join(process.env.VITE_PUBLIC, 'app-icon.png')
}

function getNotificationIconPath() {
  return path.join(process.env.VITE_PUBLIC, 'app-icon.png')
}

function getWindowIconPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.VITE_PUBLIC, 'app-icon.ico')
  }

  return path.join(process.env.VITE_PUBLIC, 'app-icon.png')
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

function notifyGesture(payload: {
  status: 'success' | 'failure'
  gestureLabel: string
  appLabel: string
  message?: string
}) {
  if (!gestureNotificationsEnabled) return
  if (!Notification.isSupported()) return

  const title = payload.status === 'success'
    ? `제스처 성공: ${payload.gestureLabel}`
    : `제스처 실패: ${payload.gestureLabel}`

  const body = payload.status === 'success'
    ? `${payload.appLabel} 실행 요청을 보냈습니다.`
    : payload.message
      ? `${payload.appLabel} 실행 실패 - ${payload.message}`
      : `${payload.appLabel} 실행에 실패했습니다.`

  const notification = new Notification({
    title,
    body,
    icon: getNotificationIconPath(),
  })
  notification.show()
}

function notifyTrayBackgroundRecognition() {
  if (trayBackgroundNoticeShown) return
  if (!Notification.isSupported()) return

  trayBackgroundNoticeShown = true

  const notification = new Notification({
    title: 'Aircommands가 트레이에서 실행 중입니다',
    body: '창을 닫아도 제스처 인식은 계속 동작합니다. 다시 열려면 트레이 아이콘을 클릭하세요.',
    icon: getNotificationIconPath(),
  })
  notification.show()
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
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
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
    if (isQuitting) return
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

app.whenReady().then(() => {
  try {
    createTray()
  } catch (error) {
    console.error('Failed to create tray icon:', error)
  }
  createWindow()
}).catch((error) => {
  console.error('App initialization failed:', error)
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin' && isQuitting) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
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

ipcMain.handle('app:notify-gesture', async (_event, payload) => {
  const notifyPayload = parseNotifyPayload(payload)
  if (!notifyPayload) {
    return { success: false, error: 'INVALID_NOTIFY_PAYLOAD' }
  }

  notifyGesture(notifyPayload)
  return { success: true }
})
