import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
	type TrackCommand,
} from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import { callerKeyOf } from "../../../state/journal/callerKeyOf.js";
import { timeStage } from "../../../threads/stats/stageClock.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { DuplicateIdempotencyKeyError } from "./duplicateIdempotencyKeyError.js";

/**
 * One deduction, decided by the engine's check of its value and, when allowed, appended as the worker's `track`. The
 * caller hears once `committed` resolves; one refused appends nothing, and its `committed` is already resolved.
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
	/** The caller's key as it sent it, named in the 409. */
	idempotencyKey: string | null;
}): { result: CheckResult; committed: Promise<unknown> } => {
	const { customerId } = command.identity;
	// No await from here to the append, so a twin on this thread sees this one's key in flight.
	const claimKey = callerKeyOf({ command: track });
	if (claimKey && ctx.journal.holdsKey({ customerId, key: claimKey }))
		throw new DuplicateIdempotencyKeyError({ key: idempotencyKey ?? claimKey });
	// One that could not be written is left to the API to deduct, as is every one while the journal is backed up.
	if (ctx.journal.isBackedUp({ customerId }))
		throw new CannotAnswerError({ reason: "journal_backlog" });
	const result = timeStage("engineDecision", () =>
		computeCheck({ fullSubject: subject.fullSubject, command }),
	);
	if (!result.allowed) return { result, committed: Promise.resolve() };

	const committed = ctx.journal.append({ customerId, command: track });
	return {
		result,
		committed: committed.catch(() => {
			throw new CannotAnswerError({ reason: "journal_not_written" });
		}),
	};
};
