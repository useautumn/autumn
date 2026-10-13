import { computeCheck } from "@autumn/balance-engine";
import type { CheckResponseV3 } from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { Journal } from "../../../state/journal/types/journal.js";
import type { AnswerableCheck } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { checkToCommand, renderCheck } from "../check/answerCheck.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { trackToCommand } from "./trackToCommand.js";

/**
 * A send_event check decided by the engine's own check and, when allowed, owed to Autumn as the worker's track. The
 * caller hears only once the deduction is on disk; one that could not be written is left to the API to deduct.
 */
export const answerDeductingCheck = async ({
	ctx,
	journal,
	check,
	skipEvent,
	subject,
}: {
	ctx: SlotProcessorContext;
	journal: Journal;
	check: AnswerableCheck;
	skipEvent: boolean;
	subject: CurrentSubject;
}): Promise<CheckResponseV3> => {
	const command = checkToCommand({ check, subject });
	const track = trackToCommand({ command, subject, skipEvent });
	const result = computeCheck({ fullSubject: subject.fullSubject, command });
	if (!result.allowed)
		return renderCheck({
			ctx,
			check,
			command,
			result,
			subject,
			isDeductingCheck: true,
		});

	const committed = journal.append({
		customerId: check.customerId,
		command: track,
	});
	// Read before the commit lands: this deduction and those before it, not one appended while it was in flight.
	const deducted = readCurrentSubject({
		ctx,
		customerId: check.customerId,
		entityId: check.entityId,
	});
	await committed.catch(() => {
		throw new CannotAnswerError({ reason: "journal_not_written" });
	});
	return renderCheck({
		ctx,
		check,
		command,
		result,
		subject: deducted,
		isDeductingCheck: true,
	});
};
