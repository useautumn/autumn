import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
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

// Overwrites the URL keys in every managed .env.local so the bundled vite app
// (and server) talk to the sparq hostname instead of portless.
export function writeSparqUrlsToEnvFiles(urls: SparqUrls): void {
	const targets: Array<{ rel: string; keys: Record<string, string> }> = [
		{
			rel: "server/.env.local",
			keys: {
				BETTER_AUTH_URL: urls.apiUrl,
				CLIENT_URL: urls.viteUrl,
				STRIPE_WEBHOOK_URL: urls.apiUrl,
				AUTUMN_TEST_VITE_URL: urls.viteUrl,
			},
		},
		{
			rel: "vite/.env.local",
			keys: { VITE_BACKEND_URL: urls.apiUrl, VITE_FRONTEND_URL: urls.viteUrl },
		},
		{
			rel: "apps/checkout/.env.local",
			keys: { VITE_BACKEND_URL: urls.apiUrl },
		},
	];
	for (const { rel, keys } of targets) {
		const abs = join(PROJECT_ROOT, rel);
		// Skip if the workspace dir doesn't exist (defensive against partial checkouts).
		if (!existsSync(dirname(abs))) continue;
		const existing = existsSync(abs) ? readFileSync(abs, "utf-8") : null;
		writeFileSync(abs, mergeEnvFile(existing, keys));
	}
	log(`wrote sparq URLs into ${targets.length} .env.local file(s)`);
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
