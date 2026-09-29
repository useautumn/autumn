import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type { LoggedEvictCommand } from "./types/evictCommand.js";

/** The evict as a log record: nothing moves, and the rows it names are no longer resident after it. */
export const computeEvict = ({
	state,
	command,
}: {
	/** What was resident when it was dropped; null when the customer was not held. */
	state: SubjectState | null;
	command: LoggedEvictCommand;
}): SubjectStateMutation => {
	const revisionBefore = state?.revision ?? 0;
	return {
		schemaVersion: 1,
		type: "mutation",
		id: command.commandId,
		identity: command.identity,
		...(state && {
			subject: {
				internalCustomerId: state.customer.internal_id,
				internalEntityId: null,
			},
		}),
		revision: { before: revisionBefore, after: revisionBefore + 1 },
		command,
		changes: [],
		result: { type: "evict" },
	};
};
