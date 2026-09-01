import type { AxCase } from "../../src/cases/types/axCase.ts";
import type { AskedTopic } from "../../src/simulator/types/userAnswers.ts";
import type { AxRunOutput } from "../../src/types/axRunOutput.ts";

/**
 * Runs a case's flow expectations against a synthetic interview trace — no
 * agent involved. Returns { expectationName: score }.
 */
export const scoreFlowExpectations = async ({
	axCase,
	askedAbout,
}: {
	axCase: AxCase;
	askedAbout: AskedTopic[];
}): Promise<Record<string, number | null>> => {
	const output: AxRunOutput = {
		arm: "with",
		config: { configFound: false, plans: [], features: [] },
		configAfterTurn: [],
		askedAbout,
		toolUses: [],
		loadedSkills: [],
		finalText: "",
		turnTexts: [],
		userTexts: [],
		turns: askedAbout.length + 1,
		costUsd: 0,
		wallMs: 0,
		timedOut: false,
	};
	const flowExpectations = axCase.expect.filter(
		(expectation) => expectation.kind === "flow",
	);
	return Object.fromEntries(
		await Promise.all(
			flowExpectations.map(async (expectation) => {
				const { name, score } = await expectation.score(output);
				return [name, score] as const;
			}),
		),
	);
};
