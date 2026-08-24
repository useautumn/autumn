import type { BalanceContext } from "../../../types/balanceContext.js";
import type { TrackContext } from "../types/trackContext.js";
import { resolveDeductionOptions } from "./resolveDeductionOptions.js";

const DEFAULT_VALUE = 1;

// The command's value applies to every relevant feature; credit systems will
// scale it per feature through the deduction rows' credit cost, not here.
export const setupTrackContext = ({
	balanceContext,
}: {
	balanceContext: BalanceContext;
}): TrackContext => {
	const { body } = balanceContext.command;
	const amount = body.value ?? DEFAULT_VALUE;

	return {
		...balanceContext,
		requests: balanceContext.features.map((feature) => ({ feature, amount })),
		options: resolveDeductionOptions({ body }),
	};
};
