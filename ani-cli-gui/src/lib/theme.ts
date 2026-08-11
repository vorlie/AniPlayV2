import { argbFromRgb, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities'
import { loadThemeCssFromContent, loadThemeCssFromFile, unloadThemeCss, unloadAllThemeCss } from './themeCss'

export type ThemeId = 'editorial' | 'system24' | string // Allow custom theme IDs

export interface ThemeDefinition {
  id: ThemeId
  defaultAccent: string
  cssPath?: string // Optional path to theme-specific CSS file (for built-in themes)
  cssContent?: string // CSS content for custom themes (loaded from app data)
  isCustom?: boolean // Flag for user-imported themes
  name?: string // Display name for custom themes
}

export const THEME_STORAGE_KEY = 'theme.id'
export const LEGACY_ACCENT_STORAGE_KEY = 'theme.primary'
export const CUSTOM_THEMES_STORAGE_KEY = 'theme.custom'

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  editorial: { id: 'editorial', defaultAccent: '#FF5338', cssPath: '/themes/editorial.css' },
  system24: { id: 'system24', defaultAccent: '#FF6B9D', cssPath: '/themes/system24.css' },
}

const ACCENT_STORAGE_KEYS: Record<string, string> = {
  editorial: 'theme.primary.editorial',
  system24: 'theme.primary.system24',
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function contrastTextFor({ r, g, b }: { r: number; g: number; b: number }) {
  const channels = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.36 ? '#111113' : '#FFFFFF'
}

export function isThemeId(value: string | null): value is ThemeId {
  return value !== null && (value === 'editorial' || value === 'system24' || value.startsWith('custom-'))
}

export function isValidAccent(value: string | null): value is string {
  return value !== null && HEX_COLOR_PATTERN.test(value)
}

export function getTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeId {
  const saved = storage.getItem(THEME_STORAGE_KEY)
  return isThemeId(saved) ? saved : 'editorial'
}

export function getThemeAccent(themeId: ThemeId, storage: Pick<Storage, 'getItem'> = localStorage): string {
  const storageKey = ACCENT_STORAGE_KEYS[themeId] || `theme.primary.${themeId}`
  const saved = storage.getItem(storageKey)
  if (isValidAccent(saved)) return saved.toUpperCase()

  // Check built-in themes first
  if (THEME_DEFINITIONS[themeId]) {
    return THEME_DEFINITIONS[themeId].defaultAccent
  }

  // Fall back to custom themes
  const customThemes = getCustomThemes(storage as Storage)
  if (customThemes[themeId]) {
    return customThemes[themeId].defaultAccent
  }

  // Ultimate fallback
  return '#FF5338'
}

export function migrateLegacyThemeStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
  const legacyAccent = storage.getItem(LEGACY_ACCENT_STORAGE_KEY)
  if (legacyAccent !== null) storage.removeItem(LEGACY_ACCENT_STORAGE_KEY)
}

export function applyTheme(themeId: ThemeId, accent: string, root: HTMLElement = document.documentElement) {
  const safeAccent = isValidAccent(accent) ? accent : THEME_DEFINITIONS[themeId]?.defaultAccent || '#FF5338'
  const { r, g, b } = hexToRgb(safeAccent)
  const sourceColor = argbFromRgb(r, g, b)
  const dark = themeFromSourceColor(sourceColor, [{ name: 'custom-primary', value: sourceColor, blend: true }]).schemes.dark
  const usesDirectAccent = themeId === 'editorial' || themeId === 'system24' || themeId.startsWith('custom-')
  const primary = usesDirectAccent ? safeAccent.toUpperCase() : hexFromArgb(dark.primary)

  root.dataset.theme = themeId
  root.style.setProperty('--color-m3-primary', primary)
  root.style.setProperty('--accent-glow', primary)
  root.style.setProperty('--accent', primary)
  root.style.setProperty('--accent-dim', `rgba(${r}, ${g}, ${b}, 0.15)`)
  root.style.setProperty('--accent-dimmer', `rgba(${r}, ${g}, ${b}, 0.08)`)
  root.style.setProperty('--color-m3-on-primary', usesDirectAccent ? contrastTextFor({ r, g, b }) : hexFromArgb(dark.onPrimary))
  root.style.setProperty('--color-m3-primary-container', hexFromArgb(dark.primaryContainer))
  root.style.setProperty('--color-m3-on-primary-container', hexFromArgb(dark.onPrimaryContainer))
  root.style.setProperty('--color-m3-secondary', themeId === 'editorial' ? '#72E6BE' : themeId === 'system24' ? '#2ed573' : hexFromArgb(dark.secondary))
  root.style.setProperty('--color-m3-on-secondary', themeId === 'editorial' ? '#09251D' : themeId === 'system24' ? '#0a0b0e' : hexFromArgb(dark.onSecondary))
  root.style.setProperty(
    '--color-m3-outline',
    themeId === 'editorial' ? '#918D87' : themeId === 'system24' ? '#2a2d35' : hexFromArgb(dark.outline),
  )
  root.style.setProperty(
    '--color-m3-on-surface',
    themeId === 'editorial' ? '#F5F2ED' : themeId === 'system24' ? '#e8eaed' : hexFromArgb(dark.onSurface),
  )
  root.style.setProperty(
    '--color-m3-on-surface-variant',
    themeId === 'editorial' ? '#BBB7B0' : themeId === 'system24' ? '#9ca3af' : hexFromArgb(dark.onSurfaceVariant),
  )

  // Load theme-specific CSS
  const allThemes = getAllThemes();
  const themeDefinition = allThemes[themeId];
  
  if (themeDefinition) {
    unloadThemeCss(themeId);
    
    if (themeDefinition.cssContent) {
      // Load from content (custom themes)
      loadThemeCssFromContent(themeId, themeDefinition.cssContent);
    } else if (themeDefinition.cssPath) {
      // Load from file (built-in themes)
      loadThemeCssFromFile(themeId, themeDefinition.cssPath);
    }
  }
}

