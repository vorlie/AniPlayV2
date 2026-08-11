/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Book, Bug, Check, FolderOpen, GitPullRequest, Globe, MessageCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { ADULT_CONTENT_OPT_IN_KEY, getAdultContentOptIn, ANILIST_SEARCH_KEY, getAniListFirstSearch, getTranslationType, TRANSLATION_TYPE_KEY, type TranslationType } from '../lib/api'
import { getNotificationSoundMode, getNotificationSoundPreset, playNotificationSound, setNotificationSoundMode, setNotificationSoundPreset, type NotificationSoundMode, type NotificationSoundPreset } from '../lib/notification-sounds'
import { setAppLanguage, supportedLanguages, type AppLanguage } from '../i18n'
import type { UpdateState } from '../updater-types'
import type { AdBlockMode, AdBlockState } from '../adblock-types'
import { getTheme, getThemeAccent, isValidAccent, resetThemeAccent, saveTheme, saveThemeAccent, type ThemeId } from '../lib/theme'
import { getAppearanceSettings, saveAppearanceSettings, type AppearanceSettings} from '../lib/appearance'
import type { TorrentSettings } from '../torrent-types'
import { Toggle } from '../components'

// Reusable components
function SettingsSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h2>{title}</h2>
        {count != null && <span>{count}</span>}
      </div>
      {children}
    </section>
  )
}

