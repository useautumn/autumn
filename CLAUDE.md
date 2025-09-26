# Basic rules

- Never run a "dev" or "build" command, chances are I'm already running it in the background. Just ask me to check for updates or whatever you need

# Linting and Codebase rules

- You can access the biome linter by running `npx biome check <folder path>`. Always specify a folder path, as the codebase is quite large and you will get out of scope errors that you are not burdened to correct. If you would like to let biome automatically fix as much as it can, use  `npx biome check --write <folder path>`

- This codebase uses Bun as its preferred package manager and Node runtime.

- When creating "hooks" folders, don't nest them under "components"

## Bad example

/ root
-> components
|-> hooks

## Good example

/ root
-> components
-> hooks

# Figma MCP guidance

- When you are using the Figma MCP server, you **must** follow our design system. Below is an example implementation of CVA with out design system

```ts
const buttonVariants = cva(
	`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none 
  rounded-lg group/btn transition-none w-fit
  `,
	{
		variants: {
			variant: {
				// Custom
				primary: `btn-primary-shadow !text-primary-foreground bg-primary border border-transparent hover:bg-primary-btn-hover 
        active:bg-primary-btn-active active:border-primary-btn-border
				focus-visible:bg-primary-btn-active focus-visible:border-primary-btn-border
				`,

				secondary: `bg-input-background border border-[var(--color-input)] hover:border-primary hover:bg-hover-primary btn-secondary-shadow
				focus-visible:bg-active-primary focus-visible:border-primary 
				active:bg-active-primary active:border-primary
				`,

				skeleton: `text-body border border-transparent
				hover:bg-muted-hover
				focus-visible:bg-muted-active focus-visible:border-primary
				active:bg-muted-active active:border-primary`,

				muted: `bg-muted hover:bg-muted-hover border border-transparent
				focus-visible:bg-muted-active focus-visible:border-primary
				active:bg-muted-active active:border-primary
				`,

				destructive: `bg-destructive !text-destructive-foreground border-[1.2px] border-transparent
					hover:bg-destructive-hover btn-destructive-shadow
					focus-visible:border-destructive-border
					active:border-destructive-border
					`,
			},
			size: {
				default: "py-1 !px-[7px] text-body h-input",
				sm: "py-1 !px-[7px] text-tiny h-6",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "default",
		},
	},
);
```

- Refrain yourself from using "ghost" in favour of skeleton. If ever unsure, read "vite/src/components/v2/buttons/Button.tsx" for reference.