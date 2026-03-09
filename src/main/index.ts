import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import iconPng from '../../resources/icon.png?asset'
import iconIcns from '../../resources/icon.icns?asset'
import { registerApiHandlers } from './api'
import { initUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from './updater'

const icon = process.platform === 'darwin' ? iconIcns : iconPng

type WindowState = {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

const windowStateFile = 'window-state.json'

const getWindowStatePath = (): string => {
  return join(app.getPath('userData'), windowStateFile)
}

const loadWindowState = async (): Promise<WindowState> => {
  const fallback = { width: 1100, height: 720 }
  try {
    const raw = await fs.readFile(getWindowStatePath(), 'utf-8')
    const parsed = JSON.parse(raw) as WindowState
    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    const width = Number.isFinite(parsed.width) ? Math.max(800, parsed.width) : fallback.width
    const height = Number.isFinite(parsed.height) ? Math.max(600, parsed.height) : fallback.height

    return {
      width,
      height,
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      isMaximized: Boolean(parsed.isMaximized)
    }
  } catch {
    return fallback
  }
}

const saveWindowState = async (window: BrowserWindow): Promise<void> => {
  if (window.isDestroyed()) {
    return
  }
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: window.isMaximized()
  }
  await fs.writeFile(getWindowStatePath(), JSON.stringify(state), 'utf-8')
}

async function createWindow(): Promise<void> {
  const state = await loadWindowState()
  
  // 设置窗口初始背景色（与 CSS --color-background-primary 保持一致）
  // 这样在页面加载前就有正确的背景色
  const getInitialBackgroundColor = (): string => {
    // 默认根据系统主题，但主要由 CSS 控制
    return nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff'
  }
  
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'svn 批量代码合并工具',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: getInitialBackgroundColor(),
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (state.isMaximized) {
      mainWindow.maximize()
    }
  })

  let saveTimer: NodeJS.Timeout | undefined
  const scheduleSave = (): void => {
    if (mainWindow.isDestroyed()) {
      return
    }
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      if (mainWindow.isDestroyed()) {
        return
      }
      saveWindowState(mainWindow).catch((error) => {
        console.error('Failed to save window state:', error)
      })
    }, 200)
  }

  mainWindow.on('resize', scheduleSave)
  mainWindow.on('move', scheduleSave)
  mainWindow.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveWindowState(mainWindow).catch((error) => {
      console.error('Failed to save window state:', error)
    })
  })
  mainWindow.on('closed', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // 默认使用系统主题（但可以被渲染进程覆盖）
  nativeTheme.themeSource = 'system'
  
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)

    // Keep DevTools toggle available in packaged app for troubleshooting.
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') {
        return
      }

      const isF12 = input.key === 'F12'
      const isCtrlOrCmdShiftI = (input.control || input.meta) && input.shift && input.key.toUpperCase() === 'I'
      if (!isF12 && !isCtrlOrCmdShiftI) {
        return
      }

      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools()
      } else {
        window.webContents.openDevTools({ mode: 'detach' })
      }

      event.preventDefault()
    })
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 注册更新相关的 IPC 处理器
  ipcMain.handle('update:check', async () => {
    await checkForUpdates()
  })

  ipcMain.handle('update:download', async () => {
    await downloadUpdate()
  })

  ipcMain.handle('update:install', () => {
    quitAndInstall()
  })

  // 监听渲染进程的主题变化，设置原生窗口主题
  ipcMain.on('theme:set', (_event, isDark: boolean) => {
    // 设置 nativeTheme.themeSource 会影响所有窗口的原生外观（包括标题栏）
    nativeTheme.themeSource = isDark ? 'dark' : 'light'
    
    // 同时更新窗口背景色以保持一致
    const backgroundColor = isDark ? '#1c1c1e' : '#ffffff'
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.setBackgroundColor(backgroundColor)
      }
    })
  })

  registerApiHandlers()

  await createWindow()

  // 初始化自动更新（仅 Windows 打包版本）
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (mainWindow) {
    initUpdater(mainWindow)
    // 延迟 3 秒后自动检查更新（避免启动时阻塞）
    setTimeout(() => {
      checkForUpdates().catch((error) => {
        console.error('[Main] 自动检查更新失败:', error)
      })
    }, 3000)
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
