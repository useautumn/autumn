import { deductWithContext } from "../../deduction/deduct.js";
import { setupDeductionContext } from "../../deduction/setup/setupDeductionContext.js";
import type { DeductionContext } from "../../deduction/types/deductionContext.js";
import type { DeductionDecision } from "../../deduction/types/deductionDecision.js";
import type { DeductionOutcome } from "../../deduction/types/deductionOutcome.js";
import type { DeductionRequest } from "../../deduction/types/deductionRequest.js";
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
	context,
	revision = fullSubject.revision,
	request = trackCommandToDeductionRequest({ command }),
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand;
	/** Set up (or advanced) for this command's selection on the state being decided; set up here when absent. */
	context?: DeductionContext;
	/** The state's revision, when `fullSubject` is an earlier view of it that differs only in balances. */
	revision?: number;
	/** The command's request when the caller already built it (to read a carried context). */
	request?: DeductionRequest;
}): DeductionDecision => {
	assertCommandSupported({ fullSubject, command });

	// Checked before the deduction: a duplicate lock deducts nothing and writes nothing.
	const lockId = command.lock?.lockId;
	const holdsLock = fullSubject.open_locks.some(
		(openLock) => openLock.lock_id === lockId,
	);
	if (lockId && holdsLock) throw new LockAlreadyExistsError({ lockId });

	const outcome = deductWithContext({
		context:
			context ??
			setupDeductionContext({ fullSubject, selection: request.selection }),
		request,
	});
	// A plain track nothing funds applies as a no-op, as on legacy, so its usage event is still recorded.
	if (fundsNothing({ outcome }) && isDeductingCheck({ command })) {
		throw new UnsupportedCommandError({ reason: "feature_not_found" });
	}
	if (isPaidAllocatedV1Deduction({ outcome })) {
		throw new UnsupportedCommandError({
			reason: "paid_allocated_not_supported",
		});
	}

	return {
		mutation: trackOutcomeToMutation({
			command,
			outcome,
			fullSubject,
			revision,
		}),
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
