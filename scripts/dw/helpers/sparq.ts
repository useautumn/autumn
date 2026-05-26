import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { userInfo } from "node:os";
import { sh, log } from "./shell.ts";
import { PROJECT_ROOT, SPARQ_DOMAIN, SPARQ_CONFIG_DIR } from "../constants.ts";
import { mergeEnvFile } from "./env-files.ts";
import type { RegistryEntry } from "../types.ts";

export type SparqUrls = {
	apiUrl: string;
	viteUrl: string;
	seed: string;
};

function isSparqInstalled(): boolean {
	return sh("sparq", ["--version"]).code === 0;
}

function seedFor(worktreeNum: number): string {
	// USER may be unset under some launchd / orchestrator contexts; fall back to userInfo.
	const user = process.env.USER || userInfo().username || "anon";
	return `wt${worktreeNum}-${user}`;
}

function sparqConfigPath(cwd: string): string {
	return join(cwd, SPARQ_CONFIG_DIR, "config.json");
}

export function getSparqUrls(cwd: string, worktreeNum: number): SparqUrls | null {
	const configPath = sparqConfigPath(cwd);
	if (!existsSync(configPath)) return null;
	try {
		const cfg = JSON.parse(readFileSync(configPath, "utf-8")) as {
			routes?: { hostname: string; port: number }[];
		};
		const seed = seedFor(worktreeNum);
		const routes = cfg.routes ?? [];
		const api = routes.find((r) => r.hostname.startsWith(`${seed}-api.`));
		const web = routes.find((r) => r.hostname.startsWith(`${seed}-web.`));
		if (!api || !web) return null;
		return { apiUrl: `https://${api.hostname}`, viteUrl: `https://${web.hostname}`, seed };
	} catch {
		return null;
	}
}

export function writeSparqWebhookUrlToEnvFile(sparqApiUrl: string): void {
	const envPath = join(PROJECT_ROOT, "server", ".env.local");
	const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : null;
	const merged = mergeEnvFile(existing, { STRIPE_WEBHOOK_URL: sparqApiUrl });
	writeFileSync(envPath, merged);
	log(`set STRIPE_WEBHOOK_URL=${sparqApiUrl} in server/.env.local`);
}

// Idempotent: re-runs `sparq up --headless` with the same seed, which reuses
// the existing tunnel + DNS records on the Cloudflare side and just restarts
// the local cloudflared process.
export function ensureSparqTunnel(entry: RegistryEntry): SparqUrls | null {
	if (!isSparqInstalled()) {
		log("sparq not installed; skipping public tunnel (install with `npm i -g trysparq`)");
		return null;
	}
	const { worktreeNum, path: cwd } = entry;
	const offset = (worktreeNum - 1) * 100;
	const apiPort = 8080 + offset;
	const vitePort = 3000 + offset;
	const seed = seedFor(worktreeNum);

	const res = sh(
		"sparq",
		[
			"up",
			"--headless",
			"--domain", SPARQ_DOMAIN,
			"--seed", seed,
			"--route", `api:${apiPort}`,
			"--route", `web:${vitePort}`,
			"--json",
		],
		{ cwd },
	);
	if (res.code !== 0) {
		log(`sparq up failed (continuing without public tunnel): ${res.stderr || res.stdout}`);
		return null;
	}

	const urls = getSparqUrls(cwd, worktreeNum);
	if (urls) {
		log(`sparq: ${urls.apiUrl} → :${apiPort}, ${urls.viteUrl} → :${vitePort}`);
	}
	return urls;
}

// `sparq destroy` reads ./.sparq/config.json, so it must run with cwd=entry.path.
// It also expects an interactive confirmation; we pipe `y\n` to bypass.
export function destroySparqTunnel(entry: RegistryEntry): void {
	if (!isSparqInstalled()) return;
	const configPath = sparqConfigPath(entry.path);
	if (!existsSync(configPath)) return;

	const res = sh("sparq", ["destroy"], { cwd: entry.path, stdin: "y\n" });
	if (res.code !== 0) {
		log(`sparq destroy returned ${res.code} (continuing): ${res.stderr || res.stdout}`);
		return;
	}
	log(`sparq destroyed for worktree ${entry.worktreeNum}`);
}
