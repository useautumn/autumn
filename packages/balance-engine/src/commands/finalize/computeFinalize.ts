import { Decimal } from "decimal.js";
import { deltasToUsageEventFields } from "../../common/usageEvent/deltasToUsageEventFields.js";
import { fullSubjectToMutationSubject } from "../../common/usageEvent/fullSubjectToMutationSubject.js";
import {
	deductFromBuckets,
	deductionStateToOutcome,
} from "../../deduction/deduct.js";
import { setupDeductionContext } from "../../deduction/setup/setupDeductionContext.js";
import { toDeductionSelection } from "../../deduction/toDeductionSelection.js";
import type { FinalizeDecision } from "../../deduction/types/deductionDecision.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import { LockNotFoundError } from "../../errors.js";
import type { LockRowChange } from "../../models/mutation/rowChange.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerLock } from "../../models/subject/rows/workerLock.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import {
	atomSourceToRowChange,
	isAtomReplay,
} from "../common/atomSourceToRowChange.js";
import { finalizeOfNothing } from "./finalizeOfNothing.js";
import { splitFinalize, unwoundLockToForwardValue } from "./splitFinalize.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";
import { unwindLock } from "./unwindLock/unwindLock.js";

/** The lock a finalize settles while Autumn still holds it open: the row the API passed, or an Atom's lock from state. */
const heldLockOf = ({
	fullSubject,
	command: { lock, lockId },
}: {
	fullSubject: WorkerFullSubject;
	command: FinalizeCommand;
}): WorkerLock | null => {
	const openLock = fullSubject.open_locks.find((candidate) =>
		lock ? candidate.id === lock.id : candidate.lock_id === lockId,
	);
	return openLock ? (lock ?? openLock) : null;
};

/**
 * Settles a lock: give back what the final value does not need, newest bucket first, then take whatever it
 * needs beyond the lock. Both halves are deltas, so the row changes come from the same converter a track uses.
 */
export const computeFinalizeDecision = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: FinalizeCommand;
}): FinalizeDecision => {
	assertCommandSupported({ fullSubject, command });
	const { source } = command;
	// Checked before anything moves: a lock already settled, or expired, is simply gone.
	const lock = heldLockOf({ fullSubject, command });

	// An Atom's finalize for a lock Autumn no longer holds, or one it already applied, settles nothing but its seq.
	if (
		source &&
		(!lock || isAtomReplay({ source, customer: fullSubject.customer }))
	)
		return {
			mutation: finalizeOfNothing({ command, lock, source, fullSubject }),
			outcome: null,
		};
	if (!lock)
		throw new LockNotFoundError({
			lockId: command.lock?.lock_id ?? command.lockId ?? "",
		});

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
		selection: toDeductionSelection({
			featureId: lock.feature_id,
			internalFeatureId: command.internalFeatureId,
			now: command.occurredAt,
			properties: command.properties ?? lock.properties,
			includesCreditSystems: true,
			countsUsageWindows: true,
			countsAllocations: true,
			org: command.org,
			// A release gives back regardless; only taking more is subject to the overdue block.
			enforceOverdueBlock: true,
		}),
		terms: { overageBehavior: lock.overage_behavior, enforcesSpendLimit: true },
		value: additionalValue,
	};
	const context = setupDeductionContext({
		fullSubject,
		selection: lockRequest.selection,
	});

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
		terms: request.terms,
		deltas: unwound.deltas,
		usageWindowConsumed: unwound.usageWindowConsumed,
		allocationConsumed: unwound.allocationConsumed,
	};
	deductFromBuckets({ context, deductionState });
	const outcome = deductionStateToOutcome({ context, deductionState, request });

	const { rejected } = outcome;
	const sourceChange =
		source && atomSourceToRowChange({ source, customer: fullSubject.customer });
	const mutation: SubjectStateMutation = {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		subject: fullSubjectToMutationSubject({ fullSubject }),
		revision: {
			before: fullSubject.revision,
			after: fullSubject.revision + 1,
		},
		// The log records the row Autumn settled, as the API's finalize carries the row it read.
		command: { ...command, lock },
		// A rejected confirm moves nothing and leaves the lock open for another attempt.
		changes: [
			...(rejected
				? []
				: [
						...outcome.changes,
						{
							table: "locks",
							op: "delete",
							id: lock.id,
						} satisfies LockRowChange,
					]),
			...(sourceChange ? [sourceChange] : []),
		],
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
	return { mutation, outcome };
};

export const computeFinalize = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: FinalizeCommand;
}): SubjectStateMutation =>
	computeFinalizeDecision({ fullSubject, command }).mutation;
