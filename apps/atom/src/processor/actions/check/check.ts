import type { CheckResponseV3 } from "@autumn/shared";
import type { CheckRequest } from "../../types/check.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";
import { answerCheck } from "./answerCheck.js";
import { checkRequestToAnswerableCheck } from "./checkForwardRules.js";

/** A check answered from the subject Autumn last sent, in the API's own shape, with whose it was. One Atom cannot decide is left to the API. */
export const check = ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: CheckRequest;
}): { response: CheckResponseV3; orgId: string; featureId: string } => {
	const answerableCheck = checkRequestToAnswerableCheck({ request });

	const subject = readCurrentSubject({
		ctx,
		customerId: answerableCheck.customerId,
		entityId: answerableCheck.entityId,
	});
	return {
		response: answerCheck({ ctx, check: answerableCheck, subject }),
		orgId: subject.fullSubject.identity.orgId,
		featureId: answerableCheck.featureId,
	};
};
