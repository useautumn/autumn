import { Decimal } from "decimal.js";
import { deltasToUsageEventFields } from "../../common/usageEvent/deltasToUsageEventFields.js";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import {
	deductFromBuckets,
	deductionStateToOutcome,
} from "../../deduction/deduct.js";
import { setupDeductionContext } from "../../deduction/setup/setupDeductionContext.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import { LockNotFoundError } from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { splitFinalize, unwoundLockToForwardValue } from "./splitFinalize.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";
import { unwindLock } from "./unwindLock/unwindLock.js";

/**
 * Settles a lock: give back what the final value does not need, newest bucket first, then take whatever it
 * needs beyond the lock. Both halves are deltas, so the row changes come from the same converter a track uses.
 */
export const computeFinalize = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: FinalizeCommand;
}): SubjectStateMutation => {
	assertCommandSupported({ fullSubject, command });
	const { lock } = command;

	// Checked before anything moves: a lock already settled, or expired, is simply gone.
	const isOpen = fullSubject.open_locks.some(
		(openLock) => openLock.id === lock.id,
	);

	if (!isOpen) throw new LockNotFoundError({ lockId: lock.lock_id });

	const lockValue = lock.deltas
		.reduce((total, delta) => total.minus(delta.valueDelta), new Decimal(0))
		.toNumber();
	const finalValue = command.finalValue ?? lockValue;

	const { unwindValue, additionalValue } = splitFinalize({
		lockValue,
		finalValue,
	});

	// The lock's terms govern, whatever the finalize call would prefer.
	const lockRequest: DeductionRequest = {
		value: additionalValue,
		featureId: lock.feature_id,
		internalFeatureId: command.internalFeatureId,
		overageBehavior: lock.overage_behavior,
		properties: command.properties ?? lock.properties,
		// A release gives back regardless; only taking more is subject to the overdue block.
		enforceOverdueBlock: true,
		now: command.occurredAt,
		org: command.org,
	};
	const context = setupDeductionContext({ fullSubject, request: lockRequest });

	const unwound = unwindLock({
		fullSubject,
		context,
		lockDeltas: lock.deltas,
		unwindValue,
	});

	const request = {
		...lockRequest,
		value: unwoundLockToForwardValue({ unwound, additionalValue, lockValue }),
	};
	// The forward draw starts from what the unwind moved, so it sees the balances and headroom just given back.
	const deductionState = {
		remaining: new Decimal(request.value),
		deltas: unwound.deltas,
		usageWindowConsumed: unwound.usageWindowConsumed,
	};
	deductFromBuckets({ context, deductionState });
	const outcome = deductionStateToOutcome({ context, deductionState, request });

	const { rejected } = outcome;
	return {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		subject: fullSubjectToMutationSubject({ fullSubject }),
		revision: {
			before: fullSubject.revision,
			after: fullSubject.revision + 1,
		},
		command,
		// A rejected confirm moves nothing and leaves the lock open for another attempt.
		changes: rejected
			? []
			: [...outcome.changes, { table: "locks", op: "delete", id: lock.id }],
		result: {
			type: "finalize",
			status: rejected ? "rejected" : "applied",
			reason: rejected ? "insufficient_balance" : null,
			lockValue,
			finalValue,
			deltas: rejected ? [] : outcome.deltas,
			...deltasToUsageEventFields({
				fullSubject,
				deltas: rejected ? [] : outcome.deltas,
			}),
		},
	};
};
