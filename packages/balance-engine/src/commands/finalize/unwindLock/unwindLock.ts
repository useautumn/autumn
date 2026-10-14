import { deltasToFreedAllocation } from "../../../allocations/allocationDraw.js";
import type { DeductionContext } from "../../../deduction/types/deductionContext.js";
import type { DeductionDelta } from "../../../deduction/types/deductionDelta.js";
import { deltasToFreedUsageWindows } from "../../../deduction/utils/limits/usageWindows.js";
import type { WorkerFullSubject } from "../../../models/subject/workerFullSubject.js";
import { allotUnwindValue } from "./allotUnwindValue.js";
import { inverseLockDelta } from "./inverseLockDelta.js";
import type { UnwoundLock } from "./types/unwoundLock.js";

export const unwindLock = ({
	fullSubject,
	context,
	lockDeltas,
	unwindValue,
}: {
	fullSubject: WorkerFullSubject;
	context: DeductionContext;
	lockDeltas: DeductionDelta[];
	unwindValue: number;
}): UnwoundLock => {
	const { allotments, skippedValue } = allotUnwindValue({
		fullSubject,
		lockDeltas,
		unwindValue,
	});
	const deltas: DeductionDelta[] = [];
	for (const { delta, taken } of allotments)
		deltas.push(inverseLockDelta({ context, delta, taken, unwound: deltas }));
	return {
		deltas,
		usageWindowConsumed: deltasToFreedUsageWindows({ context, deltas }),
		allocationConsumed: deltasToFreedAllocation({ context, deltas }),
		skippedValue,
	};
};
