import { describe, expect, it } from 'vitest'
import { shouldEnableShowcaseDemo } from './demo-mode'

describe('showcase demo mode', () => {
  it('requires the explicit development flag', () => {
    expect(shouldEnableShowcaseDemo(false, ['electron', '.', '--demo-mode'])).toBe(true)
    expect(shouldEnableShowcaseDemo(false, ['electron', '.'])).toBe(false)
  })

  it('can never activate in a packaged application', () => {
    expect(shouldEnableShowcaseDemo(true, ['AniPlay.exe', '--demo-mode'])).toBe(false)
  })
})
