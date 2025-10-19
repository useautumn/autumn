# Basic rules
- Never run a "dev" or "build" command, chances are I'm already running it in the background. Just ask me to check for updates or whatever you need
- Never ever ever write a "TO DO" comment. If you've been told to do something, DO IT. Don't stop halfway. Never give up and just leave a "to do" comment and say - "haha heres working code :)" - that is unacceptible. Always finish your task, no matter how many iterations you need to perform.
- DO NOT alter .gitignore
- JS Doc comments should be SHORT and SWEET. Don't need examples unless ABSOLUTELY necessary

# Linting and Codebase rules
- You can access the biome linter by running `npx biome check <folder or file path>`. Always specify a folder path, as the codebase is quite large and you will get out of scope errors that you are not burdened to correct. If you would like to let biome automatically fix as much as it can, use  `npx biome check --write <folder or file path>`

- Note, biome does not perform typechecking. In which case you need to, you may run `tsc --noEmit --skipLibCheck <folder or file path>`

- This codebase uses Bun as its preferred package manager and Node runtime.

- **ALWAYS import from `zod/v4`**, not from `zod` directly. Example: `import { z } from "zod/v4";`

- Always prefer foo({ bar }) over foo(bar) method signatures - no matter if we are using only one argument or not, object as param are always better, as in the future when wanting to change the order of parameters, or add new ones - its easier.

- When creating "hooks" folders, don't nest them under "components"

- Functions (unless there's a very good reason) should always take in objects as arguments. Object params are named and easy to understand.

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

# Figma MCP guidance
- When you are using the Figma MCP server, you **must** follow our design system. Below is an example implementation of CVA with out design system

## File Naming
DON'T name files one word (like index.ts, model.ts, etc.). Give proper indication in the filename to which resource it's targeting. For example, a utility file for organizations should be named orgUtils.ts. This is because it's easier to search for files like this. That being said, the filename shouldn't be overly long (less than three words is ideal)

