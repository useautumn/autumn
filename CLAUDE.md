# Basic rules

- Never run a "dev" or "build" command, chances are I'm already running it in the background. Just ask me to check for updates or whatever you need

# Linting and Codebase rules

- You can access the biome linter by running `npx biome check <folder path>`. Always specify a folder path, as the codebase is quite large and you will get out of scope errors that you are not burdened to correct. If you would like to let biome automatically fix as much as it can, use  `npx biome check --write <folder path>`

- This codebase uses Bun as its preferred package manager and Node runtime.