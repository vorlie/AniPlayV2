/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bug, Download, FolderOpen, Gamepad2, GitPullRequest, Globe, MessageCircle, Palette, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { argbFromRgb, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities'
import { ANILIST_SEARCH_KEY, getAniListFirstSearch, getTranslationType, TRANSLATION_TYPE_KEY, type TranslationType } from '../lib/api'
import { getNotificationSoundMode, getNotificationSoundPreset, playNotificationSound, setNotificationSoundMode, setNotificationSoundPreset, type NotificationSoundMode, type NotificationSoundPreset } from '../lib/notification-sounds'
import { setAppLanguage, supportedLanguages, type AppLanguage } from '../i18n'
import type { UpdateState } from '../updater-types'

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

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'
type SettingsSection = 'theme' | 'player' | 'search' | 'downloads' | 'updates' | 'project' | 'advanced' | 'scraper'

interface CiphermapInfo {
  generatedAt: string
  entries: number
  source: string
  tag?: string | null
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSection>('theme')
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [useNativeControls, setUseNativeControls] = useState(true)
  const [translationType, setTranslationType] = useState<TranslationType>(getTranslationType)
  const [aniListFirstSearch, setAniListFirstSearch] = useState(getAniListFirstSearch)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [ciphermapInfo, setCiphermapInfo] = useState<CiphermapInfo | null>(null)
  const [downloadDirectory, setDownloadDirectory] = useState('Loading…')
  const [discordPresenceEnabled, setDiscordPresenceEnabled] = useState(false)
  const [discordPresenceConnected, setDiscordPresenceConnected] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [notificationSoundMode, setNotificationSoundModeState] = useState<NotificationSoundMode>(getNotificationSoundMode)
  const [notificationSoundPreset, setNotificationSoundPresetState] = useState<NotificationSoundPreset>(getNotificationSoundPreset)
  const [safeGraphicsMode, setSafeGraphicsMode] = useState(false)
  const [safeGraphicsRestartRequired, setSafeGraphicsRestartRequired] = useState(false)
  const [safeGraphicsLaunchOverride, setSafeGraphicsLaunchOverride] = useState(false)
  const [language, setLanguage] = useState<AppLanguage>(i18n.language === 'pl' ? 'pl' : 'en')

  useEffect(() => {
    const saved = localStorage.getItem('theme.primary')
    if (!saved) return
    setPrimary(saved)
    applyThemeFromPrimary(saved)
  }, [])

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.updater.getState().then(setUpdateState)
    return window.aniPlay.updater.onChanged(setUpdateState)
  }, [])

  useEffect(() => {
    void window.aniPlay?.discordPresence.getSettings().then((settings) => {
      setDiscordPresenceEnabled(settings.enabled)
      setDiscordPresenceConnected(settings.connected)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!discordPresenceEnabled) return
    const timer = window.setInterval(() => {
      void window.aniPlay?.discordPresence.getSettings().then((settings) => setDiscordPresenceConnected(settings.connected)).catch(() => {})
    }, 5000)
    return () => window.clearInterval(timer)
  }, [discordPresenceEnabled])

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.downloads.getState().then((state) => setDownloadDirectory(state.settings.directory))
    return window.aniPlay.downloads.onChanged((state) => setDownloadDirectory(state.settings.directory))
  }, [])

  useEffect(() => {
    void window.aniPlay?.graphics.getSettings().then((settings) => {
      setSafeGraphicsMode(settings.safeGraphicsMode)
      setSafeGraphicsRestartRequired(settings.restartRequired)
      setSafeGraphicsLaunchOverride(settings.launchOverride)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    // Load current ciphermap metadata from main process
    window.aniPlay?.getCiphermapInfo().then((res) => {
      if (res?.success && res.data) setCiphermapInfo(res.data)
    }).catch(() => {})
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

  const selectTranslationType = (value: TranslationType) => {
    setTranslationType(value)
    localStorage.setItem(TRANSLATION_TYPE_KEY, value)
  }

  const toggleAniListFirstSearch = () => {
    setAniListFirstSearch((prev) => {
      const next = !prev
      localStorage.setItem(ANILIST_SEARCH_KEY, String(next))
      return next
    })
  }

  const toggleDiscordPresence = async () => {
    const settings = await window.aniPlay?.discordPresence.setEnabled(!discordPresenceEnabled)
    if (!settings) return
    setDiscordPresenceEnabled(settings.enabled)
    setDiscordPresenceConnected(settings.connected)
  }

  const syncCiphermap = async () => {
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      const res = await window.aniPlay?.syncCiphermap()
      if (res?.success) {
        setSyncStatus('success')
        setCiphermapInfo({ generatedAt: res.generatedAt, entries: res.entries, source: res.source, tag: res.tag ?? null })
      } else {
        setSyncStatus('error')
        setSyncError(res?.error ?? t('settings.scraper.unknownError'))
      }
    } catch (e: unknown) {
      setSyncStatus('error')
      setSyncError(e instanceof Error ? e.message : t('settings.scraper.unknownError'))
    }
  }

  const openProjectPage = (page: 'repository' | 'issues' | 'pulls' | 'discord') => {
    void window.aniPlay?.openProjectPage(page)
  }

  const selectNotificationSoundMode = (mode: NotificationSoundMode) => {
    setNotificationSoundMode(mode)
    setNotificationSoundModeState(mode)
  }

  const selectNotificationSoundPreset = (preset: NotificationSoundPreset) => {
    setNotificationSoundPreset(preset)
    setNotificationSoundPresetState(preset)
  }

  const selectLanguage = (value: AppLanguage) => {
    setLanguage(value)
    setAppLanguage(value)
  }

  const toggleSafeGraphicsMode = async () => {
    const settings = await window.aniPlay?.graphics.setSafeMode(!safeGraphicsMode)
    if (!settings) return
    setSafeGraphicsMode(settings.safeGraphicsMode)
    setSafeGraphicsRestartRequired(settings.restartRequired)
    setSafeGraphicsLaunchOverride(settings.launchOverride)
  }

  const sections: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
    { id: 'theme', label: t('settings.theme.title'), icon: <Palette size={16} /> },
    { id: 'player', label: t('settings.player.title'), icon: <Gamepad2 size={16} /> },
    { id: 'search', label: t('settings.search.title'), icon: <Search size={16} /> },
    { id: 'downloads', label: t('settings.downloads.title'), icon: <Download size={16} /> },
    { id: 'updates', label: t('settings.updates.title'), icon: <RefreshCw size={16} /> },
    { id: 'project', label: t('settings.project.title'), icon: <Globe size={16} /> },
    { id: 'advanced', label: t('settings.advanced.title'), icon: <SlidersHorizontal size={16} /> },
    { id: 'scraper', label: t('settings.scraper.title'), icon: <ShieldCheck size={16} /> },
  ]

  return (
    <div className="m3-card p-6 md:p-7 flex-1">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="lg:sticky lg:top-5 lg:w-56 shrink-0">
          <h2 className="font-sans font-bold text-2xl mb-3">{t('nav.settings')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                aria-pressed={activeSection === section.id}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors ${
                  activeSection === section.id
                    ? 'border-m3-primary bg-m3-primary/15 text-m3-primary'
                    : 'border-m3-outline/20 bg-m3-surface-container/35 text-m3-on-surface-variant hover:bg-m3-on-surface/10 hover:text-m3-on-surface'
                }`}
              >
                {section.icon}
                <span className="truncate">{section.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {activeSection === 'theme' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4 flex items-center gap-2">
                <Palette size={20} />
                {t('settings.theme.title')}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start">
                <div className="space-y-3">
                  <p className="text-sm text-m3-on-surface-variant">{t('settings.theme.description')}</p>
                  <div className="flex flex-wrap items-center gap-3">
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
                      {t('settings.theme.reset')}
                    </button>
                  </div>
                </div>
                <div className="w-full lg:w-52 rounded-2xl border border-m3-outline/20 p-3 bg-m3-surface-container/40">
                  <p className="text-xs text-m3-on-surface-variant mb-2">{t('settings.theme.preview')}</p>
                  <button className="w-full rounded-xl px-3 py-2 font-bold" style={{ backgroundColor: 'var(--color-m3-primary)', color: 'var(--color-m3-on-primary)' }}>
                    {t('settings.theme.primaryButton')}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'player' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4">{t('settings.player.title')}</h3>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{t('settings.player.nativeControls')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.player.nativeDescription')}</p>
                  </div>
                  <button
                    onClick={toggleNativeControls}
                    className={`w-14 h-8 shrink-0 rounded-full p-1 transition-colors ${useNativeControls ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                    aria-pressed={useNativeControls}
                  >
                    <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${useNativeControls ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{t('settings.player.audioVersion')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.player.audioDescription')}</p>
                  </div>
                  <div className="inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label={t('settings.player.audioVersion')}>
                    {(['sub', 'dub'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => selectTranslationType(value)}
                        aria-pressed={translationType === value}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${translationType === value ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}
                      >
                        {value === 'sub' ? t('settings.player.subbed') : t('settings.player.dubbed')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Gamepad2 size={19} className="mt-0.5 shrink-0 text-m3-primary" />
                    <div>
                      <p className="font-bold text-sm">{t('settings.player.discord')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.player.discordDescription')}</p>
                      {discordPresenceEnabled && <p className={`mt-1 text-xs ${discordPresenceConnected ? 'text-green-400' : 'text-m3-on-surface-variant'}`}>{discordPresenceConnected ? t('settings.player.connected') : t('settings.player.waiting')}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleDiscordPresence()}
                    className={`w-14 h-8 shrink-0 rounded-full p-1 transition-colors ${discordPresenceEnabled ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                    aria-pressed={discordPresenceEnabled}
                    aria-label={t('settings.player.enableDiscord')}
                  >
                    <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${discordPresenceEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'search' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4">{t('settings.search.title')}</h3>
              <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-sm">{t('settings.search.aniListFirst')}</p>
                  <p className="text-xs text-m3-on-surface-variant">{t('settings.search.aniListFirstDescription')}</p>
                </div>
                <button
                  type="button"
                  onClick={toggleAniListFirstSearch}
                  className={`w-14 h-8 shrink-0 rounded-full p-1 transition-colors ${aniListFirstSearch ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                  aria-pressed={aniListFirstSearch}
                  aria-label={t('settings.search.enableAniListFirst')}
                >
                  <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${aniListFirstSearch ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </section>
          )}

          {activeSection === 'downloads' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4">{t('settings.downloads.title')}</h3>
              <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm">{t('settings.downloads.folder')}</p>
                  <p className="mt-1 truncate text-xs text-m3-on-surface-variant" title={downloadDirectory}>{downloadDirectory}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void window.aniPlay?.downloads.chooseDirectory().then((state) => setDownloadDirectory(state.settings.directory))}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-m3-outline/30 hover:bg-m3-on-surface/10"
                >
                  <FolderOpen size={16} /> {t('settings.downloads.choose')}
                </button>
              </div>
            </section>
          )}

          {activeSection === 'updates' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4">{t('settings.updates.title')}</h3>
              <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm">AniPlay {updateState?.currentVersion ?? ''}</p>
                  <p className="mt-1 text-xs text-m3-on-surface-variant">
                    {updateState?.phase === 'available' && t('settings.updates.available', { version: updateState.availableVersion })}
                    {updateState?.phase === 'downloading' && t('settings.updates.downloading', { version: updateState.availableVersion ?? '', progress: Math.round(updateState.progress ?? 0) })}
                    {updateState?.phase === 'downloaded' && t('settings.updates.downloaded', { version: updateState.availableVersion })}
                    {updateState?.phase === 'checking' && t('settings.updates.checking')}
                    {(updateState?.phase === 'idle' || updateState?.phase === 'error' || updateState?.phase === 'unavailable') && (updateState.message ?? t('settings.updates.fallback'))}
                    {!updateState && t('settings.updates.loading')}
                  </p>
                  {updateState?.phase === 'downloading' && (
                    <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-m3-on-surface/10">
                      <div className="h-full bg-m3-primary transition-[width]" style={{ width: `${updateState.progress ?? 0}%` }} />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!updateState || updateState.phase === 'unavailable' || updateState.phase === 'checking' || updateState.phase === 'downloading'}
                  onClick={() => {
                    if (!window.aniPlay || !updateState) return
                    if (updateState.phase === 'available') void window.aniPlay.updater.download().then(setUpdateState)
                    else if (updateState.phase === 'downloaded') void window.aniPlay.updater.install()
                    else void window.aniPlay.updater.check().then(setUpdateState)
                  }}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-m3-outline/30 hover:bg-m3-on-surface/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} className={updateState?.phase === 'checking' || updateState?.phase === 'downloading' ? 'animate-spin' : ''} />
                  {updateState?.phase === 'available' ? t('settings.updates.download') : updateState?.phase === 'downloaded' ? t('settings.updates.install') : t('settings.updates.check')}
                </button>
              </div>
            </section>
          )}

          {activeSection === 'project' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4">{t('settings.project.title')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <button onClick={() => openProjectPage('repository')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left">
                  <div className="flex items-center gap-2 mb-1"><Globe size={16} /><span className="font-bold text-sm">{t('settings.project.repo')}</span></div>
                  <p className="text-xs text-m3-on-surface-variant">{t('settings.project.repoDescription')}</p>
                </button>
                <button onClick={() => openProjectPage('issues')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left">
                  <div className="flex items-center gap-2 mb-1"><Bug size={16} /><span className="font-bold text-sm">{t('settings.project.issues')}</span></div>
                  <p className="text-xs text-m3-on-surface-variant">{t('settings.project.issuesDescription')}</p>
                </button>
                <button onClick={() => openProjectPage('pulls')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left">
                  <div className="flex items-center gap-2 mb-1"><GitPullRequest size={16} /><span className="font-bold text-sm">{t('settings.project.contribute')}</span></div>
                  <p className="text-xs text-m3-on-surface-variant">{t('settings.project.contributeDescription')}</p>
                </button>
                <button onClick={() => openProjectPage('discord')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 hover:bg-m3-on-surface/10 transition-all px-4 py-3 text-left">
                  <div className="flex items-center gap-2 mb-1"><MessageCircle size={16} /><span className="font-bold text-sm">{t('settings.project.discord')}</span></div>
                  <p className="text-xs text-m3-on-surface-variant">{t('settings.project.discordDescription')}</p>
                </button>
              </div>
            </section>
          )}

          {activeSection === 'advanced' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4">{t('settings.advanced.title')}</h3>
              <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-bold text-sm">{t('settings.advanced.language')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.languageDescription')}</p>
                  </div>
                  <select value={language} onChange={(event) => selectLanguage(event.target.value as AppLanguage)} className="rounded-xl border border-m3-outline/30 bg-m3-surface px-3 py-2 text-sm font-bold text-m3-on-surface">
                    {supportedLanguages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-bold text-sm">{t('settings.advanced.safeGraphics')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.safeGraphicsDescription')}</p>
                    {safeGraphicsRestartRequired && <p className="mt-1 text-xs text-amber-200">{t('settings.advanced.safeGraphicsRestart')}</p>}
                    {safeGraphicsLaunchOverride && <p className="mt-1 text-xs text-m3-primary">{t('settings.advanced.safeGraphicsOverride')}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleSafeGraphicsMode()}
                    className={`w-14 h-8 shrink-0 rounded-full p-1 transition-colors ${safeGraphicsMode ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                    aria-pressed={safeGraphicsMode}
                    aria-label={t('settings.advanced.safeGraphics')}
                  >
                    <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${safeGraphicsMode ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-bold text-sm">{t('settings.advanced.notificationSounds')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.notificationSoundsDescription')}</p>
                  </div>
                  <div className="inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label={t('settings.advanced.soundMode')}>
                    {([
                      ['off', t('settings.advanced.modes.off')],
                      ['important', t('settings.advanced.modes.important')],
                      ['all', t('settings.advanced.modes.all')],
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => selectNotificationSoundMode(value)} aria-pressed={notificationSoundMode === value} className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${notificationSoundMode === value ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-bold text-sm">{t('settings.advanced.soundPreset')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.soundPresetDescription')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={notificationSoundPreset} disabled={notificationSoundMode === 'off'} onChange={(event) => selectNotificationSoundPreset(event.target.value as NotificationSoundPreset)} className="rounded-xl border border-m3-outline/30 bg-m3-surface px-3 py-2 text-sm font-bold text-m3-on-surface disabled:opacity-50">
                      <option value="soft">{t('settings.advanced.presets.soft')}</option>
                      <option value="crystal">{t('settings.advanced.presets.crystal')}</option>
                      <option value="arcade">{t('settings.advanced.presets.arcade')}</option>
                    </select>
                    <button type="button" disabled={notificationSoundMode === 'off'} onClick={() => playNotificationSound(notificationSoundPreset)} className="rounded-xl border border-m3-outline/30 px-4 py-2 text-sm font-bold hover:bg-m3-on-surface/10 disabled:opacity-50 disabled:cursor-not-allowed">
                      {t('settings.advanced.testSound')}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'scraper' && (
            <section>
              <h3 className="font-sans font-bold text-xl mb-4 flex items-center gap-2">
                <ShieldCheck size={18} />
                {t('settings.scraper.title')}
              </h3>
              <div className="rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{t('settings.scraper.cipherMap')}</p>
                    <p className="text-xs text-m3-on-surface-variant mt-0.5">{t('settings.scraper.cipherDescription')}</p>
                    {ciphermapInfo ? (
                      <p className="text-xs text-m3-on-surface-variant/70 mt-1">
                        {t('settings.scraper.lastSynced', { date: new Date(ciphermapInfo.generatedAt).toLocaleString() })}{' '}
                        {ciphermapInfo.tag && <span className="ml-1 px-1.5 py-0.5 rounded bg-m3-primary/20 text-m3-primary font-mono">{ciphermapInfo.tag}</span>}
                        {' '}&middot; {t('settings.scraper.entries', { count: ciphermapInfo.entries })}
                      </p>
                    ) : (
                      <p className="text-xs text-m3-on-surface-variant/50 mt-1">{t('settings.scraper.fallback')}</p>
                    )}
                  </div>
                  <button onClick={syncCiphermap} disabled={syncStatus === 'syncing'} className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-m3-outline/30 hover:bg-m3-on-surface/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                    {syncStatus === 'syncing' ? t('settings.scraper.updating') : t('settings.scraper.update')}
                  </button>
                </div>
                {syncStatus === 'success' && <p className="text-xs text-green-400">✓ {t('settings.scraper.success')}</p>}
                {syncStatus === 'error' && <p className="text-xs text-red-400">✗ {t('settings.scraper.error', { error: syncError })}</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
