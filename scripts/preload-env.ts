// Preload script - runs BEFORE main script imports are evaluated
// This allows local .env to override Infisical secrets.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import {
	machineIdForBinding,
	readCapyBindingId,
} from "./capy/machineIdentity.ts";

loadLocalEnv();

// Worktree-aware: `bun dw` writes per-worktree `.env.local` files to each
// workspace dir. PW_MODE=1 (set by `bun pw`) skips this so prod Infisical
// secrets aren't overridden by dev DB URLs.
if (process.env.PW_MODE !== "1") {
	const __preloadRoot = resolve(
		fileURLToPath(new URL(".", import.meta.url)),
		"..",
	);
	const parseEnvFile = (rel: string) => {
		const abs = join(__preloadRoot, rel);
		if (!existsSync(abs)) return [];
		return readFileSync(abs, "utf-8")
			.split(/\r?\n/)
			.map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
			.filter((m): m is RegExpMatchArray => m !== null);
	};
	const envFiles = [
		"server/.env.local",
		"vite/.env.local",
		"apps/checkout/.env.local",
	].map(parseEnvFile);

	// On Capy, env files baked into a snapshot point at another machine's Neon branch.
	const bindingId = readCapyBindingId();
	const stampedMachineId = envFiles[0].find(
		(m) => m[1] === "CAPY_MACHINE_ID",
	)?.[2];
	const isForeignCapyEnv =
		bindingId !== undefined &&
		envFiles[0].length > 0 &&
		stampedMachineId !== machineIdForBinding(bindingId);
	if (isForeignCapyEnv) {
		console.warn(
			"[preload-env] ignoring .env.local files provisioned for another Capy machine; run `bun capy` to provision this one",
		);
	}

	for (const entries of isForeignCapyEnv ? [] : envFiles) {
		for (const m of entries) {
			// AUTUMN_DB_DIRECT callers inject DATABASE_URL for a DB that
			// .env.local may not describe yet (fresh branch provisioning).
			if (process.env.AUTUMN_DB_DIRECT === "1" && m[1] === "DATABASE_URL")
				continue;
			process.env[m[1]] = m[2];
		}
	}
}
