import { join, relative, resolve } from "node:path";
import { configPackageName } from "../config/configPackageName";
import { ask, type Prompter } from "../prompt/prompt";
import { findRepoLayout } from "../repo/findRepoRoot";

const MONOREPO_DEFAULT = "packages/autumn";

/**
 * Where the config goes when nothing states it: the package cwd sits in, the
 * monorepo default from a workspace root, else cwd itself.
 */
export const defaultConfigDir = ({ cwd }: { cwd: string }): string => {
	const { repoRoot, packageRoot, hasWorkspaces } = findRepoLayout({ cwd });
	if (packageRoot === cwd && cwd !== repoRoot) return cwd;
	return hasWorkspaces ? join(repoRoot, MONOREPO_DEFAULT) : cwd;
};

/**
 * No flag, no config beside cwd, no root marker: ask before writing anything.
 * Headless prints the `-c` hint and stops, so nothing lands in a folder the
 * user never chose.
 */
export const chooseConfigDir = async ({
	cwd,
	prompter,
}: {
	cwd: string;
	prompter: Prompter;
}): Promise<{ configDir: string; repoRoot: string }> => {
	const { repoRoot } = findRepoLayout({ cwd });
	const fallback = relative(repoRoot, defaultConfigDir({ cwd })) || ".";
	const chosen = await ask({
		prompter,
		value: undefined,
		question: "Where should your Autumn config live?",
		flag: `-c <dir> (or run ${configPackageName()} init)`,
		example: `-c ${fallback}`,
		defaultValue: fallback,
	});
	return { configDir: resolve(repoRoot, chosen), repoRoot };
};
