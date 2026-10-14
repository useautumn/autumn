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
import { assertCommandSupported } from "../common/assertCommandSupported.js";
import { trackCommandToDeductionRequest } from "./trackCommandToDeductionRequest.js";
import { trackOutcomeToMutation } from "./trackOutcomeToMutation.js";
import type { TrackCommand } from "./types/trackCommand.js";

const fundsNothing = ({ outcome }: { outcome: DeductionOutcome }): boolean =>
	outcome.context.customerEntitlements.length === 0 &&
	!outcome.context.overdueBlocked;

const isDeductingCheck = ({ command }: { command: TrackCommand }): boolean =>
	command.enforceOverdueBlock === true;

export const computeTrackDecision = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
}): DeductionDecision => {
	assertCommandSupported({ fullSubject, command });

	const lockId = command.lock?.lockId;
	const holdsLock = fullSubject.open_locks.some(
		(openLock) => openLock.lock_id === lockId,
	);
	if (lockId && holdsLock) throw new LockAlreadyExistsError({ lockId });

	const outcome = deduct({
		fullSubject,
		request: trackCommandToDeductionRequest({ command }),
	});
	if (fundsNothing({ outcome }) && isDeductingCheck({ command })) {
		throw new UnsupportedCommandError({ reason: "feature_not_found" });
	}
	if (isPaidAllocatedV1Deduction({ outcome })) {
		throw new UnsupportedCommandError({
			reason: "paid_allocated_not_supported",
		});
	}

	return {
		mutation: trackOutcomeToMutation({ command, outcome, fullSubject }),
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
