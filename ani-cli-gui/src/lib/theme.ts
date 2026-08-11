import { argbFromRgb, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities'

export type ThemeId = 'editorial'

export interface ThemeDefinition {
  id: ThemeId
  defaultAccent: string
}

export const THEME_STORAGE_KEY = 'theme.id'
export const LEGACY_ACCENT_STORAGE_KEY = 'theme.primary'

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  editorial: { id: 'editorial', defaultAccent: '#FF5338' },
}

const ACCENT_STORAGE_KEYS: Record<ThemeId, string> = {
  editorial: 'theme.primary.editorial',
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => clamp(value).toString(16).padStart(2, '0')).join('')}`
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
  return value === 'editorial'
}

export function isValidAccent(value: string | null): value is string {
  return value !== null && HEX_COLOR_PATTERN.test(value)
}

export function getTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeId {
  const saved = storage.getItem(THEME_STORAGE_KEY)
  return isThemeId(saved) ? saved : 'editorial'
}

export function getThemeAccent(themeId: ThemeId, storage: Pick<Storage, 'getItem'> = localStorage): string {
  const saved = storage.getItem(ACCENT_STORAGE_KEYS[themeId])
  return isValidAccent(saved) ? saved.toUpperCase() : THEME_DEFINITIONS[themeId].defaultAccent
}

export function migrateLegacyThemeStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
  const legacyAccent = storage.getItem(LEGACY_ACCENT_STORAGE_KEY)
  if (legacyAccent !== null) storage.removeItem(LEGACY_ACCENT_STORAGE_KEY)
}

export function applyTheme(themeId: ThemeId, accent: string, root: HTMLElement = document.documentElement) {
  const safeAccent = isValidAccent(accent) ? accent : THEME_DEFINITIONS[themeId].defaultAccent
  const { r, g, b } = hexToRgb(safeAccent)
  const sourceColor = argbFromRgb(r, g, b)
  const dark = themeFromSourceColor(sourceColor, [{ name: 'custom-primary', value: sourceColor, blend: true }]).schemes.dark
  const usesDirectAccent = themeId === 'editorial'
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
  root.style.setProperty('--color-m3-secondary', themeId === 'editorial' ? '#72E6BE' : hexFromArgb(dark.secondary))
  root.style.setProperty('--color-m3-on-secondary', themeId === 'editorial' ? '#09251D' : hexFromArgb(dark.onSecondary))
  root.style.setProperty(
    '--color-m3-outline',
    themeId === 'editorial' ? '#918D87' : hexFromArgb(dark.outline),
  )
  root.style.setProperty(
    '--color-m3-on-surface',
    themeId === 'editorial' ? '#F5F2ED' : hexFromArgb(dark.onSurface),
  )
  root.style.setProperty(
    '--color-m3-on-surface-variant',
    themeId === 'editorial' ? '#BBB7B0' : hexFromArgb(dark.onSurfaceVariant),
  )
}

export function initializeTheme(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage, root: HTMLElement = document.documentElement) {
  migrateLegacyThemeStorage(storage)
  const themeId = getTheme(storage)
  const accent = getThemeAccent(themeId, storage)
  applyTheme(themeId, accent, root)
  return { themeId, accent }
}

export function saveTheme(themeId: ThemeId, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, root: HTMLElement = document.documentElement) {
  storage.setItem(THEME_STORAGE_KEY, themeId)
  applyTheme(themeId, getThemeAccent(themeId, storage), root)
}

export function saveThemeAccent(themeId: ThemeId, accent: string, storage: Pick<Storage, 'setItem'> = localStorage, root: HTMLElement = document.documentElement) {
  if (!isValidAccent(accent)) return false
  storage.setItem(ACCENT_STORAGE_KEYS[themeId], accent.toUpperCase())
  applyTheme(themeId, accent, root)
  return true
}

export function resetThemeAccent(themeId: ThemeId, storage: Pick<Storage, 'removeItem'> = localStorage, root: HTMLElement = document.documentElement) {
  storage.removeItem(ACCENT_STORAGE_KEYS[themeId])
  const accent = THEME_DEFINITIONS[themeId].defaultAccent
  applyTheme(themeId, accent, root)
  return accent
}
