import { loadRegistry } from "../helpers/registry.ts";

export function cmdList(): void {
	const registry = loadRegistry();
	const entries = Object.values(registry).sort(
		(a, b) => a.worktreeNum - b.worktreeNum,
	);
	if (entries.length === 0) {
		console.log("(no registered worktrees)");
		return;
	}
	const now = Date.now();
	for (const e of entries) {
		const offset = (e.worktreeNum - 1) * 100;
		const lastUsed = e.lastUsedAt ?? e.createdAt;
		const ageDays = Math.round((now - lastUsed) / (24 * 60 * 60 * 1000));
		console.log(
			`  ${e.worktreeNum.toString().padStart(2)} | ${(
				e.branchName ?? "(canonical)"
			).padEnd(
				24,
			)} | server :${8080 + offset} vite :${3000 + offset} | ${ageDays}d | ${e.path}`,
		);
	}
}
