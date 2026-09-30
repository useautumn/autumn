import {
	computeCheck,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import type { CheckReply, CheckRequest } from "../../types/check.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { checkRequestToCommand } from "./checkRequestToCommand.js";

/** The engine's own check, run on the rows Autumn last sent; what they cannot decide goes back to the API. */
export const check = ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: CheckRequest;
}): CheckReply => {
	const subject = ctx.sqliteStore.readSubject({
		customerId: request.customerId,
		entityId: null,
	});
	if (!subject) return { askApi: "subject_not_stored" };

	const command = checkRequestToCommand({ request, subject });
	if (!command) return { askApi: "feature_not_stored" };

	const fullSubject = subjectStateToFullSubject({
		state: subject.state,
		catalog: subject.catalog,
		entityId: null,
	});
	return { allowed: computeCheck({ fullSubject, command }).allowed };
};
