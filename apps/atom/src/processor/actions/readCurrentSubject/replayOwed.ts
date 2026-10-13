import {
	applyMutation,
	type Catalog,
	computeTrack,
	type SubjectState,
	subjectStateToFullSubject,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";

/**
 * The snapshot with each owed command applied as the balance worker applies it: decided on the rows so far, then applied.
 * A command the worker would refuse moves nothing here either.
 */
export const replayOwed = ({
	owed,
	state,
	catalog,
}: {
	owed: readonly JournalEntry[];
	state: SubjectState;
	catalog: Catalog;
}): SubjectState =>
	owed.reduce((current, { command }) => {
		const fullSubject = subjectStateToFullSubject({
			state: current,
			catalog,
			entityId: command.identity.entityId,
		});
		try {
			return applyMutation({
				state: current,
				mutation: computeTrack({ fullSubject, command }),
			});
		} catch (error) {
			if (error instanceof UnsupportedCommandError) return current;
			throw error;
		}
	}, state);
