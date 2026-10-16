import { deduct } from "../../deduction/deduct.js";
import type { DeductionDecision } from "../../deduction/types/deductionDecision.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import { isPaidAllocatedV1Deduction } from "../../deduction/utils/classifyDeductionUtils.js";
import {
	LockAlreadyExistsError,
	UnsupportedCommandError,
} from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { findOpenLockByLockId } from "../../utils/subjectStateUtils/openLockIndex.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { trackCommandToDeductionRequest } from "./trackCommandToDeductionRequest.js";
import { trackOutcomeToMutation } from "./trackOutcomeToMutation.js";
import { atomReplayAsNothing } from "./trackSourceToRowChange.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** No grant funds the feature; an overdue block that removed every grant is a refusal instead. */
const fundsNothing = ({ outcome }: { outcome: DeductionOutcome }): boolean =>
	outcome.context.customerEntitlements.length === 0 &&
	!outcome.context.overdueBlocked;

/** Only a check that deducts enforces the overdue block; nothing funding it means "not attached", not usage. */
const isDeductingCheck = ({ command }: { command: TrackCommand }): boolean =>
	command.enforceOverdueBlock === true;

/** Pure: the same subject and command always yield the same decision. Dedup is the writer's job. */
export const computeTrackDecision = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): DeductionDecision => {
	const track = atomReplayAsNothing({
		command,
		customer: fullSubject.customer,
	});
	assertCommandSupported({ fullSubject, command: track });

	// Checked before the deduction: a duplicate lock deducts nothing and writes nothing.
	const lockId = track.lock?.lockId;
	const holdsLock =
		lockId !== undefined &&
		findOpenLockByLockId({ openLocks: fullSubject.open_locks, lockId }) !==
			null;
	if (lockId && holdsLock) throw new LockAlreadyExistsError({ lockId });

	const outcome = deduct({
		fullSubject,
		request: trackCommandToDeductionRequest({ command: track }),
	});
	// A plain track nothing funds applies as a no-op, as on legacy, so its usage event is still recorded.
	if (fundsNothing({ outcome }) && isDeductingCheck({ command: track })) {
		throw new UnsupportedCommandError({ reason: "feature_not_found" });
	}
	if (isPaidAllocatedV1Deduction({ outcome })) {
		throw new UnsupportedCommandError({
			reason: "paid_allocated_not_supported",
		});
	}

	return {
		mutation: trackOutcomeToMutation({ command: track, outcome, fullSubject }),
		outcome,
	};
};

export const computeTrack = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): SubjectStateMutation =>
	computeTrackDecision({ fullSubject, command }).mutation;
