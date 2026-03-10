import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import type { UpdateInfo } from '../shared/update'

let mainWindow: BrowserWindow | null = null

// 仅在 Windows 生产环境启用自动更新
const isUpdateEnabled = (): boolean => {
  return process.platform === 'win32' && app.isPackaged
}

// 向渲染进程发送更新状态
const sendUpdateStatus = (info: UpdateInfo): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', info)
  }
}

// 配置 autoUpdater
const configureAutoUpdater = (): void => {
  // 禁用自动下载，等用户确认
  autoUpdater.autoDownload = false
  
  // 禁用自动安装（等用户点击"重启安装"）
  autoUpdater.autoInstallOnAppQuit = false

  // 配置日志
  autoUpdater.logger = {
    info: (msg) => console.log('[Updater]', msg),
    warn: (msg) => console.warn('[Updater]', msg),
    error: (msg) => console.error('[Updater]', msg),
    debug: (msg) => console.debug('[Updater]', msg)
  }
}

// 注册更新事件监听
const registerUpdateListeners = (): void => {
  // 开始检查更新
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] 正在检查更新...')
    sendUpdateStatus({ status: 'checking' })
  })

  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 发现新版本:', info.version)
    console.log('[Updater] 发布说明:', info.releaseNotes)
    
    // releaseNotes 可能是字符串或数组，统一转换为字符串
    let releaseNotes = ''
    if (typeof info.releaseNotes === 'string') {
      releaseNotes = info.releaseNotes
    } else if (Array.isArray(info.releaseNotes) && info.releaseNotes.length > 0) {
      releaseNotes = info.releaseNotes
        .map((note) => (typeof note === 'object' && 'note' in note ? note.note : String(note)))
        .join('\n\n')
    }
    
    sendUpdateStatus({
      status: 'available',
      version: info.version,
      releaseNotes: releaseNotes,
      releaseDate: info.releaseDate || ''
    })
  })

  // 没有新版本
  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] 已是最新版本:', info.version)
    sendUpdateStatus({
      status: 'not-available',
      version: info.version
    })
  })

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    console.log(`[Updater] 下载进度: ${percent}%`)
    sendUpdateStatus({
      status: 'downloading',
      progress: percent
    })
  })

  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] 更新下载完成:', info.version)
    sendUpdateStatus({
      status: 'downloaded',
      version: info.version
    })
  })

  // 更新出错
  autoUpdater.on('error', (error) => {
    console.error('[Updater] 更新出错:', error)
    sendUpdateStatus({
      status: 'error',
      error: error.message
    })
  })
}

/**
 * 初始化更新器
 * @param window 主窗口实例
 */
export const initUpdater = (window: BrowserWindow): void => {
  mainWindow = window

  if (!isUpdateEnabled()) {
    console.log('[Updater] 自动更新未启用（仅支持 Windows 打包版本）')
    return
  }

  console.log('[Updater] 初始化自动更新模块')
  configureAutoUpdater()
  registerUpdateListeners()
}

/**
 * 检查更新（手动或自动触发）
 */
export const checkForUpdates = async (): Promise<void> => {
  if (!isUpdateEnabled()) {
    console.log('[Updater] 当前平台不支持自动更新')
    sendUpdateStatus({
      status: 'error',
      error: '当前平台不支持自动更新（仅支持 Windows）'
    })
    return
  }

  try {
    console.log('[Updater] 开始检查更新...')
    const result = await autoUpdater.checkForUpdates()
    console.log('[Updater] 检查结果:', result)
  } catch (error) {
    console.error('[Updater] 检查更新失败:', error)
    sendUpdateStatus({
      status: 'error',
      error: error instanceof Error ? error.message : '检查更新失败'
    })
  }
}

/**
 * 开始下载更新
 */
export const downloadUpdate = async (): Promise<void> => {
  if (!isUpdateEnabled()) {
    console.log('[Updater] 当前平台不支持自动更新')
    sendUpdateStatus({
      status: 'error',
      error: '当前平台不支持自动更新（仅支持 Windows 打包版本）'
    })
    return
  }

  try {
    console.log('[Updater] 开始下载更新...')
    await autoUpdater.downloadUpdate()
  } catch (error) {
    console.error('[Updater] 下载更新失败:', error)
    sendUpdateStatus({
      status: 'error',
      error: error instanceof Error ? error.message : '下载更新失败'
    })
  }
}

/**
 * 退出并安装更新
 */
export const quitAndInstall = (): void => {
  if (!isUpdateEnabled()) {
    console.log('[Updater] 当前平台不支持自动更新')
    sendUpdateStatus({
      status: 'error',
      error: '当前平台不支持自动更新（仅支持 Windows 打包版本）'
    })
    return
  }

  console.log('[Updater] 准备退出并安装更新...')

  // 使用 setImmediate 确保 IPC 响应先发送到渲染进程
  setImmediate(() => {
    console.log('[Updater] 正在执行安装...')
    
    // autoUpdater.quitAndInstall() 会自动：
    // 1. 关闭所有窗口
    // 2. 退出应用
    // 3. 启动安装程序
    // 4. 安装完成后重启应用（如果 isForceRunAfter=true）
    
    // 参数说明：
    // isSilent=false: 显示安装界面（让用户看到安装过程）
    // isForceRunAfter=true: 安装完成后自动启动应用
    autoUpdater.quitAndInstall(false, true)
  })
}
