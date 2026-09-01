import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AX_EVALS_DIR } from "./workspacePaths.ts";

const ARTIFACTS_ROOT = join(AX_EVALS_DIR, ".artifacts");
const KEEP_RUNS_PER_CASE = 10;

/**
 * Persists the config a run produced (workspaces are deleted at cleanup) so a
 * failing scorecard can be diffed against the actual file. Keeps the last
 * KEEP_RUNS_PER_CASE runs per case and prunes the rest.
 */
export const saveRunArtifact = async ({
	caseName,
	arm,
	configText,
}: {
	caseName: string;
	arm: string;
	configText: string | null;
}): Promise<string | null> => {
	if (!configText) return null;
	const caseDir = join(ARTIFACTS_ROOT, caseName);
	const runDir = join(
		caseDir,
		`${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}-${arm}`,
	);
	await mkdir(runDir, { recursive: true });
	const path = join(runDir, "autumn.config.ts");
	await writeFile(path, configText);

	const entries = (await readdir(caseDir)).sort();
	for (const stale of entries.slice(0, -KEEP_RUNS_PER_CASE))
		await rm(join(caseDir, stale), { recursive: true, force: true });

	return path;
};
