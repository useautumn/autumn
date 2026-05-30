// Preload script - runs BEFORE main script imports are evaluated
// This allows local .env to override Infisical secrets.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "@server/utils/envUtils.js";

loadLocalEnv();

// Worktree-aware: `bun dw` writes per-worktree `.env.local` files to each
// workspace dir. PW_MODE=1 (set by `bun pw`) skips this so prod Infisical
// secrets aren't overridden by dev DB URLs.
if (process.env.PW_MODE !== "1") {
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
			process.env[m[1]] = m[2];
		}
	}
}
