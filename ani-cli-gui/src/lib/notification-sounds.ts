export type NotificationSoundMode = 'off' | 'important' | 'all'
export type NotificationSoundPreset = 'soft' | 'crystal' | 'arcade'
export type NotificationSoundLevel = 'silent' | 'important' | 'normal'

export const NOTIFICATION_SOUND_MODE_KEY = 'notifications.soundMode'
export const NOTIFICATION_SOUND_PRESET_KEY = 'notifications.soundPreset'

const DEFAULT_MODE: NotificationSoundMode = 'important'
const DEFAULT_PRESET: NotificationSoundPreset = 'soft'

interface ToneStep {
  frequency: number
  start: number
  duration: number
  type: OscillatorType
  volume: number
}

const PRESETS: Record<NotificationSoundPreset, ToneStep[]> = {
  soft: [
    { frequency: 659.25, start: 0, duration: 0.09, type: 'sine', volume: 0.035 },
    { frequency: 880, start: 0.08, duration: 0.12, type: 'sine', volume: 0.028 },
  ],
  crystal: [
    { frequency: 1046.5, start: 0, duration: 0.07, type: 'triangle', volume: 0.04 },
    { frequency: 1318.51, start: 0.06, duration: 0.11, type: 'triangle', volume: 0.028 },
  ],
  arcade: [
    { frequency: 783.99, start: 0, duration: 0.055, type: 'square', volume: 0.022 },
    { frequency: 987.77, start: 0.065, duration: 0.07, type: 'square', volume: 0.02 },
  ],
}

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext
}

function storedValue<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return values.includes(value as T) ? value as T : fallback
  } catch {
    return fallback
  }
}

export function getNotificationSoundMode(): NotificationSoundMode {
  return storedValue(NOTIFICATION_SOUND_MODE_KEY, ['off', 'important', 'all'] as const, DEFAULT_MODE)
}

export function setNotificationSoundMode(mode: NotificationSoundMode) {
  localStorage.setItem(NOTIFICATION_SOUND_MODE_KEY, mode)
}

export function getNotificationSoundPreset(): NotificationSoundPreset {
  return storedValue(NOTIFICATION_SOUND_PRESET_KEY, ['soft', 'crystal', 'arcade'] as const, DEFAULT_PRESET)
}

export function setNotificationSoundPreset(preset: NotificationSoundPreset) {
  localStorage.setItem(NOTIFICATION_SOUND_PRESET_KEY, preset)
}

export function shouldPlayNotificationSound(level: NotificationSoundLevel, mode = getNotificationSoundMode()) {
  if (level === 'silent' || mode === 'off') return false
  if (level === 'important') return mode === 'important' || mode === 'all'
  return mode === 'all'
}

export function playNotificationSound(preset = getNotificationSoundPreset()) {
  try {
    const AudioContextClass = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const masterGain = context.createGain()
    masterGain.gain.setValueAtTime(1, context.currentTime)
    masterGain.connect(context.destination)

    for (const step of PRESETS[preset]) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + step.start
      const end = start + step.duration

      oscillator.type = step.type
      oscillator.frequency.setValueAtTime(step.frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(step.volume, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain)
      gain.connect(masterGain)
      oscillator.start(start)
      oscillator.stop(end + 0.01)
    }

    window.setTimeout(() => void context.close().catch(() => {}), 420)
  } catch {
    // Autoplay policy or output-device failures should never block notifications.
  }
}
