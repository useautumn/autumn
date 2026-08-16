import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorktreeAliases } from "../types.ts";
import { log, sh } from "./shell.ts";

const PORTLESS_PROXY_PORT_FILE = join(homedir(), ".portless", "proxy.port");

export function dragonflyPortFor(worktreeNum: number): number {
	return 6379 + (worktreeNum - 1) * 100;
}

export function elasticMqPortFor(worktreeNum: number): number {
	return 9324 + (worktreeNum - 1) * 100;
}

// DynamoDB Local's default port. Base 8000 never collides with the server's
// 8080 base: 8000 + k*100 and 8080 + k*100 stay 80 apart for every worktree.
export function dynamoDbPortFor(worktreeNum: number): number {
	return 8000 + (worktreeNum - 1) * 100;
}

export function serverPortFor(worktreeNum: number): number {
	return 8080 + (worktreeNum - 1) * 100;
}

// ngrok's local web API (the per-worktree container maps this to its :4040).
// dw polls it to read back the random tunnel URL ngrok assigned.
export function ngrokApiPortFor(worktreeNum: number): number {
	return 4040 + (worktreeNum - 1) * 100;
}

export function vitePortFor(worktreeNum: number): number {
	return 3000 + (worktreeNum - 1) * 100;
}

export function checkoutPortFor(worktreeNum: number): number {
	return 3001 + (worktreeNum - 1) * 100;
}

export function leafPortFor(worktreeNum: number): number {
	return 3099 + (worktreeNum - 1) * 100;
}

/** Front door for the one-hostname path proxy (ngrok / Cloud). */
export function devProxyPortFor(worktreeNum: number): number {
	return 3080 + (worktreeNum - 1) * 100;
}

/** Host-wide Google OAuth emulator (headless / Cloud; no portless). */
export const EMULATE_PORT = 4000;

// Base 4140 keeps the dashboard tunnel's web API clear of the api tunnel's
// 4040 + k*100 series.
export function ngrokViteApiPortFor(worktreeNum: number): number {
	return 4140 + (worktreeNum - 1) * 100;
}

export function composeProjectName(worktreeNum: number): string {
	return `autumn-wt-${worktreeNum}`;
}

export function aliasesFor(worktreeNum: number): WorktreeAliases {
	const apiHost = `wt${worktreeNum}-api.localhost`;
	const viteHost = `wt${worktreeNum}.localhost`;
	return {
		apiHost,
		apiUrl: portlessHttpsUrl(apiHost),
		viteHost,
		viteUrl: portlessHttpsUrl(viteHost),
	};
}

export function portlessHttpsUrl(host: string): string {
	const port = currentPortlessProxyPort();
	const suffix = port && port !== 443 ? `:${port}` : "";
	return `https://${host}${suffix}`;
}

export function currentPortlessProxyPort(): number | undefined {
	const envPort = Number(process.env.PORTLESS_PORT);
	if (Number.isInteger(envPort) && envPort > 0) return envPort;
	if (!existsSync(PORTLESS_PROXY_PORT_FILE)) return undefined;

	const filePort = Number(
		readFileSync(PORTLESS_PROXY_PORT_FILE, "utf-8").trim(),
	);
	if (Number.isInteger(filePort) && filePort > 0) return filePort;
	return undefined;
}

export function killOwnPorts(worktreeNum: number): void {
	const offset = (worktreeNum - 1) * 100;
	const ports = [
		8080 + offset,
		3000 + offset,
		3001 + offset,
		3080 + offset,
		3099 + offset,
	];
	if (process.platform === "win32") return;
	const lsof = sh(
		"lsof",
		ports.flatMap((p) => ["-ti", `:${p}`]),
	);
	const pids = lsof.stdout.split("\n").filter(Boolean);
	for (const pid of pids) {
		try {
			process.kill(Number(pid), "SIGKILL");
		} catch {}
	}
	if (pids.length > 0) {
		log(`killed ${pids.length} process(es) on ports ${ports.join(", ")}`);
	}
}
