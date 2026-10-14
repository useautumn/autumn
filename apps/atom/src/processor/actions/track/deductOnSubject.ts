import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
	type TrackCommand,
} from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";

/**
 * One deduction, decided by the engine's check of its value and, when allowed, owed to Autumn as the worker's `track`.
 * Resolves once it is on disk, with the subject it leaves; one refused leaves the subject as it was.
 */
export const deductOnSubject = async ({
	ctx,
	subject,
	command,
	track,
}: {
	ctx: SlotProcessorContext;
	subject: CurrentSubject;
	command: CheckCommand;
	track: TrackCommand;
}): Promise<{ result: CheckResult; deducted: CurrentSubject }> => {
	const { customerId, entityId } = command.identity;
	// One that could not be written is left to the API to deduct, as is every one while the journal is backed up.
	if (ctx.journal.isBackedUp({ customerId }))
		throw new CannotAnswerError({ reason: "journal_backlog" });
	const result = computeCheck({ fullSubject: subject.fullSubject, command });
	if (!result.allowed) return { result, deducted: subject };

	const committed = ctx.journal.append({ customerId, command: track });
	// Read before the commit lands: this deduction and those before it, not one appended while it was in flight.
	const deducted = readCurrentSubject({ ctx, customerId, entityId });
	await committed.catch(() => {
		throw new CannotAnswerError({ reason: "journal_not_written" });
	});
	return { result, deducted };
};
