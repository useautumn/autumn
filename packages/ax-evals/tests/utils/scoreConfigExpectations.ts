import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AxCase } from "../../src/cases/types/axCase.ts";
import { inspectWorkspaceConfig } from "../../src/grading/inspectConfig.ts";
import type { AxRunOutput } from "../../src/types/axRunOutput.ts";
import { createCaseWorkspace } from "../../src/workspace/createCaseWorkspace.ts";

/**
 * Runs a case's config expectations against a literal config file (or an
 * empty workspace when none is given) — no agent involved. Returns
 * { expectationName: score } for direct toEqual assertions.
 */
export const scoreConfigExpectations = async ({
	axCase,
	configFile,
}: {
	axCase: AxCase;
	configFile?: string;
}): Promise<Record<string, number | null>> => {
	const workspace = await createCaseWorkspace(`proof-${axCase.name}`);
	try {
		if (configFile)
			await writeFile(join(workspace.dir, "autumn.config.ts"), configFile);
		const output = agentlessOutput(await inspectWorkspaceConfig(workspace.dir));
		const configExpectations = axCase.expect.filter(
			(expectation) => expectation.kind === "config",
		);
		return Object.fromEntries(
			configExpectations.map((expectation) => {
				const { name, score } = expectation.score(output);
				return [name, score];
			}),
		);
	} finally {
		await workspace.cleanup();
	}
};

// No skillId: config-kind expectations never read it; only conduct ones do.
const agentlessOutput = (config: AxRunOutput["config"]): AxRunOutput => ({
	arm: "with",
	config,
	toolUses: [],
	loadedSkills: [],
	finalText: "",
	turnTexts: [],
	turns: 1,
	costUsd: 0,
	wallMs: 0,
	timedOut: false,
});
