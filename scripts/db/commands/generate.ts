import { run } from "../helpers/spawn.ts";
import { REPO_ROOT } from "../helpers/paths.ts";
import { loadWorktreeEnvLocal } from "../helpers/env.ts";

export async function cmdGenerate(): Promise<void> {
	// If a worktree is enabled, prefer its DATABASE_URL so drizzle-kit
	// diffs against the worktree's isolated DB.
	loadWorktreeEnvLocal();

	const { code } = await run(
		"bun",
		["-F", "@autumn/shared", "db:generate"],
		{ cwd: REPO_ROOT },
	);
	process.exit(code);
}
