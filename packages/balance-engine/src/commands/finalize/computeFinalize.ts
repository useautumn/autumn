import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { WorkerFullSubject } from "../../models/subject/workerFullSubject.js";
import { deductFinalize } from "./deductFinalize.js";
import { finalizeOutcomeToMutation } from "./finalizeOutcomeToMutation.js";
import type { FinalizeCommand } from "./types/finalizeCommand.js";

/** Settles a lock. Both halves of the settlement are deltas, so the row changes come from the same converter a track uses. */
export const computeFinalize = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: FinalizeCommand;
}): SubjectStateMutation =>
	finalizeOutcomeToMutation({
		command,
		outcome: deductFinalize({ fullSubject, command }),
		fullSubject,
	});
