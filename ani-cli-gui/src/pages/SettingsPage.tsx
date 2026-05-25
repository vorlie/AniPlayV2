import { useEffect, useState } from 'react'
import { Bug, Github, GitPullRequest, Palette, RotateCcw } from 'lucide-react'
import { argbFromRgb, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities'

const DEFAULT_PRIMARY = '#D0BCFF'

function clamp(v: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, v))
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  const n = parseInt(normalized, 16)
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

function applyThemeFromPrimary(primary: string) {
  const root = document.documentElement
  const { r, g, b } = hexToRgb(primary)
  const sourceColor = argbFromRgb(r, g, b)
  const theme = themeFromSourceColor(sourceColor, [
    { name: 'custom-primary', value: sourceColor, blend: true }
  ])
  const dark = theme.schemes.dark

  const p = hexFromArgb(dark.primary)
  root.style.setProperty('--color-m3-surface', hexFromArgb(dark.surface))
  root.style.setProperty('--color-m3-surface-container', hexFromArgb(dark.secondaryContainer))
  root.style.setProperty('--color-m3-surface-variant', hexFromArgb(dark.surfaceVariant))
  root.style.setProperty('--color-m3-primary', p)
  root.style.setProperty('--color-m3-on-primary', hexFromArgb(dark.onPrimary))
  root.style.setProperty('--color-m3-primary-container', hexFromArgb(dark.primaryContainer))
  root.style.setProperty('--color-m3-on-primary-container', hexFromArgb(dark.onPrimaryContainer))
  root.style.setProperty('--color-m3-secondary', hexFromArgb(dark.secondary))
  root.style.setProperty('--color-m3-on-secondary', hexFromArgb(dark.onSecondary))
  root.style.setProperty('--color-m3-outline', hexFromArgb(dark.outline))
  root.style.setProperty('--color-m3-on-surface', hexFromArgb(dark.onSurface))
  root.style.setProperty('--color-m3-on-surface-variant', hexFromArgb(dark.onSurfaceVariant))
  root.style.setProperty('--custom-display-name-styles-main-color', p)
  root.style.setProperty('--custom-display-name-styles-light-1-color', rgbToHex(clamp(r + 28), clamp(g + 28), clamp(b + 28)))
  root.style.setProperty('--custom-display-name-styles-dark-1-color', rgbToHex(clamp(r - 48), clamp(g - 48), clamp(b - 48)))
}

export function SettingsPage() {
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [useNativeControls, setUseNativeControls] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme.primary')
    if (!saved) return
    setPrimary(saved)
    applyThemeFromPrimary(saved)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('player.useNativeControls')
    if (saved == null) return
    setUseNativeControls(saved !== 'false')
  }, [])

  const handleColor = (val: string) => {
    setPrimary(val)
    applyThemeFromPrimary(val)
    localStorage.setItem('theme.primary', val)
  }

  const reset = () => {
    setPrimary(DEFAULT_PRIMARY)
    applyThemeFromPrimary(DEFAULT_PRIMARY)
    localStorage.removeItem('theme.primary')
  }

  const toggleNativeControls = () => {
    setUseNativeControls((prev) => {
      const next = !prev
      localStorage.setItem('player.useNativeControls', String(next))
      return next
    })
  }

  const openExternal = (url: string) => {
    // @ts-ignore
    if (window?.ipcRenderer?.openExternal) {
      // @ts-ignore
      window.ipcRenderer.openExternal(url)
      return
    }
    window.open(url, '_blank')
  }

  return (
    <div className="m3-card p-6 md:p-7 flex-1">
      <h2 className="font-tempo text-2xl mb-5 flex items-center gap-2">
        <Palette size={22} />
        Theme
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start">
        <div className="space-y-3">
          <p className="text-sm text-m3-on-surface-variant">Choose your custom accent color.</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primary}
              onChange={(e) => handleColor(e.target.value)}
              className="h-10 w-16 rounded-lg border border-m3-outline/30 bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={primary}
              onChange={(e) => {
                const v = e.target.value.trim()
                setPrimary(v)
                if (/^#[0-9a-fA-F]{6}$/.test(v)) handleColor(v)
              }}
              className="bg-m3-on-surface/5 border border-m3-outline/20 rounded-xl px-3 py-2 text-sm w-36"
            />
            <button onClick={reset} className="px-3 py-2 rounded-xl text-sm border border-m3-outline/30 hover:bg-m3-on-surface/10 flex items-center gap-2">
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        </div>
        <div className="w-full lg:w-52 rounded-2xl border border-m3-outline/20 p-3 bg-m3-surface-container/40">
          <p className="text-xs text-m3-on-surface-variant mb-2">Preview</p>
          <button className="w-full rounded-xl px-3 py-2 font-bold" style={{ backgroundColor: 'var(--color-m3-primary)', color: 'var(--color-m3-on-primary)' }}>
            Primary Button
          </button>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-m3-outline/20">
        <h3 className="font-tempo text-xl mb-3">Player</h3>
        <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Use native video controls</p>
            <p className="text-xs text-m3-on-surface-variant">Recommended for maximum codec and browser compatibility.</p>
          </div>
          <button
            onClick={toggleNativeControls}
            className={`w-14 h-8 rounded-full p-1 transition-colors ${useNativeControls ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
            aria-pressed={useNativeControls}
          >
            <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${useNativeControls ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-m3-outline/20">
        <h3 className="font-tempo text-xl mb-3">Project</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => openExternal('https://github.com/vorlie/AniPlayV2')}
            className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <Github size={16} />
              <span className="font-bold text-sm">GitHub Repo</span>
            </div>
            <p className="text-xs text-m3-on-surface-variant">View source code and releases.</p>
          </button>
          <button
            onClick={() => openExternal('https://github.com/vorlie/AniPlayV2/issues')}
            className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <Bug size={16} />
              <span className="font-bold text-sm">Report Issue</span>
            </div>
            <p className="text-xs text-m3-on-surface-variant">Open a bug report or request.</p>
          </button>
          <button
            onClick={() => openExternal('https://github.com/vorlie/AniPlayV2/pulls')}
            className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest size={16} />
              <span className="font-bold text-sm">Contribute</span>
            </div>
            <p className="text-xs text-m3-on-surface-variant">Create or review pull requests.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