function SettingRow({ title, description, control, warning = false }: { title: string; description?: React.ReactNode; control: React.ReactNode; warning?: boolean }) {
  return (
    <div className={`settings-row ${warning ? 'settings-warning' : ''}`}>
      <div className="settings-row-main">
        <h3 className="settings-row-title">{title}</h3>
        {description && <p className="settings-row-description">{description}</p>}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  )
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
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
  const [appearance, setAppearance] = useState<AppearanceSettings>(getAppearanceSettings)

  const updateAppearance = (update: Partial<AppearanceSettings>) => {
    const next = { ...appearance, ...update }
    setAppearance(next)
    saveAppearanceSettings(next)
  }

  useEffect(() => {
    if (!window.aniPlay) return
    void window.aniPlay.updater.getState().then(setUpdateState)
    return window.aniPlay.updater.onChanged(setUpdateState)
  }, [])

  useEffect(() => {
    void window.aniPlay?.torrent.getSettings().then(setTorrentSettings).catch(() => { })
  }, [])

  useEffect(() => {
    void window.aniPlay?.discordPresence.getSettings().then((settings) => {
      setDiscordPresenceEnabled(settings.enabled)
      setDiscordPresenceConnected(settings.connected)
    }).catch(() => { })
  }, [])

  useEffect(() => {
    if (!discordPresenceEnabled) return
    const timer = window.setInterval(() => {
      void window.aniPlay?.discordPresence.getSettings().then((settings) => setDiscordPresenceConnected(settings.connected)).catch(() => { })
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
    }).catch(() => { })
  }, [])

  useEffect(() => {
    void window.aniPlay?.adBlock.getState().then(setAdBlockState).catch(() => { })
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

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <div className="settings-eyebrow">
            {t('nav.settings')}
          </div>

          <h1 className="settings-title">
            {t('nav.settings')}
          </h1>

          <p className="settings-subtitle">
            {t('settings.description')}
          </p>
        </div>
      </header>

      <div className="settings-content">
        {/* Theme Section */}
        <SettingsSection title={t('settings.theme.title')}>
          <SettingRow
            title={t('settings.theme.presets.editorial.name')}
            description={t('settings.theme.presets.editorial.description')}
            control={
              <div className="settings-theme-check">
                <Check size={14} />
              </div>
            }
          />

          <SettingRow
            title={t('settings.theme.accent')}
            description={t('settings.theme.accentDescription')}
            control={
              <div className="settings-color-row">
                <input
                  type="color"
                  value={primary}
                  onChange={(e) => handleColor(e.target.value)}
                  className="settings-color-input"
                />
                <input
                  type="text"
                  value={accentInput}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setAccentInput(v)
                    if (isValidAccent(v)) handleColor(v)
                  }}
                  className="settings-color-text"
                />
                <button
                  onClick={reset}
                  className="settings-button"
                >
                  <RotateCcw size={14} />
                  {t('settings.theme.reset')}
                </button>
              </div>
            }
          />
          <SettingRow
            title={t('settings.theme.backgroundImage')}
            description={t('settings.theme.backgroundImageDescription')}
            control={
              <div className="settings-color-row">
                <input
                  type="file"
                  accept="image/*"
                  id="background-image-input"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      // Compress to base64 so it fits in localStorage and bypasses file:// CORS
                      const url = URL.createObjectURL(file)
                      const img = new Image()
                      img.onload = () => {
                        const canvas = document.createElement('canvas')
                        let w = img.width
                        let h = img.height
                        // Max width/height to keep base64 size manageable
                        const MAX = 1920
                        if (w > MAX || h > MAX) {
                          if (w > h) { h = (h / w) * MAX; w = MAX; }
                          else { w = (w / h) * MAX; h = MAX; }
                        }
                        canvas.width = w
                        canvas.height = h
                        const ctx = canvas.getContext('2d')
                        ctx?.drawImage(img, 0, 0, w, h)
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
                        updateAppearance({ backgroundImage: dataUrl })
                        URL.revokeObjectURL(url)
                      }
                      img.src = url
                    }
                  }}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('background-image-input')?.click()}
                  className="settings-button"
                >
                  {t('settings.theme.backgroundImageChoose')}
                </button>
                {appearance.backgroundImage && (
                  <button
                    type="button"
                    onClick={() => updateAppearance({ backgroundImage: null })}
                    className="settings-button"
                  >
                    {t('settings.theme.backgroundImageClear')}
                  </button>
                )}
              </div>
            }
          />

          <SettingRow
            title={t('settings.theme.backgroundOpacity')}
            control={
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={appearance.backgroundOpacity}
                onChange={(e) => updateAppearance({ backgroundOpacity: Number(e.target.value) })}
                className="settings-slider"
              />
            }
          />

          <SettingRow
            title={t('settings.theme.backgroundOverlay')}
            control={
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={appearance.backgroundOverlay}
                onChange={(e) => updateAppearance({ backgroundOverlay: Number(e.target.value) })}
                className="settings-slider"
              />
            }
          />
        </SettingsSection>

        {/* Player Section */}
        <SettingsSection title={t('settings.player.title')}>
          <SettingRow
            title={t('settings.player.nativeControls')}
            description={t('settings.player.nativeDescription')}
            control={
              <Toggle
                active={useNativeControls}
                onToggle={toggleNativeControls}
                ariaLabel={t('settings.player.nativeControls')}
              />
            }
          />

          <SettingRow
            title={t('settings.player.audioVersion')}
            description={t('settings.player.audioDescription')}
            control={
              <div className="settings-button-group">
                {(['sub', 'dub'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectTranslationType(value)}
                    className={translationType === value ? 'active' : ''}
                  >
                    {value === 'sub' ? t('settings.player.subbed') : t('settings.player.dubbed')}
                  </button>
                ))}
              </div>
            }
          />

          <SettingRow
            title={t('settings.player.discord')}
            description={
              <div>
                {t('settings.player.discordDescription')}
                {discordPresenceEnabled && (
                  <p className={`settings-status ${discordPresenceConnected ? 'success' : ''}`}>
                    {discordPresenceConnected ? t('settings.player.connected') : t('settings.player.waiting')}
                  </p>
                )}
              </div>
            }
            control={
              <Toggle
                active={discordPresenceEnabled}
                onToggle={() => void toggleDiscordPresence()}
                ariaLabel={t('settings.player.enableDiscord')}
              />
            }
          />
        </SettingsSection>

        {/* Search Section */}
        <SettingsSection title={t('settings.search.title')}>
          <SettingRow
            title={t('settings.search.aniListFirst')}
            description={t('settings.search.aniListFirstDescription')}
            control={
              <Toggle
                active={aniListFirstSearch}
                onToggle={toggleAniListFirstSearch}
                ariaLabel={t('settings.search.enableAniListFirst')}
              />
            }
          />

          <SettingRow
            title={t('settings.search.adultContent')}
            description={t('settings.search.adultContentDescription')}
            warning
            control={
              <Toggle
                active={adultContentOptIn}
                onToggle={toggleAdultContentOptIn}
                ariaLabel={t('settings.search.enableAdultContent')}
              />
            }
          />
        </SettingsSection>

        {/* Downloads Section */}
        <SettingsSection title={t('settings.downloads.title')}>
          <SettingRow
            title={t('settings.downloads.folder')}
            description={downloadDirectory}
            control={
              <button
                type="button"
                onClick={() => void window.aniPlay?.downloads.chooseDirectory().then((state) => setDownloadDirectory(state.settings.directory))}
                className="settings-button"
              >
                <FolderOpen size={14} />
                {t('settings.downloads.choose')}
              </button>
            }
          />

          {torrentSettings && (
            <>
              <SettingRow
                title={t('settings.downloads.torrentCache')}
                description={torrentSettings.cacheDirectory}
                control={
                  <button
                    type="button"
                    onClick={() => void window.aniPlay?.torrent.chooseCacheDirectory().then(setTorrentSettings)}
                    className="settings-button"
                  >
                    <FolderOpen size={14} />
                    {t('settings.downloads.choose')}
                  </button>
                }
              />

              <SettingRow
                title={t('settings.downloads.cacheLimit')}
                description={t('settings.downloads.cacheLimitDescription')}
                control={
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={torrentSettings.cacheLimitGiB}
                    onChange={(event) => setTorrentSettings({ ...torrentSettings, cacheLimitGiB: Number(event.target.value) })}
                    onBlur={() => void saveTorrentSettings({ cacheLimitGiB: torrentSettings.cacheLimitGiB })}
                    className="settings-input"
                    style={{ width: '100px' }}
                  />
                }
              />

              <SettingRow
                title={t('settings.downloads.downloadLimit')}
                description={t('settings.downloads.downloadLimitDescription')}
                control={
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={torrentSettings.downloadLimitKiB}
                    onChange={(event) => setTorrentSettings({ ...torrentSettings, downloadLimitKiB: Number(event.target.value) })}
                    onBlur={() => void saveTorrentSettings({ downloadLimitKiB: torrentSettings.downloadLimitKiB })}
                    className="settings-input"
                    style={{ width: '100px' }}
                  />
                }
              />

              <SettingRow
                title={t('settings.downloads.uploadLimit')}
                description={t('settings.downloads.uploadLimitDescription')}
                control={
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={torrentSettings.uploadLimitKiB}
                    onChange={(event) => setTorrentSettings({ ...torrentSettings, uploadLimitKiB: Number(event.target.value) })}
                    onBlur={() => void saveTorrentSettings({ uploadLimitKiB: torrentSettings.uploadLimitKiB })}
                    className="settings-input"
                    style={{ width: '100px' }}
                  />
                }
              />

              <SettingRow
                title={t('settings.downloads.mpvPath')}
                description={t('settings.downloads.mpvPathDescription')}
                control={
                  <input
                    type="text"
                    value={torrentSettings.mpvPath}
                    placeholder="mpv"
                    onChange={(event) => setTorrentSettings({ ...torrentSettings, mpvPath: event.target.value })}
                    onBlur={() => void saveTorrentSettings({ mpvPath: torrentSettings.mpvPath })}
                    className="settings-input"
                    style={{ width: '200px' }}
                  />
                }
              />

              <SettingRow
                title={t('settings.downloads.deleteAfterPlayback')}
                description={t('settings.downloads.deleteAfterPlaybackDescription')}
                control={
                  <Toggle
                    active={torrentSettings.deleteAfterPlayback}
                    onToggle={() => void saveTorrentSettings({ deleteAfterPlayback: !torrentSettings.deleteAfterPlayback })}
                  />
                }
              />

              <SettingRow
                title={t('settings.downloads.privacyAccepted')}
                description={
                  <>
                    <p className="settings-row-description">{t('settings.downloads.torrentPrivacy')}</p>
                  </>
                }
                control={
                  <Toggle
                    active={torrentSettings.privacyAccepted}
                    onToggle={() => void saveTorrentSettings({ privacyAccepted: !torrentSettings.privacyAccepted })}
                  />
                }
              />
            </>
          )}
        </SettingsSection>

        {/* Updates Section */}
        <SettingsSection title={t('settings.updates.title')}>
          <SettingRow
            title={`AniPlay ${updateState?.currentVersion ?? ''}`}
            description={
              <div>
                {updateState?.phase === 'available' && t('settings.updates.available', { version: updateState.availableVersion })}
                {updateState?.phase === 'downloading' && t('settings.updates.downloading', { version: updateState.availableVersion ?? '', progress: Math.round(updateState.progress ?? 0) })}
                {updateState?.phase === 'downloaded' && t('settings.updates.downloaded', { version: updateState.availableVersion })}
                {updateState?.phase === 'checking' && t('settings.updates.checking')}
                {(updateState?.phase === 'idle' || updateState?.phase === 'error' || updateState?.phase === 'unavailable') && (updateState.message ?? t('settings.updates.fallback'))}
                {!updateState && t('settings.updates.loading')}
                {updateState?.phase === 'downloading' && (
                  <div className="settings-update-progress">
                    <div className="settings-update-progress-fill" style={{ width: `${updateState.progress ?? 0}%` }} />
                  </div>
                )}
              </div>
            }
            control={
              <button
                type="button"
                disabled={!updateState || updateState.phase === 'unavailable' || updateState.phase === 'checking' || updateState.phase === 'downloading'}
                onClick={() => {
                  if (!window.aniPlay || !updateState) return
                  if (updateState.phase === 'available') void window.aniPlay.updater.download().then(setUpdateState)
                  else if (updateState.phase === 'downloaded') void window.aniPlay.updater.install()
                  else void window.aniPlay.updater.check().then(setUpdateState)
                }}
                className="settings-button"
              >
                <RefreshCw size={14} className={updateState?.phase === 'checking' || updateState?.phase === 'downloading' ? 'animate-spin' : ''} />
                {updateState?.phase === 'available' ? t('settings.updates.download') : updateState?.phase === 'downloaded' ? t('settings.updates.install') : t('settings.updates.check')}
              </button>
            }
          />
        </SettingsSection>

        {/* Project Section */}
        <SettingsSection title={t('settings.project.title')}>
          <div className="settings-links-grid">
            <button onClick={() => openProjectPage('documentation')} className="settings-link-card">
              <div className="settings-link-header">
                <Book size={16} className="settings-link-icon" />
                <h4 className="settings-link-title">{t('settings.project.documentation')}</h4>
              </div>
              <p className="settings-link-description">{t('settings.project.documentationDescription')}</p>
            </button>
            <button onClick={() => openProjectPage('repository')} className="settings-link-card">
              <div className="settings-link-header">
                <Globe size={16} className="settings-link-icon" />
                <h4 className="settings-link-title">{t('settings.project.repo')}</h4>
              </div>
              <p className="settings-link-description">{t('settings.project.repoDescription')}</p>
            </button>
            <button onClick={() => openProjectPage('issues')} className="settings-link-card">
              <div className="settings-link-header">
                <Bug size={16} className="settings-link-icon" />
                <h4 className="settings-link-title">{t('settings.project.issues')}</h4>
              </div>
              <p className="settings-link-description">{t('settings.project.issuesDescription')}</p>
            </button>
            <button onClick={() => openProjectPage('pulls')} className="settings-link-card">
              <div className="settings-link-header">
                <GitPullRequest size={16} className="settings-link-icon" />
                <h4 className="settings-link-title">{t('settings.project.contribute')}</h4>
              </div>
              <p className="settings-link-description">{t('settings.project.contributeDescription')}</p>
            </button>
            <button onClick={() => openProjectPage('discord')} className="settings-link-card">
              <div className="settings-link-header">
                <MessageCircle size={16} className="settings-link-icon" />
                <h4 className="settings-link-title">{t('settings.project.discord')}</h4>
              </div>
              <p className="settings-link-description">{t('settings.project.discordDescription')}</p>
            </button>
          </div>
        </SettingsSection>

        {/* AdBlock Section */}
        <SettingsSection title={t('settings.adblock.title')}>
          <SettingRow
            title={t('settings.adblock.mode')}
            description={
              <>
                {t('settings.adblock.modeDescription')}
                {adBlockState && (
                  <p className="settings-status">
                    {t('settings.adblock.status', { lists: adBlockState.listCount, blocked: adBlockState.blockedCount, total: adBlockState.totalBlockedCount })}
                  </p>
                )}
                {!adBlockState && (
                  <p className="settings-status">
                    {t('settings.adblock.loading')}
                  </p>
                )}
                {adBlockState?.lastError && <p className="settings-status error">{t('settings.adblock.lastError', { error: adBlockState.lastError })}</p>}
              </>
            }
            control={
              <select
                value={adBlockState?.mode ?? 'easylist'}
                onChange={(event) => void selectAdBlockMode(event.target.value as AdBlockMode)}
                className="settings-select"
              >
                <option value="off">{t('settings.adblock.modes.off')}</option>
                <option value="easylist">{t('settings.adblock.modes.easylist')}</option>
                <option value="basic">{t('settings.adblock.modes.basic')}</option>
                <option value="balanced">{t('settings.adblock.modes.balanced')}</option>
                <option value="strict">{t('settings.adblock.modes.strict')}</option>
              </select>
            }
          />

          <SettingRow
            title={t('settings.adblock.knownHosts')}
            description={
              <div>
                {t('settings.adblock.knownHostsDescription')}
                <p className="settings-row-description">{t('settings.adblock.note')}</p>
              </div>
            }
            control={
              <Toggle
                active={adBlockState?.blockKnownAdHosts ?? true}
                onToggle={() => void toggleKnownAdHosts()}
              />
            }
          />
        </SettingsSection>

        {/* Advanced Section */}
        <SettingsSection title={t('settings.advanced.title')}>
          <SettingRow
            title={t('settings.advanced.language')}
            description={t('settings.advanced.languageDescription')}
            control={
              <select
                value={language}
                onChange={(event) => selectLanguage(event.target.value as AppLanguage)}
                className="settings-select"
              >
                {supportedLanguages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            }
          />

          <SettingRow
            title={t('settings.advanced.safeGraphics')}
            description={
              <div>
                {t('settings.advanced.safeGraphicsDescription')}
                {safeGraphicsRestartRequired && <p className="settings-status warning">{t('settings.advanced.safeGraphicsRestart')}</p>}
                {safeGraphicsLaunchOverride && <p className="settings-status">{t('settings.advanced.safeGraphicsOverride')}</p>}
              </div>
            }
            control={
              <Toggle
                active={safeGraphicsMode}
                onToggle={() => void toggleSafeGraphicsMode()}
              />
            }
          />

          <SettingRow
            title={t('settings.advanced.notificationSounds')}
            description={t('settings.advanced.notificationSoundsDescription')}
            control={
              <div className="settings-button-group">
                {([
                  ['off', t('settings.advanced.modes.off')],
                  ['important', t('settings.advanced.modes.important')],
                  ['all', t('settings.advanced.modes.all')],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectNotificationSoundMode(value)}
                    className={notificationSoundMode === value ? 'active' : ''}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />

          <SettingRow
            title={t('settings.advanced.soundPreset')}
            description={t('settings.advanced.soundPresetDescription')}
            control={
              <div className="settings-color-row">
                <select
                  value={notificationSoundPreset}
                  disabled={notificationSoundMode === 'off'}
                  onChange={(event) => selectNotificationSoundPreset(event.target.value as NotificationSoundPreset)}
                  className="settings-select"
                >
                  <option value="soft">{t('settings.advanced.presets.soft')}</option>
                  <option value="crystal">{t('settings.advanced.presets.crystal')}</option>
                  <option value="arcade">{t('settings.advanced.presets.arcade')}</option>
                </select>
                <button
                  type="button"
                  disabled={notificationSoundMode === 'off'}
                  onClick={() => playNotificationSound(notificationSoundPreset)}
                  className="settings-button"
                >
                  {t('settings.advanced.testSound')}
                </button>
              </div>
            }
          />
        </SettingsSection>
      </div>
    </div>
  )
}
