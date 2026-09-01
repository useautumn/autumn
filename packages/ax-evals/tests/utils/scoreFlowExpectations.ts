import type { AxCase } from "../../src/cases/types/axCase.ts";
import type { AskedTopic } from "../../src/simulator/types/userAnswers.ts";
import type { AxRunOutput } from "../../src/types/axRunOutput.ts";

/**
 * Runs a case's flow expectations against a synthetic interview trace — no
 * agent involved. Returns { expectationName: score }.
 */
export const scoreFlowExpectations = ({
	axCase,
	askedAbout,
}: {
	axCase: AxCase;
	askedAbout: AskedTopic[];
}): Record<string, number | null> => {
	const output: AxRunOutput = {
		arm: "with",
		config: { configFound: false, plans: [], features: [] },
		configAfterTurn: [],
		askedAbout,
		toolUses: [],
		loadedSkills: [],
		finalText: "",
		turnTexts: [],
		turns: askedAbout.length + 1,
		costUsd: 0,
		wallMs: 0,
		timedOut: false,
	};
	const flowExpectations = axCase.expect.filter(
		(expectation) => expectation.kind === "flow",
	);
	return Object.fromEntries(
		flowExpectations.map((expectation) => {
			const { name, score } = expectation.score(output);
			return [name, score];
		}),
	);
};
