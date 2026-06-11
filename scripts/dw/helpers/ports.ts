import { sh, log } from "./shell.ts";
import type { WorktreeAliases } from "../types.ts";

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

export function aliasesFor(worktreeNum: number): WorktreeAliases {
	const apiHost = `wt${worktreeNum}-api.localhost`;
	const viteHost = `wt${worktreeNum}.localhost`;
	return {
		apiHost,
		apiUrl: `https://${apiHost}`,
		viteHost,
		viteUrl: `https://${viteHost}`,
	};
}

export function killOwnPorts(worktreeNum: number): void {
	const offset = (worktreeNum - 1) * 100;
	const ports = [8080 + offset, 3000 + offset, 3001 + offset];
	if (process.platform === "win32") return;
	const lsof = sh("lsof", ports.flatMap((p) => ["-ti", `:${p}`]));
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
