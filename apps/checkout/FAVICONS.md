# Favicon System

This app uses environment-specific favicons to make it easy to distinguish between dev, staging, and production tabs in your browser.

## Current Configuration

- **Development** (localhost): Orange favicon (`favicon-dev.svg`)
- **Staging/Preview** (Vercel preview URLs): Light purple favicon (`favicon-staging.svg`)
- **Production** (production domain): Uses existing favicon (`autumn-logo-bg.png`) - **unchanged**

## Available Designs

### Production (Default)
- `autumn-logo-bg.png` - **Original production favicon** (unchanged)

### Development Options
- `favicon-dev.svg` - **Current**: Orange (#FF8800) background with white logo
- `favicon-dev-alt.svg` - Alternative: Bright orange (#FFA500) background with dark logo

### Staging Options
- `favicon-staging.svg` - **Current**: Light purple (#A855F7) background with white logo
- `favicon-staging-alt.svg` - Alternative: Purple gradient with white logo
- `favicon-staging-green.svg` - Alternative: Green (#10B981) background with white logo

## How It Works

The favicon is dynamically selected in `index.html` based on the hostname:

1. **Local Development**: Checks if hostname is `localhost` or `127.0.0.1` → uses orange favicon
2. **Preview/Staging**: Checks if hostname includes `vercel.app` (but not production domain) → uses light purple favicon
3. **Production**: Default fallback → uses original `autumn-logo-bg.png` (unchanged)

## Changing Designs

To switch to an alternative design:

1. Edit `index.html`
2. Update the `faviconPath` assignments to point to your preferred files

Example:
```javascript
if (isLocal) {
  faviconPath = '/favicon-dev-alt.svg'; // Use alternative orange design
}
```

## Creating New Designs

All favicons are based on the Autumn logo. To create a new variant:

1. Copy one of the existing `favicon-*.svg` files
2. Change the `fill` color in the `<rect>` element (background)
3. Optionally adjust the logo path `fill` color (currently white)
4. Save with a descriptive name like `favicon-{environment}-{variant}.svg`

## Benefits

- **Quick Visual Identification**: Easily spot which environment you're working in
- **Prevent Mistakes**: Avoid accidentally testing in production
- **Better DevEx**: Similar to Vercel's approach
- **Zero Breaking Changes**: Production favicon remains completely unchanged
