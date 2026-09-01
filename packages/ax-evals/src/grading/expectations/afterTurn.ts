import type { Expectation } from "../types/expectation.ts";
import type { InspectedConfig } from "../types/inspectedConfig.ts";

const missingConfig = (): InspectedConfig => ({
	configFound: false,
	plans: [],
	features: [],
});

/**
 * Grades an expectation against the config snapshot taken after the Nth user
 * message (1-based) instead of the final config. Checkpoints localize where a
 * multi-step conversation went wrong; final-state expectations stay the gate.
 */
export const afterTurn = (
	userTurn: number,
	expectation: Expectation,
): Expectation => {
	const name = `after turn ${userTurn}: ${expectation.name}`;
	return {
		name,
		kind: expectation.kind,
		score: (output) => {
			const config = output.configAfterTurn[userTurn - 1] ?? missingConfig();
			return { ...expectation.score({ ...output, config }), name };
		},
	};
};
