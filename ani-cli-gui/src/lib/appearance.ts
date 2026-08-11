export interface AppearanceSettings {
  backgroundImage: string | null
  backgroundOpacity: number
  backgroundOverlay: number
}

export const APPEARANCE_STORAGE_KEY = 'appearance.settings'

export function getAppearanceSettings(storage: Pick<Storage, 'getItem'> = localStorage): AppearanceSettings {
  try {
    const saved = storage.getItem(APPEARANCE_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        backgroundImage: parsed.backgroundImage ?? null,
        backgroundOpacity: typeof parsed.backgroundOpacity === 'number' ? parsed.backgroundOpacity : 1,
        backgroundOverlay: typeof parsed.backgroundOverlay === 'number' ? parsed.backgroundOverlay : 0
      }
    }
  } catch {}
  return {
    backgroundImage: null,
    backgroundOpacity: 1,
    backgroundOverlay: 0
  }
}

export function saveAppearanceSettings(settings: AppearanceSettings, storage: Pick<Storage, 'setItem'> = localStorage, root: HTMLElement = document.documentElement) {
  storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings))
  applyAppearanceSettings(settings, root)
}

export function applyAppearanceSettings(settings: AppearanceSettings, root: HTMLElement = document.documentElement) {
  const hasImage = Boolean(settings.backgroundImage)

  // Drive all CSS transparency via a single data-backdrop attribute.
  // 'image'            → local background image with semi-transparent surfaces
  // absent             → solid dark defaults
  if (hasImage) {
    root.dataset.backdrop = 'image'
  } else {
    delete root.dataset.backdrop
  }

  // Background image
  if (!hasImage) {
    root.style.setProperty('--app-background-image', 'none')
  } else {
    root.style.setProperty('--app-background-image', `url("${settings.backgroundImage!.replaceAll('"', '\\"')}")`)
  }

  root.style.setProperty('--app-background-opacity', String(Math.min(1, Math.max(0, settings.backgroundOpacity))))
  root.style.setProperty('--app-background-overlay', String(Math.min(1, Math.max(0, settings.backgroundOverlay))))
}

export function initializeAppearance(storage: Pick<Storage, 'getItem'> = localStorage, root: HTMLElement = document.documentElement) {
  applyAppearanceSettings(getAppearanceSettings(storage), root)
}
