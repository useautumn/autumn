import {
	type CheckCommand,
	type CheckResult,
	callerKeyOf,
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
import { DuplicateIdempotencyKeyError } from "./duplicateIdempotencyKeyError.js";
import { isSameLock, LockTermsConflictError } from "./lockTerms.js";

/**
 * A lock is decided by its track, as the worker decides it: what applies is held, and a lock_id already open is
 * refused with LockAlreadyExistsError (worker parity, D2).
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
	idempotencyKey,
}: {
	ctx: SlotProcessorContext;
	subject: CurrentSubject;
	command: CheckCommand;
	track: TrackCommand;
	/** As the caller sent it, for the 409's message. */
	idempotencyKey: string | null;
}): { result: CheckResult; committed: Promise<unknown> } => {
	const { customerId } = command.identity;
	// First, as the API's middleware runs first: a duplicate never reaches the API through a backlog, nor D2's allowed.
	const claimKey = callerKeyOf({ command: track });
	if (claimKey && ctx.journal.holdsKey({ customerId, key: claimKey }))
		throw new DuplicateIdempotencyKeyError({
			key: idempotencyKey ?? claimKey,
		});
	// One that could not be written is left to the API to deduct, as is every one while the journal is backed up.
	if (ctx.journal.isBackedUp({ customerId }))
		throw new CannotAnswerError({ reason: "journal_backlog" });
	// D2: a lock_id this slot took is the same lock on its terms (nothing moves or is journaled), a conflict on any other.
	const lockId = track.lock?.lockId;
	// Only while the lock is still open in the view: one this slot already settled is taken anew.
	const isOpen = subject.fullSubject.open_locks.some(
		(openLock) => openLock.lock_id === lockId,
	);
	const held =
		lockId && isOpen
			? ctx.openLocks.trackOf({
					customerId,
					lockId,
					owed: ctx.journal.owed({ customerId }),
				})
			: null;
	if (lockId && held) {
		if (!isSameLock({ held, retry: track }))
			throw new LockTermsConflictError({ lockId });
		const answer = computeCheck({ fullSubject: subject.fullSubject, command });
		return {
			result: { ...answer, allowed: true, reason: null, limitType: null },
			committed: Promise.resolve(),
		};
	}
	const { result, lockRow } = track.lock
		? decideLockedTrack({ subject, command, track })
		: {
				result: computeCheck({ fullSubject: subject.fullSubject, command }),
				lockRow: null,
			};
	if (!result.allowed) return { result, committed: Promise.resolve() };

	const committed = ctx.journal.append({ customerId, command: track });
	// Held from the append: a retry or a finalize may arrive before the commit lands, and the journal orders a finalize after it.
	if (lockRow) ctx.openLocks.hold({ track, row: lockRow });
	return {
		result,
		committed: committed.catch(() => {
			throw new CannotAnswerError({ reason: "journal_not_written" });
		}),
	};
};
