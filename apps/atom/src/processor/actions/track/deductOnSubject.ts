import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
	type TrackCommand,
} from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/**
 * One deduction, decided by the engine's check of its value and, when allowed, appended as the worker's `track`. The
 * caller hears once `committed` resolves; one refused appends nothing, and its `committed` is already resolved.
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
	const result = computeCheck({ fullSubject: subject.fullSubject, command });
	if (!result.allowed) return { result, committed: Promise.resolve() };

	const committed = ctx.journal.append({ customerId, command: track });
	return {
		result,
		committed: committed.catch(() => {
			throw new CannotAnswerError({ reason: "journal_not_written" });
		}),
	};
};
