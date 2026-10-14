import {
	applyMutation,
	type Catalog,
	computeTrack,
	type SubjectState,
	subjectStateToFullSubject,
	UnsupportedCommandError,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import { timeStage } from "../../../threads/stats/stageClock.js";

/**
 * The snapshot with each owed command applied as the balance worker applies it: decided on the rows so far, then applied.
 * A command the worker would refuse moves nothing here either.
 */
export const replayOwed = ({
	owed,
	state,
	catalog,
	fullSubject: stateFullSubject = null,
	stage = "engineFoldStep",
}: {
	owed: readonly JournalEntry[];
	state: SubjectState;
	catalog: Catalog;
	/** `state` already joined to `catalog`, when a cached view holds it: the first step need not build it again. */
	fullSubject?: WorkerFullSubject | null;
	/** Which engine stage the replay counts to: a view's fold, or the check whether a fold carries across a push. */
	stage?: "engineFoldStep" | "engineFoldCheck" | "engineFoldRebuild";
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
			return timeStage(stage, () =>
				applyMutation({
					state: current,
					mutation: computeTrack({ fullSubject, command }),
				}),
			);
		} catch (error) {
			if (error instanceof UnsupportedCommandError) return current;
			throw error;
		}
	}, state);
