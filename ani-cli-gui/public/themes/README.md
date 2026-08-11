# Custom Themes

This directory contains theme-specific CSS files that can be dynamically loaded based on the active theme.

## How to Create a Custom Theme

### 1. Create a CSS File

Create a new CSS file in this directory with your theme name:
```
public/themes/my-theme.css
```

### 2. Add Theme Definition

Edit `src/lib/theme.ts` to add your theme:

```typescript
export type ThemeId = 'editorial' | 'my-theme'

export const THEME_DEFINITIONS: Record<ThemeId, ThemeDefinition> = {
  editorial: { id: 'editorial', defaultAccent: '#FF5338', cssPath: '/themes/editorial.css' },
  'my-theme': { id: 'my-theme', defaultAccent: '#YOUR_ACCENT_COLOR', cssPath: '/themes/my-theme.css' },
}
```

### 3. Update Type Definition

Add your theme to the `ThemeId` type:
```typescript
export type ThemeId = 'editorial' | 'my-theme'
```

### 4. Add Storage Key

Add a storage key for your theme's accent:
```typescript
const ACCENT_STORAGE_KEYS: Record<ThemeId, string> = {
  editorial: 'theme.primary.editorial',
  'my-theme': 'theme.primary.my-theme',
}
```

### 5. Customize CSS

In your CSS file, you can override any CSS variables or add custom styles:

```css
:root {
  /* Custom border radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  
  /* Custom spacing */
  --spacing-md: 16px;
  --spacing-lg: 24px;
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
