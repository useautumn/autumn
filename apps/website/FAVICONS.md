# Favicon System

This website uses environment-specific favicons to make it easy to distinguish between dev, staging, and production tabs in your browser.

## Current Configuration

- **Development** (`NODE_ENV=development`): Orange favicon (`favicon-dev.svg`)
- **Staging/Preview** (`VERCEL_ENV=preview`): Light purple favicon (`favicon-staging.svg`)
- **Production** (default): Original purple favicon (`favicon-prod.svg`)

## Available Designs

### Production (Default)
- `favicon-prod.svg` - Purple (#8838FF) background with white logo

### Development Options
- `favicon-dev.svg` - **Current**: Orange (#FF8800) background with white logo
- `favicon-dev-alt.svg` - Alternative: Bright orange (#FFA500) background with dark logo

### Staging Options
- `favicon-staging.svg` - **Current**: Light purple (#A855F7) background with white logo
- `favicon-staging-alt.svg` - Alternative: Purple gradient with white logo
- `favicon-staging-green.svg` - Alternative: Green (#10B981) background with white logo

## How It Works

The favicon is dynamically selected based on environment variables:

1. **Local Development**: Checks `NODE_ENV === "development"` → uses orange favicon
2. **Preview/Staging**: Checks `VERCEL_ENV === "preview"` → uses light purple/staging favicon
3. **Production**: Default fallback → uses original purple favicon

The logic is in `/lib/get-favicon.ts` and is used in `/app/layout.tsx` to set the metadata icons.

## Changing Designs

To switch to an alternative design:

1. Edit `/lib/get-favicon.ts`
2. Update the return values to point to your preferred `-alt` or alternative files
3. Restart your dev server

Example:
```typescript
if (process.env.NODE_ENV === "development") {
  return "/favicon-dev-alt.svg"; // Use alternative orange design
}
```

## Creating New Designs

All favicons are based on the Autumn logo at `/images/navbar/autumnicon.svg`. To create a new variant:

1. Copy one of the existing `favicon-*.svg` files
2. Change the `fill` color in the `<rect>` element (background)
3. Optionally adjust the logo path `fill` color (currently white)
4. Save with a descriptive name like `favicon-{environment}-{variant}.svg`

## Benefits

- **Quick Visual Identification**: Easily spot which environment you're working in
- **Prevent Mistakes**: Avoid accidentally testing in production
- **Better DevEx**: Similar to Vercel's approach shown in [this tweet](https://twitter.com/dferber90/status/1808891891234562048)
