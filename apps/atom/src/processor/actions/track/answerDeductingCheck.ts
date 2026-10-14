import type { AnswerableCheck, CheckDecided } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { checkToCommand, renderCheck } from "../check/answerCheck.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { deductOnSubject } from "./deductOnSubject.js";
import { checkToTrackCommand } from "./trackToCommand.js";

/** A send_event check deducted here, answered once it is on disk with the subject it leaves. */
export const answerDeductingCheck = async ({
	ctx,
	check,
	idempotencyKey,
	skipEvent,
	subject,
}: {
	ctx: SlotProcessorContext;
	check: AnswerableCheck;
	idempotencyKey: string | null;
	skipEvent: boolean;
	subject: CurrentSubject;
}): Promise<CheckDecided> => {
	const command = checkToCommand({ check, subject });
	const { result, committed } = deductOnSubject({
		ctx,
		subject,
		command,
		idempotencyKey,
		track: checkToTrackCommand({
			command,
			subject,
			skipEvent,
			idempotencyKey,
			lock: check.lock,
		}),
	});
	// Read before the commit lands: this deduction and those before it, not one appended while it was in flight.
	const deducted = result.allowed
		? readCurrentSubject({
				ctx,
				customerId: check.customerId,
				entityId: check.entityId,
			})
		: subject;
	await committed;
	return renderCheck({
		ctx,
		check,
		command,
		result,
		subject: deducted,
		isDeductingCheck: true,
	});
};
