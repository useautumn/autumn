# Basic rules
- Never run a "dev" or "build" command, chances are I'm already running it in the background. Just ask me to check for updates or whatever you need
- Never ever ever write a "TO DO" comment. If you've been told to do something, DO IT. Don't stop halfway. Never give up and just leave a "to do" comment and say - "haha heres working code :)" - that is unacceptible. Always finish your task, no matter how many iterations you need to perform.
- DO NOT alter .gitignore
- JS Doc comments should be SHORT and SWEET. Don't need examples unless ABSOLUTELY necessary
- When using db schemas in Drizzle, import them from '@autumn/shared', and don't do schemas.

# Testing
- When writing tests, ALWAYS read:
  1. `server/tests/_guides/general-test-guide.md` - Common patterns, client initialization, public keys
  2. Case-specific guide (e.g., `server/tests/_guides/check-endpoint-tests.md` for `/check` tests)

# Linting and Codebase rules
- You can access the biome linter by running `bunx biome check <folder or file path>`. Always specify a folder path, as the codebase is quite large and you will get out of scope errors that you are not burdened to correct. If you would like to let biome automatically fix as much as it can, use  `bunx biome check --write <folder or file path>`

- Note, biome does not perform typechecking. In which case you need to, you may run `tsc --noEmit --skipLibCheck <folder or file path>`

- This codebase uses Bun as its preferred package manager and Node runtime.

- **ALWAYS import from `zod/v4`**, not from `zod` directly. Example: `import { z } from "zod/v4";`

- Always prefer foo({ bar }) over foo(bar) method signatures - no matter if we are using only one argument or not, object as param are always better, as in the future when wanting to change the order of parameters, or add new ones - its easier.

- When creating "hooks" folders, don't nest them under "components"

- Functions (unless there's a very good reason) should always take in objects as arguments. Object params are named and easy to understand.

- This codebase uses Bun for all of its operations in `/server`, `/vite` and `/shared`. It uses Bun for the package management, Bun for the workspace management and Bun for the runtime. Prefer Bun over PNPM. If you ever want to trace a package dependency tree, run `bun why <package name>` which will tell you why a certain package was installed and by who.
- Prefer Guard clauses "if(!admin) return;" over explicity "if(admin) do X;" Early returns are better

- Do not run "npx tsc" - run "tsc" instead as it is installed globally.

- **ALWAYS use `.meta()` for zod-openapi schema registration**, NOT `.openapi()`. Example: `ApiProductSchema.meta({ id: "Product" })`
## Error Handling in API Routes
- NEVER use `c.json({ message: "...", code: "..." }, statusCode)` pattern for input validation or expected errors in Hono routes
- ALWAYS throw `RecaseError` from `@autumn/shared` for all validation errors, not found errors, forbidden errors, etc.
- For internal/unexpected errors (like missing configuration, database errors, etc.), throw `InternalError` from `@autumn/shared`
- The onError middleware automatically converts these errors to appropriate HTTP responses
- Examples:
  ```typescript
  // ❌ BAD - Don't do this
  if (!org) {
    return c.json({ message: "Org not found", code: "not_found" }, 404);
  }

  // ✅ GOOD - Validation/expected errors use RecaseError
  if (!org) {
    throw new RecaseError({
      message: "Org not found",
      code: ErrCode.NotFound,
      statusCode: 404,
    });
  }

  // ✅ GOOD - Internal/unexpected errors use InternalError
  if (!upstash) {
    throw new InternalError({
      message: "Upstash not configured",
      code: "upstash_not_configured",
    });
  }
  ```

## Bad example
/ root
-> components
|-> hooks
## Good example
/ root
-> components
-> hooks

- Functions (unless there's a very good reason) should always take in objects as arguments. Object params are named and easy to understand.

- This codebase uses Bun for all of its operations in `/server`, `/vite` and `/shared`. It uses Bun for the package management, Bun for the workspace management and Bun for the runtime. Prefer Bun over PNPM. If you ever want to trace a package dependency tree, run `bun why <package name>` which will tell you why a certain package was installed and by who.

- Prefer Guard clauses "if(!admin) return;" over explicity "if(admin) do X;" Early returns are better

- Do not run "npx tsc" - run "tsc" instead as it is installed globally.

# Figma MCP guidance
- When you are using the Figma MCP server, you **must** follow our design system. Below is an example implementation of CVA with out design system

## File Naming
DON'T name files one word (like index.ts, model.ts, etc.). Give proper indication in the filename to which resource it's targeting. For example, a utility file for organizations should be named orgUtils.ts. This is because it's easier to search for files like this. That being said, the filename shouldn't be overly long (less than three words is ideal)

# Vite
## Components
- Always use v2 components from `@/components/v2/` (buttons, inputs, dialogs, sheets, selects, etc.) for new features. Old components in `@/components/ui/` are deprecated.

## Sheets
- Use `Sheet.tsx` for overlay sheets (modal-style with backdrop). Use `SheetHeader`, `SheetFooter`, `SheetSection` from `SharedSheetComponents.tsx` for consistent styling.
- `InlineSheet.tsx` provides `SheetContainer` for inline sheets (embedded in page layout). It re-exports shared components for backwards compatibility.
- Both sheet types support the same header/footer/section components, ensuring consistent UI patterns across overlay and inline implementations.

## Styling
- DO NOT hardcode styles when possible. Always try to reuse existing Tailwind classes or component patterns from similar components in the codebase.
- When adding interactive elements (hover, focus, active states), look for existing patterns in similar components and reuse those class combinations.
- Consistency is key - if a pattern exists, use it rather than creating a new one.

## Form Elements
- When creating form input elements (inputs, selects, textareas, etc.) in the vite folder, ALWAYS read `vite/FORM_DESIGN_GUIDELINES.md` first to understand the atomic CSS class system.
