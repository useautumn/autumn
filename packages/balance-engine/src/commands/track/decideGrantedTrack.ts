import type { Catalog } from "../../models/catalog/catalog.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { applyMutation } from "../../mutation/applyMutation.js";
import { subjectStateToFullSubject } from "../../utils/subjectUtils/convertSubjectUtils.js";
import { computeTrackDecision } from "./computeTrack.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** A track decided on the subject a grant was given against, or null unless it applies in full: what a server answers inside a grant. */
export const decideGrantedTrack = ({
	state,
	catalog,
	command,
}: {
	state: SubjectState;
	catalog: Catalog;
	command: TrackCommand;
}) => {
	try {
		const { mutation, outcome } = computeTrackDecision({
			fullSubject: subjectStateToFullSubject({ state, catalog }),
			command,
		});
		const { result } = mutation;
		if (result.type !== "track" || result.status !== "applied") return null;
		if (outcome.appliedValue !== command.value) return null;
		return {
			result,
			changes: mutation.changes,
			state: applyMutation({ state, mutation }),
		};
	} catch {
		return null;
	}
};

export type GrantedTrackDecision = NonNullable<
	ReturnType<typeof decideGrantedTrack>
>;
