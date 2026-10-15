import type { CheckDecided, CheckRequest } from "../../types/check.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { answerDeductingCheck } from "../track/answerDeductingCheck.js";
import { answerCheck } from "./answerCheck.js";
import { checkRequestToAnswerableCheck } from "./checkForwardRules.js";

/** A check answered from the subject Autumn last sent, in the API's own shape. One Atom cannot decide is left to the API. */
export const check = async ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: CheckRequest;
}): Promise<CheckDecided> => {
	const answerableCheck = checkRequestToAnswerableCheck({ request });

	const subject = readCurrentSubject({
		ctx,
		customerId: answerableCheck.customerId,
		entityId: answerableCheck.entityId,
	});
	// Past the forward rules, a send_event or a lock is the customer's own, and deducts as the API's does.
	if (request.params.send_event === true || answerableCheck.lock)
		return answerDeductingCheck({
			ctx,
			check: answerableCheck,
			idempotencyKey: request.idempotencyKey,
			skipEvent: request.params.skip_event === true,
			subject,
		});
	return answerCheck({ ctx, check: answerableCheck, subject });
};
