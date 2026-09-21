import { Decimal } from "decimal.js";
import { deduct } from "../../deduction/deduct.js";
import { LockNotFoundError } from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { parseSubjectStateMutation } from "../../parsers.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { splitFinalize } from "./splitFinalize.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";
import { unwindLockDeltas } from "./unwindLockDeltas.js";

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
	const unwind = unwindLockDeltas({
		fullSubject,
		lockDeltas: lock.deltas,
		unwindValue,
	});
	// What the unwind could not return to a vanished row is settled against the rows the customer holds now.
	const forwardValue = new Decimal(additionalValue)
		.minus(new Decimal(unwind.skippedValue).mul(Math.sign(lockValue)))
		.toNumber();

	const outcome = deduct({
		fullSubject,
		priorDeltas: unwind.deltas,
		request: {
			featureId: lock.feature_id,
			internalFeatureId: command.internalFeatureId,
			value: forwardValue,
			// The lock's behaviour governs, whatever the finalize call would prefer.
			overageBehavior: lock.overage_behavior,
			properties: command.properties ?? lock.properties,
			enforceOverdueBlock: false,
			now: command.occurredAt,
			org: command.org,
		},
	});

	const { rejected } = outcome;
	return parseSubjectStateMutation({
		input: {
			schemaVersion: 1,
			type: "mutation",
			id: command.commandId,
			identity: command.identity,
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
			},
		},
	});
};
