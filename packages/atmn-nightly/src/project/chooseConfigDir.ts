import { relative, resolve } from "node:path";
import { COLLECTION_FILES } from "../actions/pull/scaffoldConfig";
import { configPackageName } from "../config/configPackageName";
import { ask, done, type Prompter, soft } from "../prompt/prompt";
import { findRepoLayout } from "../repo/findRepoRoot";

/** The config folder when nothing states it: its own package in a workspace, else `autumn/`. */
export const defaultConfigDirName = ({ cwd }: { cwd: string }): string =>
	findRepoLayout({ cwd }).hasWorkspaces ? "packages/autumn/" : "autumn/";

const configFiles = ["autumn.config.ts", ...Object.keys(COLLECTION_FILES)];

/**
 * No flag, no config beside cwd, no root marker: say what is about to be
 * created and ask where, before writing anything. Headless prints the `-c`
 * hint and stops, so nothing lands in a folder the user never chose.
 */
export const chooseConfigDir = async ({
	cwd,
	prompter,
}: {
	cwd: string;
	prompter: Prompter;
}): Promise<{ configDir: string; repoRoot: string }> => {
	const { repoRoot } = findRepoLayout({ cwd });
	const fallback = defaultConfigDirName({ cwd });
	prompter.write(
		`${soft("No autumn.config.ts found.")}\n  atmn keeps your pricing in one folder: ${configFiles.join(", ")}.\n`,
	);
	const chosen = await ask({
		prompter,
		value: undefined,
		question: "Where should that folder live?",
		flag: `-c <dir> (or run ${configPackageName()} init)`,
		example: `-c ${fallback}`,
		defaultValue: fallback,
	});
	const configDir = resolve(repoRoot, chosen);
	prompter.write(`${done(`Path ${relative(repoRoot, configDir) || "."}`)}\n`);
	return { configDir, repoRoot };
};
