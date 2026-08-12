import { userInfo } from "node:os";

const MAX_BRANCH_LEN = 48;

function sanitizeSegment({ value }: { value: string }): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function currentUsername(): string {
	return (
		process.env.USER?.trim() ||
		process.env.USERNAME?.trim() ||
		userInfo().username ||
		"user"
	);
}

function currentGitBranch({ projectRoot }: { projectRoot: string }): string {
	const result = Bun.spawnSync(["git", "branch", "--show-current"], {
		cwd: projectRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const branch = new TextDecoder().decode(result.stdout).trim();
	if (result.exitCode === 0 && branch) return branch;

	const sha = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
		cwd: projectRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const shortSha = new TextDecoder().decode(sha.stdout).trim();
	if (sha.exitCode === 0 && shortSha) return `detached-${shortSha}`;
	return "detached";
}

/** Unique Trigger.dev DEV branch for local `bun d` / `bun dw` isolation. */
export function resolveTriggerDevBranch({
	projectRoot,
	worktreeNum = 1,
}: {
	projectRoot: string;
	worktreeNum?: number;
}): string {
	const override = process.env.TRIGGER_DEV_BRANCH?.trim();
	if (override && override !== "default") return override;

	const user = sanitizeSegment({ value: currentUsername() }) || "user";
	const branch =
		sanitizeSegment({ value: currentGitBranch({ projectRoot }) }) || "detached";
	const parts =
		worktreeNum > 1 ? [user, `wt${worktreeNum}`, branch] : [user, branch];
	const joined = parts.join("-");
	return joined.length <= MAX_BRANCH_LEN
		? joined
		: joined.slice(0, MAX_BRANCH_LEN).replace(/-$/, "");
}
