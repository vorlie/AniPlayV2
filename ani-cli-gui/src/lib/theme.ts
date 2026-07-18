import { argbFromRgb, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities'

export type ThemeId = 'modern' | 'classic-ember'

export interface ThemeDefinition {
  id: ThemeId
  defaultAccent: string
}

export const THEME_STORAGE_KEY = 'theme.id'
export const LEGACY_ACCENT_STORAGE_KEY = 'theme.primary'

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  modern: { id: 'modern', defaultAccent: '#D0BCFF' },
  'classic-ember': { id: 'classic-ember', defaultAccent: '#F15A37' },
}

const ACCENT_STORAGE_KEYS: Record<ThemeId, string> = {
  modern: 'theme.primary.modern',
  'classic-ember': 'theme.primary.classic-ember',
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
  return value === 'modern' || value === 'classic-ember'
}

export function isValidAccent(value: string | null): value is string {
  return value !== null && HEX_COLOR_PATTERN.test(value)
}

export function getTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeId {
  const saved = storage.getItem(THEME_STORAGE_KEY)
  return isThemeId(saved) ? saved : 'modern'
}

export function getThemeAccent(themeId: ThemeId, storage: Pick<Storage, 'getItem'> = localStorage): string {
  const saved = storage.getItem(ACCENT_STORAGE_KEYS[themeId])
  return isValidAccent(saved) ? saved.toUpperCase() : THEME_DEFINITIONS[themeId].defaultAccent
}

export function migrateLegacyThemeStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
  const legacyAccent = storage.getItem(LEGACY_ACCENT_STORAGE_KEY)
  const modernAccent = storage.getItem(ACCENT_STORAGE_KEYS.modern)
  if (!modernAccent && isValidAccent(legacyAccent)) {
    storage.setItem(ACCENT_STORAGE_KEYS.modern, legacyAccent.toUpperCase())
  }
  if (legacyAccent !== null) storage.removeItem(LEGACY_ACCENT_STORAGE_KEY)
}

export function applyTheme(themeId: ThemeId, accent: string, root: HTMLElement = document.documentElement) {
  const safeAccent = isValidAccent(accent) ? accent : THEME_DEFINITIONS[themeId].defaultAccent
  const { r, g, b } = hexToRgb(safeAccent)
  const sourceColor = argbFromRgb(r, g, b)
  const dark = themeFromSourceColor(sourceColor, [{ name: 'custom-primary', value: sourceColor, blend: true }]).schemes.dark
  const primary = themeId === 'classic-ember' ? safeAccent.toUpperCase() : hexFromArgb(dark.primary)

  root.dataset.theme = themeId
  if (themeId === 'modern') {
    root.style.setProperty('--color-m3-surface', hexFromArgb(dark.surface))
    root.style.setProperty('--color-m3-surface-container', hexFromArgb(dark.secondaryContainer))
    root.style.setProperty('--color-m3-surface-variant', hexFromArgb(dark.surfaceVariant))
  } else {
    root.style.setProperty('--color-m3-surface', '#0B0B0C')
    root.style.setProperty('--color-m3-surface-container', '#1A1A1C')
    root.style.setProperty('--color-m3-surface-variant', '#303034')
  }
  root.style.setProperty('--color-m3-primary', primary)
  root.style.setProperty('--color-m3-on-primary', themeId === 'classic-ember' ? contrastTextFor({ r, g, b }) : hexFromArgb(dark.onPrimary))
  root.style.setProperty('--color-m3-primary-container', hexFromArgb(dark.primaryContainer))
  root.style.setProperty('--color-m3-on-primary-container', hexFromArgb(dark.onPrimaryContainer))
  root.style.setProperty('--color-m3-secondary', hexFromArgb(dark.secondary))
  root.style.setProperty('--color-m3-on-secondary', hexFromArgb(dark.onSecondary))
  root.style.setProperty('--color-m3-outline', themeId === 'classic-ember' ? '#8E8E93' : hexFromArgb(dark.outline))
  root.style.setProperty('--color-m3-on-surface', themeId === 'classic-ember' ? '#F4F4F5' : hexFromArgb(dark.onSurface))
  root.style.setProperty('--color-m3-on-surface-variant', themeId === 'classic-ember' ? '#B8B8BE' : hexFromArgb(dark.onSurfaceVariant))
  root.style.setProperty('--custom-display-name-styles-main-color', primary)
  root.style.setProperty('--custom-display-name-styles-light-1-color', rgbToHex(r + 28, g + 28, b + 28))
  root.style.setProperty('--custom-display-name-styles-dark-1-color', rgbToHex(r - 48, g - 48, b - 48))
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
