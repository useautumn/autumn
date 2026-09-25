import { deduct } from "../../deduction/deduct.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import {
	LockAlreadyExistsError,
	UnsupportedCommandError,
} from "../../errors.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { isPaidAllocatedV1Deduction } from "../../deduction/utils/classifyDeductionUtils.js";
import { trackCommandToDeductionRequest } from "./trackCommandToDeductionRequest.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** The deduction a track makes, refused before anything is written when the worker cannot carry it. */
export const deductTrack = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): DeductionOutcome => {
	assertCommandSupported({ fullSubject, command });

	// Checked before the deduction: a duplicate lock deducts nothing and writes nothing.
	const lockId = command.lock?.lockId;
	const holdsLock = fullSubject.open_locks.some(
		(openLock) => openLock.lock_id === lockId,
	);
	if (lockId && holdsLock) throw new LockAlreadyExistsError({ lockId });

	const outcome = deduct({
		fullSubject,
		request: trackCommandToDeductionRequest({ command }),
	});
	if (
		outcome.context.customerEntitlements.length === 0 &&
		!outcome.context.overdueBlocked
	) {
		throw new UnsupportedCommandError({ reason: "feature_not_found" });
	}
	if (isPaidAllocatedV1Deduction({ outcome })) {
		throw new UnsupportedCommandError({
			reason: "paid_allocated_not_supported",
		});
	}
	return outcome;
};
