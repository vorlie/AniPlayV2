/**
 * Dynamic CSS loader for theme-specific stylesheets
 * Supports both file-based CSS (for development) and content-based CSS (for ASAR packages)
 */

const loadedThemeStyles = new Map<string, HTMLStyleElement>();

/**
 * Loads theme CSS from content string (for ASAR packages)
 * @param themeId - The theme identifier
 * @param cssContent - CSS content as a string
 */
export function loadThemeCssFromContent(themeId: string, cssContent: string): void {
  // Remove existing style for this theme if any
  unloadThemeCss(themeId);

  const style = document.createElement('style');
  style.textContent = cssContent;
  style.dataset.theme = themeId;
  
  document.head.appendChild(style);
  loadedThemeStyles.set(themeId, style);
}

/**
 * Unloads a theme-specific CSS
 * @param themeId - The theme identifier
 */
export function unloadThemeCss(themeId: string): void {
  const element = loadedThemeStyles.get(themeId);
  if (element) {
    element.remove();
    loadedThemeStyles.delete(themeId);
  }
}

/**
 * Unloads all theme-specific CSS
 */
export function unloadAllThemeCss(): void {
  loadedThemeStyles.forEach((element) => element.remove());
  loadedThemeStyles.clear();
}

/**
 * Checks if a theme CSS is currently loaded
 * @param themeId - The theme identifier
 */
export function isThemeCssLoaded(themeId: string): boolean {
  return loadedThemeStyles.has(themeId);
}

/**
 * Gets the currently loaded theme IDs
 */
export function getLoadedThemeIds(): string[] {
  return Array.from(loadedThemeStyles.keys());
}

/**
 * Loads theme CSS from a file path (development use)
 * @param themeId - The theme identifier
 * @param cssPath - Path to the CSS file
 */
export function loadThemeCssFromFile(themeId: string, cssPath: string): void {
  // Remove existing style for this theme if any
  unloadThemeCss(themeId);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssPath;
  link.dataset.theme = themeId;
  
  document.head.appendChild(link);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadedThemeStyles.set(themeId, link as any);
}
