import { sh, fatal } from "./shell.ts";
import { PROJECT_ROOT } from "../constants.ts";

export function getWorktreeList(): string[] {
	const res = sh("git", ["worktree", "list", "--porcelain"], {
		cwd: PROJECT_ROOT,
	});
	if (res.code !== 0) return [];
	return res.stdout
		.split("\n")
		.filter((l) => l.startsWith("worktree "))
		.map((l) => l.slice("worktree ".length).trim());
}

export function getCanonicalWorktree(): string {
	const list = getWorktreeList();
	return list[0] ?? PROJECT_ROOT;
}

export function getCurrentWorktree(): string {
	const res = sh("git", ["rev-parse", "--show-toplevel"], {
		cwd: PROJECT_ROOT,
	});
	if (res.code !== 0) fatal("not inside a git worktree");
	return res.stdout;
}
