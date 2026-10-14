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
import { heldLockRowOf } from "../lock/heldLockRowOf.js";

/**
 * A lock is decided by its track, as the API decides it. A lock_id already open is compared with this Atom's own row
 * for it: the same terms are the same lock, nothing moves and nothing is journaled; other terms are a conflict. One
 * open without a row here (the API's own) cannot be compared, so the API decides it.
 */
const decideLockedTrack = ({
	ctx,
	subject,
	command,
	track,
	lockId,
}: {
	ctx: SlotProcessorContext;
	subject: CurrentSubject;
	command: CheckCommand;
	track: TrackCommand;
	lockId: string;
}): { result: CheckResult; lockRow: WorkerLock | null; isRetry: boolean } => {
	const { fullSubject } = subject;
	const isRetry = fullSubject.open_locks.some(
		(openLock) => openLock.lock_id === lockId,
	);
	const heldLock = isRetry
		? heldLockRowOf({ ctx, customerId: command.identity.customerId, lockId })
		: null;
	if (isRetry && !heldLock)
		throw new CannotAnswerError({ reason: "lock_not_held" });
	try {
		// Throws LockTermsConflictError for a retry on other terms.
		const { mutation } = computeTrackDecision({
			fullSubject,
			command: track,
			heldLock,
		});
		if (mutation.result.type !== "track")
			throw new Error(`Track ${track.commandId} decided a non-track result`);
		return {
			result: trackResultToCheckResult({
				result: mutation.result,
				requiredBalance: command.requiredBalance,
			}),
			lockRow: findLockInsertInMutation({ mutation }),
			isRetry,
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
	const { result, lockRow, isRetry } = track.lock
		? decideLockedTrack({
				ctx,
				subject,
				command,
				track,
				lockId: track.lock.lockId,
			})
		: {
				result: computeCheck({ fullSubject: subject.fullSubject, command }),
				lockRow: null,
				isRetry: false,
			};
	if (!result.allowed || isRetry)
		return { result, committed: Promise.resolve() };

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
