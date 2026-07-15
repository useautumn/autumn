import {
	listAutumnComposeProjects,
	removeComposeProject,
} from "../helpers/compose.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import { serverPortFor } from "../helpers/ports.ts";
import { loadRegistry } from "../helpers/registry.ts";
import { log, sh } from "../helpers/shell.ts";
import { tmuxSessionExists, tmuxSessionName } from "../helpers/tmux.ts";

function hasListeningDevPort(worktreeNum: number): boolean {
	if (process.platform === "win32") return false;
	const serverPort = serverPortFor(worktreeNum);
	const vitePort = 3000 + (worktreeNum - 1) * 100;
	const listeners = sh("lsof", [
		`-tiTCP:${serverPort}`,
		`-tiTCP:${vitePort}`,
		"-sTCP:LISTEN",
	]);
	return listeners.code === 0 && Boolean(listeners.stdout);
}

export function cmdCleanup(opts: { dryRun?: boolean }): void {
	const registry = loadRegistry();
	const currentPath = getCurrentWorktree();
	const currentEntry = registry[currentPath];
	const projects = listAutumnComposeProjects();
	let removed = 0;

	for (const project of projects) {
		const match = /^autumn-wt-(\d+)$/.exec(project);
		if (!match) continue;
		const worktreeNum = Number(match[1]);
		const isCurrent = currentEntry?.worktreeNum === worktreeNum;
		const isActive =
			tmuxSessionExists(tmuxSessionName(worktreeNum)) ||
			hasListeningDevPort(worktreeNum);

		if (worktreeNum === 1 || isCurrent || isActive) {
			log(`keeping active compose stack ${project}`);
			continue;
		}

		if (opts.dryRun) {
			log(`would remove inactive compose stack ${project}`);
			continue;
		}
		if (removeComposeProject(project)) removed++;
	}

	if (opts.dryRun) {
		log("cleanup dry run complete; no changes made");
	} else {
		log(`cleanup complete; removed ${removed} inactive compose stack(s)`);
	}
}
