import { deduct } from "../../deduction/deduct.js";
import {
	LockAlreadyExistsError,
	UnsupportedCommandError,
} from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { isPaidAllocatedV1Deduction } from "./isPaidAllocatedV1Deduction.js";
import { trackCommandToDeductionRequest } from "./trackCommandToDeductionRequest.js";
import { trackOutcomeToMutation } from "./trackOutcomeToMutation.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** Pure: the same subject and command always yield the same mutation. Dedup is the writer's job. */
export const computeTrack = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): SubjectStateMutation => {
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

	return trackOutcomeToMutation({
		command,
		outcome,
		fullSubject,
	});
};
