import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RegistryEntry } from "../types.ts";
import { agentDir } from "./machineId.ts";
import { ngrokApiPortFor } from "./ports.ts";
import { shortHash } from "./registry.ts";
import { log, sh } from "./shell.ts";

const NGROK_API = "https://api.ngrok.com";

export type ReservedDomain = { id: string; domain: string };

export function ngrokApiAvailable(): boolean {
	return Boolean(process.env.NGROK_API_KEY);
}

export function reservedDomainName({
	machineId: id,
	path,
	worktreeNum,
}: {
	machineId: string;
	path: string;
	worktreeNum: number;
}): string {
	return `autumn-wt${worktreeNum}-${shortHash(`${id}:${path}`)}.ngrok.app`;
}

function ngrokHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${process.env.NGROK_API_KEY}`,
		"Content-Type": "application/json",
		"Ngrok-Version": "2",
	};
}

export function firstHttpsUrl(text: string): string | undefined {
	return text.match(/https:\/\/\S+/)?.[0]?.replace(/[.,;]+$/, "");
}

export async function deleteReservedDomain(id: string): Promise<void> {
	if (!ngrokApiAvailable()) return;
	const response = await fetch(`${NGROK_API}/reserved_domains/${id}`, {
		headers: ngrokHeaders(),
		method: "DELETE",
	});
	if (response.status === 204 || response.status === 404) {
		log(`ngrok reserved domain ${id} released`);
		return;
	}
	log(
		`ngrok delete reserved domain ${id} failed: ${response.status} ${await response.text()}`,
	);
}

function ngrokPidFile(worktreeNum: number): string {
	return join(agentDir(), `ngrok-${worktreeNum}.pid`);
}

function inspectorUp(worktreeNum: number): boolean {
	return (
		sh("curl", [
			"-sf",
			"--max-time",
			"1",
			`http://127.0.0.1:${ngrokApiPortFor(worktreeNum)}/api/tunnels`,
		]).code === 0
	);
}

export function stopHostNgrok({
	worktreeNum,
}: {
	worktreeNum: number;
}): void {
	const pidFile = ngrokPidFile(worktreeNum);
	if (existsSync(pidFile)) {
		const pid = Number(readFileSync(pidFile, "utf8").trim());
		if (Number.isInteger(pid) && pid > 0) {
			try {
				process.kill(pid, "SIGTERM");
			} catch {}
		}
	}
	const deadline = Date.now() + 2000;
	while (Date.now() < deadline && inspectorUp(worktreeNum)) {
		Bun.sleepSync(50);
	}
}

/** Stop leftover ngrok and release reserved domains. Safe if none exist. */
export async function releaseNgrokIfPresent(
	entry: RegistryEntry,
): Promise<void> {
	stopHostNgrok({ worktreeNum: entry.worktreeNum });
	if (entry.reservedDomainId) {
		await deleteReservedDomain(entry.reservedDomainId);
	}
	if (entry.reservedViteDomainId) {
		await deleteReservedDomain(entry.reservedViteDomainId);
	}
}
