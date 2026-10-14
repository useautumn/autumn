import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
	computeTrackDecision,
	findLockInsertInMutation,
	type TrackCommand,
	trackResultToCheckResult,
	UnsupportedCommandError,
	type WorkerLock,
} from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/**
 * A lock is decided by its track, as the worker decides it: what applies is held, and a lock_id already open is
 * refused with LockAlreadyExistsError (worker parity). The row it would insert is what a retry is compared with.
 */
const decideLockedTrack = ({
	subject,
	command,
	track,
}: {
	subject: CurrentSubject;
	command: CheckCommand;
	track: TrackCommand;
}): { result: CheckResult; lockRow: WorkerLock | null } => {
	try {
		const { mutation } = computeTrackDecision({
			fullSubject: subject.fullSubject,
			command: track,
		});
		if (mutation.result.type !== "track")
			throw new Error(`Track ${track.commandId} decided a non-track result`);
		return {
			result: trackResultToCheckResult({
				result: mutation.result,
				requiredBalance: command.requiredBalance,
			}),
			lockRow: findLockInsertInMutation({ mutation }),
		};
	} catch (error) {
		if (error instanceof UnsupportedCommandError)
			throw new CannotAnswerError({ reason: "lock_unsupported" });
		throw error;
	}
};

/**
 * One deduction, decided by the engine's check of its value (or, for a lock, by its track) and, when allowed, appended as
 * the worker's `track`. The caller hears once `committed` resolves; one refused appends nothing, already resolved.
 */
export const deductOnSubject = ({
	ctx,
	subject,
	command,
	track,
}: {
	ctx: SlotProcessorContext;
	subject: CurrentSubject;
	command: CheckCommand;
	track: TrackCommand;
}): { result: CheckResult; committed: Promise<unknown> } => {
	const { customerId } = command.identity;
	// One that could not be written is left to the API to deduct, as is every one while the journal is backed up.
	if (ctx.journal.isBackedUp({ customerId }))
		throw new CannotAnswerError({ reason: "journal_backlog" });
	const { result, lockRow } = track.lock
		? decideLockedTrack({ subject, command, track })
		: {
				result: computeCheck({ fullSubject: subject.fullSubject, command }),
				lockRow: null,
			};
	if (!result.allowed) return { result, committed: Promise.resolve() };

	const committed = ctx.journal.append({ customerId, command: track });
	// Held from the append: a retry of it may arrive before the commit lands.
	if (lockRow) ctx.openLockRows.hold({ row: lockRow });
	return {
		result,
		committed: committed.catch(() => {
			throw new CannotAnswerError({ reason: "journal_not_written" });
		}),
	};
};
