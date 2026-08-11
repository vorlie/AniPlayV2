# Custom Themes

This directory contains theme-specific CSS files that can be dynamically loaded based on the active theme.

## Built-in Themes

### System24 Terminal
A terminal/IRC-inspired theme based on the System24 Discord theme reference, featuring monospace typography, thin panel borders, and a dense layout.

- **File**: `system24.css`
- **Default Accent**: `#FF6B9D` (Purple/Pink)
- **Characteristics**:
  - Monospace typography throughout (JetBrains Mono, IBM Plex Mono, Fira Code)
  - Thin 1px panel borders defining all UI regions
  - Near-black monochrome palette (`#080808`, `#0a0a0a`)
  - Purple/pink accent color matching the reference
  - Border-label aesthetic for section headers
  - Square/minimally rounded controls (0px-2px radius)
  - Strong geometric panel structure
  - Dense information layout with compact spacing
  - Terminal/IRC interface feeling
  - Subtle scanline effect on main content
  - Low-contrast secondary text hierarchy
  - Retro desktop aesthetic

### Editorial
Ink-black surfaces, print-inspired type, and vivid editorial accents.

- **File**: `editorial.css`
- **Default Accent**: `#FF5338` (Orange-red)
- **Characteristics**:
  - Editorial magazine aesthetic
  - Print-inspired typography
  - Vivid accent colors
  - Larger border radius values

## How to Create a Custom Theme

### 1. Create a CSS File

Create a new CSS file in this directory with your theme name:
```
public/themes/my-theme.css
```

### 2. Add Theme Definition

Edit `src/lib/theme.ts` to add your theme:

```typescript
export type ThemeId = 'editorial' | 'system24' | 'my-theme'

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  editorial: { id: 'editorial', defaultAccent: '#FF5338', cssPath: '/themes/editorial.css' },
  system24: { id: 'system24', defaultAccent: '#FF6B9D', cssPath: '/themes/system24.css' },
  'my-theme': { id: 'my-theme', defaultAccent: '#YOUR_ACCENT_COLOR', cssPath: '/themes/my-theme.css' },
}
```

### 3. Update Type Definition

Add your theme to the `ThemeId` type:
```typescript
export type ThemeId = 'editorial' | 'system24' | 'my-theme'
```

### 4. Add Storage Key

Add a storage key for your theme's accent:
```typescript
const ACCENT_STORAGE_KEYS: Record<ThemeId, string> = {
  editorial: 'theme.primary.editorial',
  system24: 'theme.primary.system24',
  'my-theme': 'theme.primary.my-theme',
}
```

### 5. Add Translations

Add your theme name and description to `src/i18n.ts` in both English and Polish:

```typescript
presets: {
  editorial: {
    name: 'AniPlay Editorial',
    description: 'Ink-black surfaces, print-inspired type, and vivid editorial accents.',
  },
  system24: {
    name: 'System24 Terminal',
    description: 'Monospace typography, thin panel borders, dense layout, and terminal/IRC aesthetic.',
  },
  'my-theme': {
    name: 'My Theme',
    description: 'Your theme description here.',
  },
}
```

### 6. Customize CSS

In your CSS file, you can override any CSS variables or add custom styles:

```css
:root {
  /* Custom border radius - square/terminal style */
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 2px;

  /* Custom spacing - compact */
  --spacing-md: 8px;
  --spacing-lg: 12px;
}

/* Custom component styles */
.home-collection {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
```

## Available CSS Variables

The following CSS variables are available for customization:

### Colors
- `--background` - Main background color
- `--background-surface` - Surface/panel background
- `--background-surface-hover` - Hover state
- `--border` - Border color
- `--border-subtle` - Subtle border
- `--text` - Primary text
- `--text-secondary` - Secondary text
- `--text-muted` - Muted text
- `--text-dim` - Dimmed text
- `--accent` - Accent color (dynamic)
- `--accent-dim` - Dimmed accent
- `--accent-dimmer` - Even more dimmed accent
- `--accent-hover` - Hover accent
- `--success` - Success color
- `--error` - Error color
- `--warning` - Warning color

### Spacing
- `--spacing-xs` - Extra small (4px)
- `--spacing-sm` - Small (8px)
- `--spacing-md` - Medium (12px)
- `--spacing-lg` - Large (16px)
- `--spacing-xl` - Extra large (24px)

### Border Radius
- `--radius-sm` - Small radius (6px)
- `--radius-md` - Medium radius (8px)
- `--radius-lg` - Large radius (12px)
- `--radius-xl` - Extra large radius (16px)

### Typography
- `--font-family` - Font family
- `--font-size-xs` - Extra small text
- `--font-size-sm` - Small text
- `--font-size-md` - Medium text
- `--font-size-lg` - Large text
- `--font-size-xl` - Extra large text

### Shadows
- `--shadow-sm` - Small shadow
- `--shadow-md` - Medium shadow
- `--shadow-lg` - Large shadow

### Transitions
- `--transition-fast` - Fast transition (100ms)
- `--transition-normal` - Normal transition (140ms)
- `--transition-slow` - Slow transition (200ms)

## Dynamic Loading

Theme CSS files are automatically:
- Loaded when the theme is activated
- Unloaded when switching to a different theme
- Managed by the `themeCss.ts` utility

No manual cleanup is required when switching themes.
