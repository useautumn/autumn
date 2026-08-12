#!/usr/bin/env bun
/**
 * Detached babysitter: archive a Trigger DEV branch when the watched pid dies.
 * Started by scripts/dev.ts — do not run manually.
 */

import { archiveTriggerDevBranch } from "./trigger/archiveDevBranch.ts";

function parseArgs(argv: string[]): {
	watchPid: number;
	branch: string;
	projectRoot: string;
} {
	const get = (flag: string): string | undefined => {
		const i = argv.indexOf(flag);
		return i !== -1 ? argv[i + 1] : undefined;
	};
	const watchPid = Number.parseInt(get("--watch-pid") ?? "", 10);
	const branch = get("--branch")?.trim() ?? "";
	const projectRoot = get("--project-root")?.trim() ?? "";
	if (!Number.isFinite(watchPid) || watchPid <= 0 || !branch || !projectRoot) {
		console.error(
			"usage: triggerDevBranchReaper --watch-pid <pid> --branch <name> --project-root <path>",
		);
		process.exit(2);
	}
	return { watchPid, branch, projectRoot };
}

function pidAlive({ pid }: { pid: number }): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function sleep({ ms }: { ms: number }): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
	const { watchPid, branch, projectRoot } = parseArgs(process.argv.slice(2));

	// Survive terminal Ctrl+C aimed at the parent process group.
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, () => {});
	}

	while (pidAlive({ pid: watchPid })) {
		await sleep({ ms: 2000 });
	}

	const result = await archiveTriggerDevBranch({ projectRoot, branch });
	if (result.ok) {
		console.log(`Archived Trigger DEV branch: ${branch} (${result.detail})`);
	} else {
		console.error(
			`Failed to archive Trigger DEV branch ${branch}: ${result.detail}`,
		);
		process.exitCode = 1;
	}
}

await main();
