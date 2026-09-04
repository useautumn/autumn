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
	const workspace = await createCaseWorkspace(`proof-${axCase.name}`, {
		secretKey: "am_sk_test_grader_proof",
		backendUrl: "http://localhost:8080",
	});
	try {
		if (configFile)
			await writeFile(join(workspace.dir, "autumn.config.ts"), configFile);
		const output = agentlessOutput(await inspectWorkspaceConfig(workspace.dir));
		const configExpectations = axCase.expect.filter(
			(expectation) => expectation.kind === "config",
		);
		return Object.fromEntries(
			await Promise.all(
				configExpectations.map(async (expectation) => {
					const { name, score } = await expectation.score(output);
					return [name, score] as const;
				}),
			),
		);
	} finally {
		await workspace.cleanup();
	}
};

// No skillId: config-kind expectations never read it; only conduct ones do.
// Every checkpoint sees the same config, so afterTurn expectations are provable
// with a single golden (subset matching makes the full golden pass early turns).
const agentlessOutput = (config: AxRunOutput["config"]): AxRunOutput => ({
	arm: "with",
	config,
	configAfterTurn: [config, config, config, config],
	toolUses: [],
	loadedSkills: [],
	finalText: "",
	turnTexts: [],
	userTexts: [],
	turns: 1,
	costUsd: 0,
	wallMs: 0,
	timedOut: false,
});
