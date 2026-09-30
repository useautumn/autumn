import type { CheckResponseV3 } from "@autumn/shared";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../types/check.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { answerCheck } from "./answerCheck.js";
import { checkRequestToAnswerableCheck } from "./checkForwardRules.js";

/** A check answered from the subject Autumn last sent, in the API's own shape. One Atom cannot decide is left to the API. */
export const check = ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: CheckRequest;
}): CheckResponseV3 => {
	const answerableCheck = checkRequestToAnswerableCheck({ request });

	const subject = readCurrentSubject({
		ctx,
		customerId: answerableCheck.customerId,
	});
	if (!subject) throw new CannotAnswerError({ reason: "customer_not_stored" });

	return answerCheck({ ctx, check: answerableCheck, subject });
};
