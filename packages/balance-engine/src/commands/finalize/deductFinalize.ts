import { Decimal } from "decimal.js";
import { deductOnContext } from "../../deduction/deduct.js";
import { setupDeductionContext } from "../../deduction/setup/setupDeductionContext.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
import { LockNotFoundError } from "../../errors.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { splitFinalize, unwoundLockToForwardValue } from "./splitFinalize.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";
import { unwindLock } from "./unwindLock/unwindLock.js";

/** What the lock holds and what the finalize settles it at: the lock's own value unless the caller names another. */
export const finalizeCommandToValues = ({
	command,
}: {
	command: FinalizeCommand;
}): { lockValue: number; finalValue: number } => {
	const lockValue = command.lock.deltas
		.reduce((total, delta) => total.minus(delta.valueDelta), new Decimal(0))
		.toNumber();
	return { lockValue, finalValue: command.finalValue ?? lockValue };
};

/**
 * The deduction a finalize makes: give back what the final value does not need, newest bucket first,
 * then take whatever it needs beyond the lock, starting from what the give-back moved.
 */
export const deductFinalize = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: FinalizeCommand;
}): DeductionOutcome => {
	assertCommandSupported({ fullSubject, command });
	const { lock } = command;

	// Checked before anything moves: a lock already settled, or expired, is simply gone.
	const isOpen = fullSubject.open_locks.some(
		(openLock) => openLock.id === lock.id,
	);
	if (!isOpen) throw new LockNotFoundError({ lockId: lock.lock_id });

	const { lockValue, finalValue } = finalizeCommandToValues({ command });
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
		includesCreditSystems: true,
		enforcesSpendLimit: true,
		countsUsageWindows: true,
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

	return deductOnContext({
		context,
		request: {
			...lockRequest,
			value: unwoundLockToForwardValue({ unwound, additionalValue, lockValue }),
		},
		from: unwound,
	});
};
