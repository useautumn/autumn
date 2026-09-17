import { Decimal } from "decimal.js";
import type { OverageBehavior } from "../commands/track/types/trackCommand.js";
import type { WorkerFullSubject } from "../models/subject/workerFullSubject.js";
import { setupDeductionContext } from "./setup/setupDeductionContext.js";
import type { DeductionOutcome } from "./types/deductionOutcome.js";
import type { DeductionState } from "./types/deductionState.js";
import { deltasToRowChanges } from "./utils/deductionUtils.js";
import { deductFromBucket } from "./utils/draw/deductFromBucket.js";

/** Take `value` units of `featureId` from the subject; negative values refund. Pure: same inputs, same outcome. */
export const deduct = ({
	fullSubject,
	featureId,
	overageBehavior,
	now,
	value,
}: {
	fullSubject: WorkerFullSubject;
	featureId: string;
	overageBehavior: OverageBehavior;
	now: number;
	value: number;
}): DeductionOutcome => {
	const context = setupDeductionContext({
		fullSubject,
		featureId,
		overageBehavior,
		now,
	});

	const deductionState: DeductionState = {
		remaining: new Decimal(value),
		deltas: [],
	};
	deductFromBucket({ context, deductionState, bucket: "unlimited" });
	deductFromBucket({ context, deductionState, bucket: "rollovers" });
	deductFromBucket({ context, deductionState, bucket: "included" });
	deductFromBucket({ context, deductionState, bucket: "overage" });

	const { remaining, deltas } = deductionState;
	const rejected = remaining.gt(0) && overageBehavior === "reject";
	return {
		context,
		requestedValue: value,
		appliedValue: new Decimal(value).minus(remaining).toNumber(),
		remaining: remaining.toNumber(),
		rejected,
		deltas,
		changes: rejected ? [] : deltasToRowChanges({ context, deltas }),
	};
};
