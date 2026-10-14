import type { SubjectStateMutation } from "../../models/mutation/subjectStateMutation.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type { LoggedEvictCommand } from "./types/evictCommand.js";

export const computeEvict = ({
	state,
	command,
}: {
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
