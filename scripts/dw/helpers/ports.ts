import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorktreeAliases } from "../types.ts";
import { isAmicable } from "./amicable.ts";
import { log, sh } from "./shell.ts";

const PORTLESS_PROXY_PORT_FILE = join(homedir(), ".portless", "proxy.port");

export function dragonflyPortFor(worktreeNum: number): number {
	return 6379 + (worktreeNum - 1) * 100;
}

export function elasticMqPortFor(worktreeNum: number): number {
	return 9324 + (worktreeNum - 1) * 100;
}

export function serverPortFor(worktreeNum: number): number {
	return 8080 + (worktreeNum - 1) * 100;
}

// ngrok's local web API (the per-worktree container maps this to its :4040).
// dw polls it to read back the random tunnel URL ngrok assigned.
export function ngrokApiPortFor(worktreeNum: number): number {
	return 4040 + (worktreeNum - 1) * 100;
}

export function composeProjectName(worktreeNum: number): string {
	return `autumn-wt-${worktreeNum}`;
}

export function vitePortFor(worktreeNum: number): number {
	return 3000 + (worktreeNum - 1) * 100;
}

export function aliasesFor(worktreeNum: number): WorktreeAliases {
	// Devbox: browser is remote (reaches ports via <port>.<box>.ami) — no portless.
	if (isAmicable()) {
		return {
			apiHost: "localhost",
			apiUrl: `http://localhost:${serverPortFor(worktreeNum)}`,
			viteHost: "localhost",
			viteUrl: `http://localhost:${vitePortFor(worktreeNum)}`,
		};
	}
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
	const ports = [8080 + offset, 3000 + offset, 3001 + offset];
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
