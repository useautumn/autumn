import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./paths.ts";

export type Env = "dev" | "staging" | "prod";

/**
 * If `bun dw` has enabled this worktree, `server/.env.local` exists and
 * contains the worktree-specific DATABASE_URL pointing at its isolated DB.
 * Detect that file and load DATABASE_URL from it so `bun db` operations
 * affect the worktree's DB instead of the shared dev DB.
 *
 * Returns true if we loaded a worktree DATABASE_URL (caller should skip
 * the infisical wrap), false otherwise.
 */
export function loadWorktreeEnvLocal(): boolean {
	const envLocalPath = resolve(REPO_ROOT, "server/.env.local");
	if (!existsSync(envLocalPath)) return false;

	const contents = readFileSync(envLocalPath, "utf-8");
	const match = contents.match(/^DATABASE_URL=(.+)$/m);
	if (!match) return false;

	const databaseUrl = match[1].trim();
	if (!databaseUrl) return false;

	process.env.DATABASE_URL = databaseUrl;
	console.log(`[db] using DATABASE_URL from server/.env.local (worktree)`);
	return true;
}

const VALID_ENVS: readonly Env[] = ["dev", "staging", "prod"] as const;

export function parseEnv(argv: readonly string[]): Env {
	for (const arg of argv) {
		if (arg.startsWith("--env=")) {
			const value = arg.slice("--env=".length);
			if (!VALID_ENVS.includes(value as Env)) {
				console.error(
					`invalid --env=${value}, must be one of: ${VALID_ENVS.join(", ")}`,
				);
				process.exit(2);
			}
			return value as Env;
		}
	}
	return "dev";
}

const ENV_FILE: Record<Env, string> = {
	dev: ".env",
	staging: ".env.staging",
	prod: ".env.prod",
};

/**
 * If not already inside an infisical-wrapped context, re-exec this process
 * wrapped in `infisical run --env=<env> --recursive --` so DATABASE_URL is
 * injected from the right secret environment. Returns true if we re-exec'd
 * (caller should exit); false if already wrapped (caller should proceed).
 */
export async function wrapInInfisical(env: Env): Promise<boolean> {
	if (process.env.AUTUMN_DB_WRAPPED === "1") return false;

	if (process.env.AUTUMN_DB_DIRECT === "1") {
		if (!process.env.DATABASE_URL) {
			console.error(
				"AUTUMN_DB_DIRECT=1 but DATABASE_URL not set — caller must inject the URL when bypassing infisical",
			);
			process.exit(1);
		}
		return false;
	}

	// If a worktree is active (bun dw enable wrote server/.env.local), prefer
	// its DATABASE_URL over the infisical-injected one so `bun db` affects
	// the worktree's isolated DB.
	if (loadWorktreeEnvLocal()) return false;

	const args = [
		"run",
		`--env=${env}`,
		"--recursive",
		"--",
		"bun",
		...process.argv.slice(1),
	];

	const child = spawn("infisical", args, {
		stdio: "inherit",
		env: {
			...process.env,
			AUTUMN_DB_WRAPPED: "1",
			ENV_FILE: ENV_FILE[env],
		},
	});

	const code: number = await new Promise((resolve) => {
		child.on("close", (c) => resolve(c ?? 1));
		child.on("error", (err) => {
			console.error(`failed to spawn infisical: ${err.message}`);
			resolve(1);
		});
	});
	process.exit(code);
}

export function targetHost(databaseUrl: string | undefined): string {
	if (!databaseUrl) return "<DATABASE_URL not set>";
	try {
		const url = new URL(databaseUrl);
		return url.host;
	} catch {
		return "<unparseable DATABASE_URL>";
	}
}
