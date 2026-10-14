import type { AnswerableCheck, CheckDecided } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { checkToCommand, renderCheck } from "../check/answerCheck.js";
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
	const { result, deducted } = await deductOnSubject({
		ctx,
		subject,
		command,
		track: checkToTrackCommand({ command, subject, skipEvent, idempotencyKey }),
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
