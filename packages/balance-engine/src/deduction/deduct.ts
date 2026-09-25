import { Decimal } from "decimal.js";
import type { WorkerFullSubject } from "../models/subject/workerFullSubject.js";
import { setupDeductionContext } from "./setup/setupDeductionContext.js";
import type { DeductionContext } from "./types/deductionContext.js";
import type { DeductionOutcome } from "./types/deductionOutcome.js";
import type { DeductionRequest } from "./types/deductionRequest.js";
import type { DeductionState } from "./types/deductionState.js";
import { deltasToRowChanges } from "./utils/convertDeductionUtils.js";
import { deductFromBucket } from "./utils/draw/deductFromBucket.js";
import { deductionStateToLimitType } from "./utils/limits/deductionStateToLimitType.js";
import { usageWindowsToRowChanges } from "./utils/limits/usageWindows.js";

/** The forward draw: takes `deductionState.remaining` from the buckets in order, on top of whatever has already moved. */
export const deductFromBuckets = ({
	context,
	deductionState,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
}): void => {
	deductFromBucket({ context, deductionState, bucket: "unlimited" });
	deductFromBucket({ context, deductionState, bucket: "rollovers" });
	deductFromBucket({ context, deductionState, bucket: "included" });
	deductFromBucket({ context, deductionState, bucket: "overage" });
};

/** Everything that moved becomes row changes once, unless what is left over refuses the whole value. */
export const deductionStateToOutcome = ({
	context,
	deductionState,
	request,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	request: DeductionRequest;
}): DeductionOutcome => {
	const { remaining, deltas } = deductionState;
	// Overdue-blocked with nothing left to draw from refuses the value whatever the behaviour.
	const refusedAsOverdue =
		context.overdueBlocked && context.rows.length === 0 && remaining.gt(0);
	const rejected =
		refusedAsOverdue ||
		(remaining.gt(0) && request.overageBehavior === "reject");
	return {
		request,
		context,
		requestedValue: request.value,
		appliedValue: new Decimal(request.value).minus(remaining).toNumber(),
		remaining: remaining.toNumber(),
		rejected,
		limitType: remaining.gt(0)
			? deductionStateToLimitType({ context, deductionState })
			: null,
		deltas,
		usageWindowConsumed: deductionState.usageWindowConsumed,
		changes: rejected
			? []
			: [
					...deltasToRowChanges({ context, deltas }),
					...usageWindowsToRowChanges({ context, deductionState }),
				],
	};
};

/** Where a draw starts: the balances and caps an earlier draw on the same context left behind. */
export type DeductionStart = Pick<
	DeductionState,
	"deltas" | "usageWindowConsumed"
>;

const STORED_BALANCES: DeductionStart = {
	deltas: [],
	usageWindowConsumed: new Map(),
};

/** Take the requested units on a context already set up, from the stored balances or from where `from` left them. The outcome carries both draws. */
export const deductOnContext = ({
	context,
	request,
	from = STORED_BALANCES,
}: {
	context: DeductionContext;
	request: DeductionRequest;
	from?: DeductionStart;
}): DeductionOutcome => {
	const deductionState: DeductionState = {
		remaining: new Decimal(request.value),
		deltas: [...from.deltas],
		usageWindowConsumed: new Map(from.usageWindowConsumed),
	};
	deductFromBuckets({ context, deductionState });
	return deductionStateToOutcome({ context, deductionState, request });
};

/** Take the requested units from the subject; negative values refund. Pure: same inputs, same outcome. */
export const deduct = ({
	fullSubject,
	request,
}: {
	fullSubject: WorkerFullSubject;
	request: DeductionRequest;
}): DeductionOutcome =>
	deductOnContext({
		context: setupDeductionContext({ fullSubject, request }),
		request,
	});
