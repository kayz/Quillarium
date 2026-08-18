import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu } from 'electron'
import { registerAllHandlers } from './ipc/index.js'
import { initializeDesktopLogging, recordRendererConsole } from './logging.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appIcon = path.join(__dirname, '../../assets/brand/quillarium-app-icon.png')
const windowsTitleBar =
  process.platform === 'win32'
    ? {
        titleBarStyle: 'hidden' as const,
        titleBarOverlay: {
          color: '#22201e',
          symbolColor: '#f2eadc',
          height: 46
        }
      }
    : {}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 760,
    minHeight: 620,
    title: 'Quillarium',
    icon: appIcon,
    backgroundColor: '#f4f0e7',
    ...windowsTitleBar,
    webPreferences: {
      preload: path.join(__dirname, '../../electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.on('console-message', (details) => {
    if (details.level !== 'warning' && details.level !== 'error') return
    void recordRendererConsole(details.level, details.message, details.lineNumber).catch((error) =>
      console.error('Could not persist Quillarium renderer log.', error)
    )
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.setAppUserModelId('com.quillarium.desktop')
app.whenReady().then(async () => {
  await initializeDesktopLogging().catch((error) =>
    console.error('Could not initialize Quillarium desktop logging.', error)
  )
  if (process.platform === 'darwin') app.dock?.setIcon(appIcon)
  await createWindow()
})
Menu.setApplicationMenu(null)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

registerAllHandlers()
