import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { AX_EVALS_DIR, REPO_ROOT } from "./workspacePaths.ts";

const run = promisify(execFile);
const ARTIFACTS_ROOT = join(AX_EVALS_DIR, ".artifacts");

/**
 * Diffs the agent-edited workspace against the pristine fixture — the clearest
 * record of what the agent actually wrote. Returned for printing and saved
 * under .artifacts/<case>/ alongside the config artifacts.
 */
export const saveFixtureDiff = async ({
	caseName,
	arm,
	fixture,
	workspaceDir,
}: {
	caseName: string;
	arm: string;
	fixture: string;
	workspaceDir: string;
}): Promise<{ diff: string; path: string | null }> => {
	const fixtureDir = join(REPO_ROOT, "packages/ax-evals/fixtures", fixture);
	// diff exits 1 when files differ — that's the success case here.
	// Harness plumbing lives in the workspace too; it's not the agent's work.
	const harnessNoise = [
		"node_modules",
		".env",
		"bun.lock",
		".ax-plugin",
		".codex",
		".claude",
		"autumn.config.ts",
	];
	const result = await run(
		"diff",
		[
			"-ru",
			...harnessNoise.map((name) => `--exclude=${name}`),
			fixtureDir,
			workspaceDir,
		],
		{ maxBuffer: 4 * 1024 * 1024 },
	).catch((error: { code?: number; stdout?: string }) =>
		error.code === 1 ? { stdout: error.stdout ?? "" } : { stdout: "" },
	);
	const diff = result.stdout
		.replaceAll(`${workspaceDir}/`, "")
		.replaceAll(`${fixtureDir}/`, "");
	if (!diff.trim()) return { diff: "", path: null };

	const runDir = join(
		ARTIFACTS_ROOT,
		caseName,
		`${new Date().toISOString().replaceAll(":", "-").slice(0, 19)}-${arm}`,
	);
	await mkdir(runDir, { recursive: true });
	const path = join(runDir, "fixture.diff");
	await writeFile(path, diff);
	return { diff, path };
};
