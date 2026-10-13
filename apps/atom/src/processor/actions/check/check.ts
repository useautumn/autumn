import type { CheckResponseV3 } from "@autumn/shared";
import type { CheckRequest } from "../../types/check.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { answerCheck, answerDeductingCheck } from "./answerCheck.js";
import { checkRequestToAnswerableCheck } from "./checkForwardRules.js";

/** A check answered from the subject Autumn last sent and what Atom owes it, in the API's own shape. One Atom cannot decide is left to the API. */
export const check = async ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: CheckRequest;
}): Promise<CheckResponseV3> => {
	const { journal } = ctx;
	const answerableCheck = checkRequestToAnswerableCheck({
		request,
		writes: journal !== null,
	});

	const subject = readCurrentSubject({
		ctx,
		customerId: answerableCheck.customerId,
		entityId: answerableCheck.entityId,
	});
	// Past the forward rules, a send_event is the customer's own on a deployment that writes.
	if (journal && request.params.send_event === true)
		return answerDeductingCheck({
			ctx,
			journal,
			check: answerableCheck,
			skipEvent: request.params.skip_event === true,
			subject,
		});
	return answerCheck({ ctx, check: answerableCheck, subject });
};
