import { deduct } from "../../deduction/deduct.js";
import { UnsupportedCommandError } from "../../errors.js";
import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { assertCommandSupported } from "../common/assertCommandSupported.js";
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

	return trackOutcomeToMutation({
		command,
		outcome,
		revisionBefore: fullSubject.revision,
	});
};
