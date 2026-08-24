import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MAX_WORKTREE } from "../constants.ts";
import type { WorktreeAliases } from "../types.ts";
import { log, sh } from "./shell.ts";

const PORTLESS_PROXY_PORT_FILE = join(homedir(), ".portless", "proxy.port");

/** bun d owns 6379/6380/8000. wt-1 compose sits past slot 50. */
const worktree1ComposeSlot = MAX_WORKTREE + 1;

function composeSlot(worktreeNum: number): number {
	return worktreeNum === 1 ? worktree1ComposeSlot : worktreeNum;
}

export function dragonflyPortFor(worktreeNum: number): number {
	return 6379 + (composeSlot(worktreeNum) - 1) * 100;
}

export function elasticMqPortFor(worktreeNum: number): number {
	return 9324 + (composeSlot(worktreeNum) - 1) * 100;
}

// DynamoDB Local's default port. Base 8000 never collides with the server's
// 8080 base: 8000 + k*100 and 8080 + k*100 stay 80 apart for every worktree.
export function dynamoDbPortFor(worktreeNum: number): number {
	return 8000 + (composeSlot(worktreeNum) - 1) * 100;
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

/** Host-wide Google OAuth emulator (headless / Cloud; no portless). */
export const EMULATE_PORT = 4000;

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

/** App processes only. Path proxy + cloudflared are a sidecar — never recycle them here. */
export function appPortsFor(worktreeNum: number): number[] {
	return [
		serverPortFor(worktreeNum),
		vitePortFor(worktreeNum),
		checkoutPortFor(worktreeNum),
		leafPortFor(worktreeNum),
	];
}

function parentPidOf(pid: number): number | undefined {
	const ppid = Number(sh("ps", ["-o", "ppid=", "-p", String(pid)]).stdout);
	if (!Number.isInteger(ppid) || ppid <= 1) return undefined;
	return ppid;
}

function isNodemonPid(pid: number): boolean {
	return sh("ps", ["-o", "args=", "-p", String(pid)]).stdout.includes(
		"nodemon",
	);
}

/**
 * Local `bun dw run` only. Killing the port holder without nodemon just
 * makes nodemon respawn another server — that is how leftover trees pile up.
 */
export function killOwnPorts(worktreeNum: number): void {
	if (process.env.NODE_ENV === "production") return;
	const ports = appPortsFor(worktreeNum);
	if (process.platform === "win32") return;
	const lsof = sh(
		"lsof",
		ports.flatMap((p) => ["-ti", `:${p}`]),
	);
	const listeners = [
		...new Set(
			lsof.stdout
				.split("\n")
				.map((pid) => Number(pid))
				.filter((pid) => Number.isInteger(pid) && pid > 1),
		),
	];
	const supervisors = [
		...new Set(
			listeners.flatMap((pid) => {
				const ppid = parentPidOf(pid);
				if (
					ppid === undefined ||
					ppid === process.pid ||
					!isNodemonPid(ppid)
				) {
					return [];
				}
				return [ppid];
			}),
		),
	];
	for (const pid of [...supervisors, ...listeners]) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	if (listeners.length > 0) {
		log(`killed ${listeners.length} process(es) on ports ${ports.join(", ")}`);
	}
}
