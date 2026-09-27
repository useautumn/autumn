import type { DeductionContext } from "../../../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../../deduction/types/deductionDelta.js";
import { deltasToFreedUsageWindows } from "../../../deduction/utils/limits/usageWindows.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import { allotUnwindValue } from "./allotUnwindValue.js";
import { inverseLockDelta } from "./inverseLockDelta.js";
import type { UnwoundLock } from "./types/unwoundLock.js";

/**
 * Gives back `unwindValue` of what the lock took: balances, rate-card attribution and the usage windows it counted.
 * Exact and unclamped, so a refund may leave a balance above its allowance. Pure: it returns what moves, and moves nothing.
 */
export const unwindLock = ({
	fullSubject,
	context,
	lockDeltas,
	unwindValue,
}: {
	fullSubject: WorkerFullSubject;
	/** The rows a deduction of the locked feature would draw from now; rate cards and caps are read off them. */
	context: DeductionContext;
	lockDeltas: DeductionDelta[];
	unwindValue: number;
}): UnwoundLock => {
	const { allotments, skippedValue } = allotUnwindValue({
		fullSubject,
		lockDeltas,
		unwindValue,
	});
	// In order: a graduated rate reprices each give-back from the units the earlier ones already returned.
	const deltas: DeductionDelta[] = [];
	for (const { delta, taken } of allotments)
		deltas.push(inverseLockDelta({ context, delta, taken, unwound: deltas }));
	return {
		deltas,
		usageWindowConsumed: deltasToFreedUsageWindows({ context, deltas }),
		skippedValue,
	};
};
