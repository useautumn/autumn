# @useautumn/ui

Autumn's React design system: Base UI components, Tailwind v4 tokens and styles.

```sh
bun add @useautumn/ui
```

Import the styles once from your global CSS. They register the tokens, variants and plugins, and tell Tailwind to scan the package:

```css
@import "tailwindcss";
@import "@useautumn/ui/styles.css";
```

Import components from the root or from their module path. Both tree-shake to the components you use:

```tsx
import { Button } from "@useautumn/ui";
import { Button } from "@useautumn/ui/components/ui/button";
```

`@useautumn/ui/ai-elements` and `@useautumn/ui/table` hold the AI chat and table components.

Requires React 19 and Tailwind CSS v4.
