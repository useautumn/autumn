import { Decimal } from "decimal.js";
import type { WorkerFullSubject } from "../models/subject/workerFullSubject.js";
import { setupDeductionContext } from "./setup/setupDeductionContext.js";
import type { DeductionOutcome } from "./types/deductionOutcome.js";
import type { DeductionRequest } from "./types/deductionRequest.js";
import type { DeductionState } from "./types/deductionState.js";
import { deltasToRowChanges } from "./utils/convertDeductionUtils.js";
import { deductFromBucket } from "./utils/draw/deductFromBucket.js";
import { usageWindowsToRowChanges } from "./utils/limits/usageWindows.js";

/** Take the requested units from the subject; negative values refund. Pure: same inputs, same outcome. */
export const deduct = ({
	fullSubject,
	request,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
}): DeductionOutcome => {
	const context = setupDeductionContext({ fullSubject, request });

	const deductionState: DeductionState = {
		remaining: new Decimal(request.value),
		deltas: [],
		usageWindowConsumed: new Map(),
	};
	deductFromBucket({ context, deductionState, bucket: "unlimited" });
	deductFromBucket({ context, deductionState, bucket: "rollovers" });
	deductFromBucket({ context, deductionState, bucket: "included" });
	deductFromBucket({ context, deductionState, bucket: "overage" });

	const { remaining, deltas } = deductionState;
	// Overdue-blocked with nothing left to draw from refuses the value whatever the behaviour.
	const refusedAsOverdue =
		context.overdueBlocked && context.rows.length === 0 && remaining.gt(0);
	const rejected =
		refusedAsOverdue ||
		(remaining.gt(0) && request.overageBehavior === "reject");
	return {
		context,
		requestedValue: request.value,
		appliedValue: new Decimal(request.value).minus(remaining).toNumber(),
		remaining: remaining.toNumber(),
		rejected,
		deltas,
		changes: rejected
			? []
			: [
					...deltasToRowChanges({ context, deltas }),
					...usageWindowsToRowChanges({ context, deductionState }),
				],
	};
};
