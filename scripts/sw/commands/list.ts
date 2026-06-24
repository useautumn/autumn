import { loadRegistry } from "../helpers/registry.ts";

export function cmdList(): void {
	const registry = loadRegistry();
	const entries = Object.values(registry);
	if (entries.length === 0) {
		console.log("[sw] no worktrees registered");
		return;
	}
	for (const entry of entries.sort((a, b) => a.createdAt - b.createdAt)) {
		const where =
			entry.target === "local"
				? "local"
				: `${entry.target} · ${entry.host ?? "?"}`;
		console.log(`${entry.branch}  [${where}]  ${entry.path}`);
	}
}
