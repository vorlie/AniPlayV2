/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Book, Bug, Check, Download, FolderOpen, Gamepad2, GitPullRequest, Globe, Magnet, MessageCircle, Palette, RefreshCw, RotateCcw, Search, Settings, Shield, SlidersHorizontal, Video } from 'lucide-react'
import { ADULT_CONTENT_OPT_IN_KEY, getAdultContentOptIn, ANILIST_SEARCH_KEY, getAniListFirstSearch, getTranslationType, TRANSLATION_TYPE_KEY, type TranslationType } from '../lib/api'
import { getNotificationSoundMode, getNotificationSoundPreset, playNotificationSound, setNotificationSoundMode, setNotificationSoundPreset, type NotificationSoundMode, type NotificationSoundPreset } from '../lib/notification-sounds'
import { setAppLanguage, supportedLanguages, type AppLanguage } from '../i18n'
import type { UpdateState } from '../updater-types'
import type { AdBlockMode, AdBlockState } from '../adblock-types'
import { getTheme, getThemeAccent, isValidAccent, resetThemeAccent, saveTheme, saveThemeAccent, type ThemeId } from '../lib/theme'
import type { TorrentSettings } from '../torrent-types'

type SettingsSection = 'theme' | 'player' | 'search' | 'downloads' | 'updates' | 'project' | 'adblock' | 'advanced' | 'scraper'

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSection>('theme')
  const [themeId, setThemeId] = useState<ThemeId>(getTheme)
  const [primary, setPrimary] = useState(() => getThemeAccent(getTheme()))
  const [accentInput, setAccentInput] = useState(() => getThemeAccent(getTheme()))
  const [useNativeControls, setUseNativeControls] = useState(true)
  const [translationType, setTranslationType] = useState<TranslationType>(getTranslationType)
  const [aniListFirstSearch, setAniListFirstSearch] = useState(getAniListFirstSearch)
  const [adultContentOptIn, setAdultContentOptIn] = useState(getAdultContentOptIn)
  const [downloadDirectory, setDownloadDirectory] = useState('Loading…')
  const [torrentSettings, setTorrentSettings] = useState<TorrentSettings | null>(null)
  const [discordPresenceEnabled, setDiscordPresenceEnabled] = useState(false)
  const [discordPresenceConnected, setDiscordPresenceConnected] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [notificationSoundMode, setNotificationSoundModeState] = useState<NotificationSoundMode>(getNotificationSoundMode)
  const [notificationSoundPreset, setNotificationSoundPresetState] = useState<NotificationSoundPreset>(getNotificationSoundPreset)
  const [safeGraphicsMode, setSafeGraphicsMode] = useState(false)
  const [safeGraphicsRestartRequired, setSafeGraphicsRestartRequired] = useState(false)
  const [safeGraphicsLaunchOverride, setSafeGraphicsLaunchOverride] = useState(false)
  const [language, setLanguage] = useState<AppLanguage>(i18n.language === 'pl' ? 'pl' : 'en')
  const [adBlockState, setAdBlockState] = useState<AdBlockState | null>(null)

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.updater.getState().then(setUpdateState)
    return window.aniPlay.updater.onChanged(setUpdateState)
  }, [])

  useEffect(() => {
    void window.aniPlay?.torrent.getSettings().then(setTorrentSettings).catch(() => {})
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
    void window.aniPlay?.adBlock.getState().then(setAdBlockState).catch(() => {})
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('player.useNativeControls')
    if (saved == null) return
    setUseNativeControls(saved !== 'false')
  }, [])

  const handleColor = (val: string) => {
    if (!saveThemeAccent(themeId, val)) return
    const normalized = val.toUpperCase()
    setPrimary(normalized)
    setAccentInput(normalized)
  }

  const reset = () => {
    const accent = resetThemeAccent(themeId)
    setPrimary(accent)
    setAccentInput(accent)
  }

  const selectTheme = (nextThemeId: ThemeId) => {
    saveTheme(nextThemeId)
    const accent = getThemeAccent(nextThemeId)
    setThemeId(nextThemeId)
    setPrimary(accent)
    setAccentInput(accent)
  }

  useEffect(() => {
    if (themeId === 'editorial') return
    selectTheme('editorial')
  }, [themeId])

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

  const toggleAdultContentOptIn = () => {
    setAdultContentOptIn((prev) => {
      const next = !prev
      localStorage.setItem(ADULT_CONTENT_OPT_IN_KEY, String(next))
      return next
    })
  }

  const toggleDiscordPresence = async () => {
    const settings = await window.aniPlay?.discordPresence.setEnabled(!discordPresenceEnabled)
    if (!settings) return
    setDiscordPresenceEnabled(settings.enabled)
    setDiscordPresenceConnected(settings.connected)
  }

  const openProjectPage = (page: 'repository' | 'issues' | 'pulls' | 'discord' | 'documentation') => {
    const apiPage = page as Parameters<NonNullable<typeof window.aniPlay>['openProjectPage']>[0]
    void window.aniPlay?.openProjectPage(apiPage)
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

  const selectAdBlockMode = async (mode: AdBlockMode) => {
    const state = await window.aniPlay?.adBlock.setSettings({ mode })
    if (state) setAdBlockState(state)
  }

  const toggleKnownAdHosts = async () => {
    const state = await window.aniPlay?.adBlock.setSettings({ blockKnownAdHosts: !(adBlockState?.blockKnownAdHosts ?? true) })
    if (state) setAdBlockState(state)
  }

  const saveTorrentSettings = async (update: Partial<TorrentSettings>) => {
    const settings = await window.aniPlay?.torrent.setSettings(update)
    if (settings) setTorrentSettings(settings)
  }

  const sections: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
    { id: 'theme', label: t('settings.theme.title'), icon: <Palette size={16} /> },
    { id: 'player', label: t('settings.player.title'), icon: <Video size={16} /> },
    { id: 'search', label: t('settings.search.title'), icon: <Search size={16} /> },
    { id: 'downloads', label: t('settings.downloads.title'), icon: <Download size={16} /> },
    { id: 'updates', label: t('settings.updates.title'), icon: <RefreshCw size={16} /> },
    { id: 'project', label: t('settings.project.title'), icon: <Globe size={16} /> },
    { id: 'adblock', label: t('settings.adblock.title'), icon: <Shield size={16} /> },
    { id: 'advanced', label: t('settings.advanced.title'), icon: <SlidersHorizontal size={16} /> },
  ]

  return (
    <div className="flex-1 min-h-0">
      <section className="relative overflow-hidden rounded-3xl border border-m3-outline/20 bg-m3-surface-container/70 p-0 shadow-2xl backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-m3-primary to-transparent" />

        <div className="flex min-h-[760px] flex-col gap-0 lg:flex-row lg:items-stretch">
          <aside className="w-full shrink-0 border-b border-m3-outline/15 bg-m3-surface-container/50 p-4 md:p-5 lg:w-72 lg:border-b-0 lg:border-r lg:p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary">
                <Settings size={20} />
              </div>

              <div>
                <h2 className="text-xl font-black tracking-tight">{t('nav.settings')}</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  aria-pressed={activeSection === section.id}
                  className={`group relative flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-bold transition-all ${
                    activeSection === section.id
                      ? 'border-m3-primary/30 bg-m3-primary/10 text-m3-primary shadow-[inset_0_0_0_1px_rgba(208,188,255,0.14)]'
                      : 'border-m3-outline/15 bg-m3-surface/35 text-m3-on-surface-variant hover:bg-m3-on-surface/8 hover:text-m3-on-surface'
                  }`}
                >
                  <span
                    className={`flex size-7 items-center justify-center rounded-lg ${activeSection === section.id ? 'bg-m3-primary/15 text-m3-primary' : 'bg-m3-surface-container/80 text-m3-on-surface-variant'}`}
                  >
                    {section.icon}
                  </span>
                  <span className="truncate">{section.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-7">
            {activeSection === 'theme' && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary">
                    <Palette size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-m3-on-surface-variant">
                      {t('settings.theme.title')}
                    </p>
                    <h3 className="mt-1 text-2xl font-black tracking-tight">{t('settings.theme.title')}</h3>
                  </div>
                </div>
                <p className="mb-4 text-sm text-m3-on-surface-variant">{t('settings.theme.description')}</p>
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  {(['editorial'] as ThemeId[]).map((option) => {
                    const selected = themeId === option
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectTheme(option)}
                        className={`theme-option text-left ${selected ? 'theme-option-selected' : ''}`}
                      >
                        <span className={`theme-option-preview theme-option-preview-${option}`} aria-hidden="true">
                          <span className="theme-option-preview-nav" />
                          <span className="theme-option-preview-card" />
                          <span className="theme-option-preview-accent" />
                        </span>
                        <span className="mt-3 flex items-start justify-between gap-3">
                          <span>
                            <strong className="block text-sm">{t(`settings.theme.presets.${option}.name`)}</strong>
                            <span className="mt-1 block text-xs leading-5 text-m3-on-surface-variant">
                              {t(`settings.theme.presets.${option}.description`)}
                            </span>
                          </span>
                          {selected ? (
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-m3-primary text-m3-on-primary">
                              <Check size={14} />
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="grid grid-cols-1 gap-5 border-t border-m3-outline/15 pt-5 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="space-y-3">
                    <p className="text-sm font-bold">{t('settings.theme.accent')}</p>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.theme.accentDescription')}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={primary}
                        onChange={(e) => handleColor(e.target.value)}
                        className="h-10 w-16 cursor-pointer rounded-lg border border-m3-outline/30 bg-transparent"
                      />
                      <input
                        type="text"
                        value={accentInput}
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          setAccentInput(v)
                          if (isValidAccent(v)) handleColor(v)
                        }}
                        className="w-36 rounded-xl border border-m3-outline/20 bg-m3-on-surface/5 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={reset}
                        className="flex items-center gap-2 rounded-xl border border-m3-outline/30 px-3 py-2 text-sm hover:bg-m3-on-surface/10"
                      >
                        <RotateCcw size={14} />
                        {t('settings.theme.reset')}
                      </button>
                    </div>
                  </div>

                  <div className="w-full rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-3 lg:w-52">
                    <p className="mb-2 text-xs text-m3-on-surface-variant">{t('settings.theme.preview')}</p>
                    <button
                      className="w-full rounded-xl px-3 py-2 font-bold"
                      style={{ backgroundColor: 'var(--color-m3-primary)', color: 'var(--color-m3-on-primary)' }}
                    >
                      {t('settings.theme.primaryButton')}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'player' && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary">
                    <Video size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-m3-on-surface-variant">
                      {t('settings.player.title')}
                    </p>
                    <h3 className="mt-1 text-2xl font-black tracking-tight">{t('settings.player.title')}</h3>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4">
                    <div>
                      <p className="text-sm font-bold">{t('settings.player.nativeControls')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.player.nativeDescription')}</p>
                    </div>
                    <button
                      onClick={toggleNativeControls}
                      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${useNativeControls ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                      aria-pressed={useNativeControls}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${useNativeControls ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.player.audioVersion')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.player.audioDescription')}</p>
                    </div>
                    <div className="inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label={t('settings.player.audioVersion')}>
                      {(['sub', 'dub'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => selectTranslationType(value)}
                          aria-pressed={translationType === value}
                          className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${translationType === value ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}
                        >
                          {value === 'sub' ? t('settings.player.subbed') : t('settings.player.dubbed')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4">
                    <div className="flex items-start gap-3">
                      <Gamepad2 size={19} className="mt-0.5 shrink-0 text-m3-primary" />
                      <div>
                        <p className="text-sm font-bold">{t('settings.player.discord')}</p>
                        <p className="text-xs text-m3-on-surface-variant">{t('settings.player.discordDescription')}</p>
                        {discordPresenceEnabled && (
                          <p className={`mt-1 text-xs ${discordPresenceConnected ? 'text-green-400' : 'text-m3-on-surface-variant'}`}>
                            {discordPresenceConnected ? t('settings.player.connected') : t('settings.player.waiting')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleDiscordPresence()}
                      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${discordPresenceEnabled ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                      aria-pressed={discordPresenceEnabled}
                      aria-label={t('settings.player.enableDiscord')}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${discordPresenceEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'search' && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary">
                    <Search size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-m3-on-surface-variant">
                      {t('settings.search.title')}
                    </p>
                    <h3 className="mt-1 text-2xl font-black tracking-tight">{t('settings.search.title')}</h3>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4">
                    <div>
                      <p className="text-sm font-bold">{t('settings.search.aniListFirst')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.search.aniListFirstDescription')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAniListFirstSearch}
                      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${aniListFirstSearch ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                      aria-pressed={aniListFirstSearch}
                      aria-label={t('settings.search.enableAniListFirst')}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${aniListFirstSearch ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4">
                    <div>
                      <p className="text-sm font-bold">{t('settings.search.adultContent')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.search.adultContentDescription')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAdultContentOptIn}
                      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${adultContentOptIn ? 'bg-amber-300' : 'bg-m3-surface-variant/60'}`}
                      aria-pressed={adultContentOptIn}
                      aria-label={t('settings.search.enableAdultContent')}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${adultContentOptIn ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'downloads' && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-m3-primary/10 text-m3-primary">
                    <Download size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-m3-on-surface-variant">
                      {t('settings.downloads.title')}
                    </p>
                    <h3 className="mt-1 text-2xl font-black tracking-tight">{t('settings.downloads.title')}</h3>
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t('settings.downloads.folder')}</p>
                    <p className="mt-1 truncate text-xs text-m3-on-surface-variant" title={downloadDirectory}>
                      {downloadDirectory}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void window.aniPlay?.downloads.chooseDirectory().then((state) => setDownloadDirectory(state.settings.directory))}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-m3-outline/30 px-4 py-2 text-sm font-bold hover:bg-m3-on-surface/10"
                  >
                    <FolderOpen size={16} /> {t('settings.downloads.choose')}
                  </button>
                </div>

                {torrentSettings ? (
                  <div className="mt-4 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <Magnet size={20} className="mt-0.5 shrink-0 text-m3-primary" />
                      <div>
                        <p className="font-bold">{t('settings.downloads.torrentTitle')}</p>
                        <p className="mt-1 text-xs leading-5 text-m3-on-surface-variant">
                          {t('settings.downloads.torrentDescription')}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{t('settings.downloads.torrentCache')}</p>
                          <p className="mt-1 truncate text-xs text-m3-on-surface-variant" title={torrentSettings.cacheDirectory}>
                            {torrentSettings.cacheDirectory}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void window.aniPlay?.torrent.chooseCacheDirectory().then(setTorrentSettings)}
                          className="flex shrink-0 items-center gap-2 rounded-xl border border-m3-outline/30 px-4 py-2 text-sm font-bold hover:bg-m3-on-surface/10"
                        >
                          <FolderOpen size={16} /> {t('settings.downloads.choose')}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {([
                          ['cacheLimitGiB', 'cacheLimit', 1],
                          ['downloadLimitKiB', 'downloadLimit', 0],
                          ['uploadLimitKiB', 'uploadLimit', 0],
                        ] as const).map(([key, label, minimum]) => (
                          <label key={key} className="text-xs font-bold text-m3-on-surface-variant">
                            {t(`settings.downloads.${label}`)}
                            <input
                              type="number"
                              min={minimum}
                              step="1"
                              value={torrentSettings[key]}
                              onChange={(event) => setTorrentSettings({ ...torrentSettings, [key]: Number(event.target.value) })}
                              onBlur={() => void saveTorrentSettings({ [key]: torrentSettings[key] })}
                              className="mt-1.5 w-full rounded-xl border border-m3-outline/20 bg-m3-surface/50 px-3 py-2 text-sm text-m3-on-surface outline-none focus:border-m3-primary/60"
                            />
                          </label>
                        ))}
                        <label className="text-xs font-bold text-m3-on-surface-variant">
                          {t('settings.downloads.mpvPath')}
                          <input
                            type="text"
                            value={torrentSettings.mpvPath}
                            placeholder="mpv"
                            onChange={(event) => setTorrentSettings({ ...torrentSettings, mpvPath: event.target.value })}
                            onBlur={() => void saveTorrentSettings({ mpvPath: torrentSettings.mpvPath })}
                            className="mt-1.5 w-full rounded-xl border border-m3-outline/20 bg-m3-surface/50 px-3 py-2 text-sm text-m3-on-surface outline-none focus:border-m3-primary/60"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {([
                          ['deleteAfterPlayback', 'deleteAfterPlayback'],
                          ['privacyAccepted', 'privacyAccepted'],
                        ] as const).map(([key, label]) => (
                          <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-m3-outline/15 p-3">
                            <span className="text-sm font-bold">{t(`settings.downloads.${label}`)}</span>
                            <button
                              type="button"
                              onClick={() => void saveTorrentSettings({ [key]: !torrentSettings[key] })}
                              className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${torrentSettings[key] ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                              aria-pressed={torrentSettings[key]}
                            >
                              <span className={`block size-6 rounded-full bg-white transition-transform ${torrentSettings[key] ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs leading-5 text-amber-200">{t('settings.downloads.torrentPrivacy')}</p>
                    </div>
                  </div>
                ) : null}
              </section>
            )}

            {activeSection === 'updates' && (
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                  <RefreshCw size={20} />
                  {t('settings.updates.title')}
                </h3>
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">AniPlay {updateState?.currentVersion ?? ''}</p>
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
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-m3-outline/30 px-4 py-2 text-sm font-bold hover:bg-m3-on-surface/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={updateState?.phase === 'checking' || updateState?.phase === 'downloading' ? 'animate-spin' : ''} />
                    {updateState?.phase === 'available' ? t('settings.updates.download') : updateState?.phase === 'downloaded' ? t('settings.updates.install') : t('settings.updates.check')}
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'project' && (
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                  <Globe size={20} />
                  {t('settings.project.title')}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <button onClick={() => openProjectPage('documentation')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 px-4 py-3 text-left transition-all hover:bg-m3-on-surface/10">
                    <div className="mb-1 flex items-center gap-2"><Book size={16} /><span className="text-sm font-bold">{t('settings.project.documentation')}</span></div>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.project.documentationDescription')}</p>
                  </button>
                  <button onClick={() => openProjectPage('repository')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 px-4 py-3 text-left transition-all hover:bg-m3-on-surface/10">
                    <div className="mb-1 flex items-center gap-2"><Globe size={16} /><span className="text-sm font-bold">{t('settings.project.repo')}</span></div>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.project.repoDescription')}</p>
                  </button>
                  <button onClick={() => openProjectPage('issues')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 px-4 py-3 text-left transition-all hover:bg-m3-on-surface/10">
                    <div className="mb-1 flex items-center gap-2"><Bug size={16} /><span className="text-sm font-bold">{t('settings.project.issues')}</span></div>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.project.issuesDescription')}</p>
                  </button>
                  <button onClick={() => openProjectPage('pulls')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 px-4 py-3 text-left transition-all hover:bg-m3-on-surface/10">
                    <div className="mb-1 flex items-center gap-2"><GitPullRequest size={16} /><span className="text-sm font-bold">{t('settings.project.contribute')}</span></div>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.project.contributeDescription')}</p>
                  </button>
                  <button onClick={() => openProjectPage('discord')} className="rounded-xl border border-m3-outline/20 bg-m3-surface-container/40 px-4 py-3 text-left transition-all hover:bg-m3-on-surface/10">
                    <div className="mb-1 flex items-center gap-2"><MessageCircle size={16} /><span className="text-sm font-bold">{t('settings.project.discord')}</span></div>
                    <p className="text-xs text-m3-on-surface-variant">{t('settings.project.discordDescription')}</p>
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'adblock' && (
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                  <Shield size={20} />
                  {t('settings.adblock.title')}
                </h3>
                <div className="space-y-4 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4">
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.adblock.mode')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.adblock.modeDescription')}</p>
                      <p className="mt-1 text-xs text-m3-on-surface-variant/70">
                        {adBlockState ? t('settings.adblock.status', { lists: adBlockState.listCount, blocked: adBlockState.blockedCount, total: adBlockState.totalBlockedCount }) : t('settings.adblock.loading')}
                      </p>
                      {adBlockState?.lastError && <p className="mt-1 text-xs text-amber-200">{t('settings.adblock.lastError', { error: adBlockState.lastError })}</p>}
                    </div>
                    <select
                      value={adBlockState?.mode ?? 'easylist'}
                      onChange={(event) => void selectAdBlockMode(event.target.value as AdBlockMode)}
                      className="rounded-xl border border-m3-outline/30 bg-m3-surface px-3 py-2 text-sm font-bold text-m3-on-surface"
                    >
                      <option value="off">{t('settings.adblock.modes.off')}</option>
                      <option value="easylist">{t('settings.adblock.modes.easylist')}</option>
                      <option value="basic">{t('settings.adblock.modes.basic')}</option>
                      <option value="balanced">{t('settings.adblock.modes.balanced')}</option>
                      <option value="strict">{t('settings.adblock.modes.strict')}</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.adblock.knownHosts')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.adblock.knownHostsDescription')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleKnownAdHosts()}
                      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${adBlockState?.blockKnownAdHosts ?? true ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                      aria-pressed={adBlockState?.blockKnownAdHosts ?? true}
                      aria-label={t('settings.adblock.knownHosts')}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${adBlockState?.blockKnownAdHosts ?? true ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <p className="text-xs text-m3-on-surface-variant/70">{t('settings.adblock.note')}</p>
                </div>
              </section>
            )}

            {activeSection === 'advanced' && (
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                  <SlidersHorizontal size={20} />
                  {t('settings.advanced.title')}
                </h3>
                <div className="space-y-4 rounded-2xl border border-m3-outline/20 bg-m3-surface-container/40 p-4">
                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.advanced.language')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.languageDescription')}</p>
                    </div>
                    <select
                      value={language}
                      onChange={(event) => selectLanguage(event.target.value as AppLanguage)}
                      className="rounded-xl border border-m3-outline/30 bg-m3-surface px-3 py-2 text-sm font-bold text-m3-on-surface"
                    >
                      {supportedLanguages.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.advanced.safeGraphics')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.safeGraphicsDescription')}</p>
                      {safeGraphicsRestartRequired && <p className="mt-1 text-xs text-amber-200">{t('settings.advanced.safeGraphicsRestart')}</p>}
                      {safeGraphicsLaunchOverride && <p className="mt-1 text-xs text-m3-primary">{t('settings.advanced.safeGraphicsOverride')}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleSafeGraphicsMode()}
                      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${safeGraphicsMode ? 'bg-m3-primary' : 'bg-m3-surface-variant/60'}`}
                      aria-pressed={safeGraphicsMode}
                      aria-label={t('settings.advanced.safeGraphics')}
                    >
                      <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${safeGraphicsMode ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.advanced.notificationSounds')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.notificationSoundsDescription')}</p>
                    </div>
                    <div className="inline-flex rounded-xl border border-m3-outline/30 p-1" role="group" aria-label={t('settings.advanced.soundMode')}>
                      {([
                        ['off', t('settings.advanced.modes.off')],
                        ['important', t('settings.advanced.modes.important')],
                        ['all', t('settings.advanced.modes.all')],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => selectNotificationSoundMode(value)}
                          aria-pressed={notificationSoundMode === value}
                          className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${notificationSoundMode === value ? 'bg-m3-primary text-m3-on-primary' : 'hover:bg-m3-on-surface/10'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div>
                      <p className="text-sm font-bold">{t('settings.advanced.soundPreset')}</p>
                      <p className="text-xs text-m3-on-surface-variant">{t('settings.advanced.soundPresetDescription')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={notificationSoundPreset}
                        disabled={notificationSoundMode === 'off'}
                        onChange={(event) => selectNotificationSoundPreset(event.target.value as NotificationSoundPreset)}
                        className="rounded-xl border border-m3-outline/30 bg-m3-surface px-3 py-2 text-sm font-bold text-m3-on-surface disabled:opacity-50"
                      >
                        <option value="soft">{t('settings.advanced.presets.soft')}</option>
                        <option value="crystal">{t('settings.advanced.presets.crystal')}</option>
                        <option value="arcade">{t('settings.advanced.presets.arcade')}</option>
                      </select>
                      <button
                        type="button"
                        disabled={notificationSoundMode === 'off'}
                        onClick={() => playNotificationSound(notificationSoundPreset)}
                        className="rounded-xl border border-m3-outline/30 px-4 py-2 text-sm font-bold hover:bg-m3-on-surface/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t('settings.advanced.testSound')}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}
