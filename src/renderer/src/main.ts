import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import { ElMessageBox } from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/main.css'
import App from './App.vue'

const installAlertFocusRecovery = (): void => {
  let alertQueue = Promise.resolve()

  window.alert = ((message?: unknown): void => {
    const text = String(message ?? '')
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Use app-level modal instead of native alert to avoid Windows focus loss.
    alertQueue = alertQueue
      .catch(() => undefined)
      .then(() =>
        ElMessageBox.alert(text, '提示', {
          confirmButtonText: '确定',
          closeOnClickModal: false,
          closeOnPressEscape: true,
          closeOnHashChange: false
        })
      )
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => {
          window.focus()

          if (activeElement && activeElement.isConnected) {
            activeElement.focus()
            if (
              activeElement instanceof HTMLInputElement ||
              activeElement instanceof HTMLTextAreaElement
            ) {
              activeElement.select()
            }
          }
        }, 0)
      })
  }) as typeof window.alert
}

installAlertFocusRecovery()

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
