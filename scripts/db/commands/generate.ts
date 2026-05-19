import { run } from "../helpers/spawn.ts";
import { REPO_ROOT } from "../helpers/paths.ts";

export async function cmdGenerate(): Promise<void> {
	const { code } = await run(
		"bun",
		["-F", "@autumn/shared", "db:generate"],
		{ cwd: REPO_ROOT },
	);
	process.exit(code);
}
