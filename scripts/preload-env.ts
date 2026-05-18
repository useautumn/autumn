// Preload script - runs BEFORE main script imports are evaluated
// This allows local .env to override Infisical secrets.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "@server/utils/envUtils.js";

loadLocalEnv();

// Worktree-aware: `bun dw` writes per-worktree `.env.local` files to each
// workspace dir. infisical run + server/.env stop short of these, so things
// like AUTUMN_TEST_BASE_URL and DATABASE_URL never get the worktree value.
// Loading here covers `bun t`, `bun cm`, `bun setup-test`, and any direct
// `bun test` invocation from the repo root. Missing files = no-op (canonical
// repo has none of these).
const __preloadRoot = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"..",
);
for (const rel of [
	"server/.env.local",
	"vite/.env.local",
	"apps/checkout/.env.local",
]) {
	const abs = join(__preloadRoot, rel);
	if (!existsSync(abs)) continue;
	const contents = readFileSync(abs, "utf-8");
	for (const line of contents.split(/\r?\n/)) {
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!m) continue;
		// Worktree-local overrides win over infisical + server/.env.
		process.env[m[1]] = m[2];
	}
}