export function initializeTheme(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage, root: HTMLElement = document.documentElement) {
  migrateLegacyThemeStorage(storage)
  const themeId = getTheme(storage)
  const accent = getThemeAccent(themeId, storage)
  applyTheme(themeId, accent, root)
  return { themeId, accent }
}

export function saveTheme(themeId: ThemeId, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, root: HTMLElement = document.documentElement) {
  const previousTheme = getTheme(storage);
  
  // Unload previous theme CSS
  if (previousTheme !== themeId) {
    unloadThemeCss(previousTheme);
  }
  
  storage.setItem(THEME_STORAGE_KEY, themeId)
  applyTheme(themeId, getThemeAccent(themeId, storage), root)
}

export function saveThemeAccent(themeId: ThemeId, accent: string, storage: Pick<Storage, 'setItem'> = localStorage, root: HTMLElement = document.documentElement) {
  if (!isValidAccent(accent)) return false
  const storageKey = ACCENT_STORAGE_KEYS[themeId] || `theme.primary.${themeId}`
  storage.setItem(storageKey, accent.toUpperCase())
  applyTheme(themeId, accent, root)
  return true
}

export function resetThemeAccent(themeId: ThemeId, storage: Pick<Storage, 'removeItem'> = localStorage, root: HTMLElement = document.documentElement) {
  const storageKey = ACCENT_STORAGE_KEYS[themeId] || `theme.primary.${themeId}`
  storage.removeItem(storageKey)

  // Get default accent from built-in or custom theme
  let accent = '#FF5338'
  if (THEME_DEFINITIONS[themeId]) {
    accent = THEME_DEFINITIONS[themeId].defaultAccent
  } else {
    const customThemes = getCustomThemes(storage as Storage)
    if (customThemes[themeId]) {
      accent = customThemes[themeId].defaultAccent
    }
  }

  applyTheme(themeId, accent, root)
  return accent
}

/**
 * Unloads all theme-specific CSS files
 * Useful for cleanup or when resetting themes
 */
export function unloadAllThemeCssFiles() {
  unloadAllThemeCss();
}

/**
 * Save a custom theme
 * @param theme - The custom theme definition
 * @param storage - Storage to use (defaults to localStorage)
 */
export function saveCustomTheme(theme: ThemeDefinition, storage = localStorage): void {
  const customThemes = getCustomThemes(storage);
  customThemes[theme.id] = theme;
  storage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
}

/**
 * Get all custom themes
 * @param storage - Storage to use (defaults to localStorage)
 */
export function getCustomThemes(storage = localStorage): Record<string, ThemeDefinition> {
  const saved = storage.getItem(CUSTOM_THEMES_STORAGE_KEY);
  if (!saved) return {};
  try {
    return JSON.parse(saved);
  } catch {
    return {};
  }
}

/**
 * Remove a custom theme
 * @param themeId - The theme ID to remove
 * @param storage - Storage to use (defaults to localStorage)
 */
export function removeCustomTheme(themeId: string, storage = localStorage): void {
  const customThemes = getCustomThemes(storage);
  delete customThemes[themeId];
  storage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
  unloadThemeCss(themeId);
}

/**
 * Get all available themes (built-in + custom)
 * @param storage - Storage to use (defaults to localStorage)
 */
export function getAllThemes(storage = localStorage): Record<string, ThemeDefinition> {
  return {
    ...THEME_DEFINITIONS,
    ...getCustomThemes(storage),
  };
}

export {
  loadThemeCssFromContent as loadThemeCss,
  loadThemeCssFromFile,
  unloadThemeCss,
  unloadAllThemeCss,
  isThemeCssLoaded,
  getLoadedThemeIds,
} from './themeCss'
