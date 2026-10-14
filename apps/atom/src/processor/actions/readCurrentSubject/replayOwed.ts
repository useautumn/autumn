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

/**
 * The snapshot after each owed command in turn, applied as the balance worker applies it: decided on the rows so far,
 * then applied. A command the worker would refuse moves nothing here either, so its entry repeats the state before it.
 */
export const replayOwedSteps = ({
	owed,
	state,
	catalog,
	fullSubject: stateFullSubject = null,
}: {
	owed: readonly JournalEntry[];
	state: SubjectState;
	catalog: Catalog;
	/** `state` already joined to `catalog`, when a cached view holds it: the first step need not build it again. */
	fullSubject?: WorkerFullSubject | null;
}): SubjectState[] => {
	const steps: SubjectState[] = [];
	let current = state;
	for (const { command } of owed) {
		const fullSubject =
			current === state && stateFullSubject
				? stateFullSubject
				: subjectStateToFullSubject({
						state: current,
						catalog,
						entityId: command.identity.entityId,
					});
		try {
			current = applyMutation({
				state: current,
				mutation: computeTrack({ fullSubject, command }),
			});
		} catch (error) {
			if (!(error instanceof UnsupportedCommandError)) throw error;
		}
		steps.push(current);
	}
	return steps;
};

/** The snapshot with every owed command applied. */
export const replayOwed = (
	params: Parameters<typeof replayOwedSteps>[0],
): SubjectState => replayOwedSteps(params).at(-1) ?? params.state;
