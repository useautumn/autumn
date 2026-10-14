import {
	applyMutation,
	type Catalog,
	computeTrack,
	LockAlreadyExistsError,
	type SubjectState,
	type SubjectStateMutation,
	subjectStateToFullSubject,
	UnsupportedCommandError,
	type WorkerFullSubject,
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
	fullSubject: stateFullSubject = null,
	onApplied,
}: {
	owed: readonly JournalEntry[];
	state: SubjectState;
	catalog: Catalog;
	/** `state` already joined to `catalog`, when a cached view holds it: the first step need not build it again. */
	fullSubject?: WorkerFullSubject | null;
	/** Told each mutation applied, for a caller that keeps what a step wrote, such as a lock's row. */
	onApplied?: (mutation: SubjectStateMutation) => void;
}): SubjectState =>
	owed.reduce((current, { command }) => {
		const fullSubject =
			current === state && stateFullSubject
				? stateFullSubject
				: subjectStateToFullSubject({
						state: current,
						catalog,
						entityId: command.identity.entityId,
					});
		try {
			const mutation = computeTrack({ fullSubject, command });
			onApplied?.(mutation);
			return applyMutation({ state: current, mutation });
		} catch (error) {
			if (
				error instanceof UnsupportedCommandError ||
				error instanceof LockAlreadyExistsError
			)
				return current;
			throw error;
		}
	}, state);
