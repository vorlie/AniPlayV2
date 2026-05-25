import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')

window.addEventListener('error', (e) => {
  if (!rootEl) return
  rootEl.innerHTML = `<pre style="white-space:pre-wrap;padding:16px;color:#fff;background:#1f1b24;font:12px/1.4 monospace;">Renderer startup error:\n${String(e.error || e.message || 'Unknown error')}</pre>`
})

window.addEventListener('unhandledrejection', (e) => {
  if (!rootEl) return
  rootEl.innerHTML = `<pre style="white-space:pre-wrap;padding:16px;color:#fff;background:#1f1b24;font:12px/1.4 monospace;">Unhandled rejection:\n${String((e as PromiseRejectionEvent).reason || 'Unknown reason')}</pre>`
})

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
