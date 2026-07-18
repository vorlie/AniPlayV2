import { describe, expect, it, vi } from 'vitest'

vi.mock('@material/material-color-utilities', () => ({
  argbFromRgb: (r: number, g: number, b: number) => (r << 16) | (g << 8) | b,
  hexFromArgb: () => '#AABBCC',
  themeFromSourceColor: () => ({
    schemes: {
      dark: {
        surface: 0,
        secondaryContainer: 0,
        surfaceVariant: 0,
        primary: 0,
        onPrimary: 0,
        primaryContainer: 0,
        onPrimaryContainer: 0,
        secondary: 0,
        onSecondary: 0,
        outline: 0,
        onSurface: 0,
        onSurfaceVariant: 0,
      },
    },
  }),
}))
import {
  getTheme,
  getThemeAccent,
  initializeTheme,
  LEGACY_ACCENT_STORAGE_KEY,
  migrateLegacyThemeStorage,
  resetThemeAccent,
  saveTheme,
  saveThemeAccent,
  THEME_DEFINITIONS,
  THEME_STORAGE_KEY,
} from './theme'

class MemoryStorage {
  private values = new Map<string, string>()

  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value))
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

function fakeRoot() {
  const properties = new Map<string, string>()
  return {
    root: {
      dataset: {},
      style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    } as unknown as HTMLElement,
    properties,
  }
}

describe('theme preferences', () => {
  it('falls back safely for invalid stored theme and accent values', () => {
    const storage = new MemoryStorage({
      [THEME_STORAGE_KEY]: 'unknown',
      'theme.primary.modern': 'purple',
    })

    expect(getTheme(storage)).toBe('modern')
    expect(getThemeAccent('modern', storage)).toBe(THEME_DEFINITIONS.modern.defaultAccent)
  })

  it('migrates the legacy accent to Modern without overwriting a current value', () => {
    const legacyOnly = new MemoryStorage({ [LEGACY_ACCENT_STORAGE_KEY]: '#aabbcc' })
    migrateLegacyThemeStorage(legacyOnly)
    expect(legacyOnly.getItem('theme.primary.modern')).toBe('#AABBCC')
    expect(legacyOnly.getItem(LEGACY_ACCENT_STORAGE_KEY)).toBeNull()

    const alreadyMigrated = new MemoryStorage({
      [LEGACY_ACCENT_STORAGE_KEY]: '#aabbcc',
      'theme.primary.modern': '#112233',
    })
    migrateLegacyThemeStorage(alreadyMigrated)
    expect(alreadyMigrated.getItem('theme.primary.modern')).toBe('#112233')
    expect(alreadyMigrated.getItem(LEGACY_ACCENT_STORAGE_KEY)).toBeNull()
  })

  it('keeps accent values independent for each preset and resets only the active one', () => {
    const storage = new MemoryStorage()
    const { root } = fakeRoot()

    expect(saveThemeAccent('modern', '#123456', storage, root)).toBe(true)
    expect(saveThemeAccent('classic-ember', '#abcdef', storage, root)).toBe(true)
    expect(saveThemeAccent('classic-ember', 'invalid', storage, root)).toBe(false)
    expect(getThemeAccent('modern', storage)).toBe('#123456')
    expect(getThemeAccent('classic-ember', storage)).toBe('#ABCDEF')

    expect(resetThemeAccent('classic-ember', storage, root)).toBe(THEME_DEFINITIONS['classic-ember'].defaultAccent)
    expect(getThemeAccent('classic-ember', storage)).toBe(THEME_DEFINITIONS['classic-ember'].defaultAccent)
    expect(getThemeAccent('modern', storage)).toBe('#123456')
  })

  it('synchronously applies the selected preset during initialization', () => {
    const storage = new MemoryStorage({
      [THEME_STORAGE_KEY]: 'classic-ember',
      'theme.primary.classic-ember': '#e45a35',
    })
    const { root, properties } = fakeRoot()

    expect(initializeTheme(storage, root)).toEqual({ themeId: 'classic-ember', accent: '#E45A35' })
    expect(root.dataset.theme).toBe('classic-ember')
    expect(properties.get('--color-m3-surface')).toBe('#0B0B0C')
    expect(properties.get('--color-m3-primary')).toBe('#E45A35')
  })

  it('switches presets using the accent saved for the destination preset', () => {
    const storage = new MemoryStorage({ 'theme.primary.classic-ember': '#d04b2f' })
    const { root, properties } = fakeRoot()

    saveTheme('classic-ember', storage, root)
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('classic-ember')
    expect(root.dataset.theme).toBe('classic-ember')
    expect(properties.get('--color-m3-primary')).toBe('#D04B2F')
  })
})
