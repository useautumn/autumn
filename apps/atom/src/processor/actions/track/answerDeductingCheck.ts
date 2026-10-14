import { computeCheck } from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { Journal } from "../../../state/journal/types/journal.js";
import { timeStage } from "../../../threads/stats/stageClock.js";
import type {
	AnswerableCheck,
	CheckDecided,
	CheckRequest,
} from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { checkToCommand, renderCheck } from "../check/answerCheck.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { trackToCommand } from "./trackToCommand.js";

/**
 * A send_event check decided by the engine's own check and, when allowed, owed to Autumn as the worker's track. The
 * caller hears only once the deduction is on disk; one that could not be written is left to the API to deduct, as is
 * every one while the customer's journal is backed up.
 */
export const answerDeductingCheck = async ({
	ctx,
	journal,
	check,
	idempotencyKey,
	kind,
	skipEvent,
	subject,
}: {
	ctx: SlotProcessorContext;
	journal: Journal;
	check: AnswerableCheck;
	idempotencyKey: string | null;
	kind: CheckRequest["kind"];
	skipEvent: boolean;
	subject: CurrentSubject;
}): Promise<CheckDecided> => {
	if (journal.isBackedUp({ customerId: check.customerId }))
		throw new CannotAnswerError({ reason: "journal_backlog" });
	const command = checkToCommand({ check, subject });
	const track = trackToCommand({
		command,
		subject,
		skipEvent,
		idempotencyKey,
		kind,
	});
	const result = timeStage("engineStep", () =>
		computeCheck({ fullSubject: subject.fullSubject, command }),
	);
	if (!result.allowed && kind === "track")
		throw new CannotAnswerError({ reason: "track_denied" });
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
