import { PROJECT_ROOT } from "../constants.ts";
import { fatal, sh } from "./shell.ts";

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

export function getCurrentBranch(): string {
	const res = sh("git", ["branch", "--show-current"], { cwd: PROJECT_ROOT });
	if (res.code !== 0 || !res.stdout) {
		fatal("could not determine current git branch");
	}
	return res.stdout;
}

export function getDefaultBranch(): string {
	const res = sh("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], {
		cwd: PROJECT_ROOT,
	});
	if (res.code === 0) {
		return res.stdout.replace("refs/remotes/origin/", "");
	}
	return "dev";
}
