import {
	applyMutation,
	type Catalog,
	computeFinalize,
	computeTrack,
	LockAlreadyExistsError,
	LockNotFoundError,
	type SubjectState,
	type SubjectStateMutation,
	subjectStateToFullSubject,
	UnsupportedCommandError,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type {
	JournalEntry,
	JournaledCommand,
} from "../../../state/journal/types/journal.js";
import { timeStage } from "../../../threads/stats/stageClock.js";

const computeOwed = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: JournaledCommand;
}): SubjectStateMutation =>
	command.type === "finalize"
		? computeFinalize({ fullSubject, command })
		: computeTrack({ fullSubject, command });

/** What the worker refuses for good moves nothing: a feature nothing funds, a lock_id already open, a lock already settled. */
const isRefusedForGood = (error: unknown): boolean =>
	error instanceof UnsupportedCommandError ||
	error instanceof LockAlreadyExistsError ||
	error instanceof LockNotFoundError;

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
	stage = "engineFoldStep",
}: {
	owed: readonly JournalEntry[];
	state: SubjectState;
	catalog: Catalog;
	/** `state` already joined to `catalog`, when a cached view holds it: the first step need not build it again. */
	fullSubject?: WorkerFullSubject | null;
	/** Told each mutation applied, for a caller that keeps what a step wrote, such as a lock's row. */
	onApplied?: (mutation: SubjectStateMutation) => void;
	/** Which engine stage the replay counts to: a view's fold, or the check whether a fold carries across a push. */
	stage?: "engineFoldStep" | "engineFoldCheck";
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
			return timeStage(stage, () => {
				const mutation = computeOwed({ fullSubject, command });
				onApplied?.(mutation);
				return applyMutation({ state: current, mutation });
			});
		} catch (error) {
			if (isRefusedForGood(error)) return current;
			throw error;
		}
	}, state);
