export const SHOWCASE_PRELOAD_SWITCH = '--aniplay-showcase-enabled'

export function shouldEnableShowcaseDemo(isPackaged: boolean, argv: readonly string[]): boolean {
  return !isPackaged && argv.includes('--demo-mode')
}
