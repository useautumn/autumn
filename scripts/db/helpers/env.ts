import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./paths.ts";

export type Env = "dev" | "staging" | "prod";

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
