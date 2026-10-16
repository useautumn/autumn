import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type {
	FinalizeRequest,
	FinalizeResponse,
	UndecidedFinalizeCommand,
} from "../../types/finalize.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/** The request as the journal keeps it: the lock and the value its action names, nothing read to go with them. */
const finalizeRequestToUndecided = ({
	request: { requestId, occurredAt, params },
}: {
	request: FinalizeRequest;
}): UndecidedFinalizeCommand => ({
	type: "undecidedFinalize",
	requestId,
	occurredAt,
	customerId: params.customer_id,
	lockId: params.lock_id,
	finalValue: params.action === "release" ? 0 : (params.override_value ?? null),
	properties: params.properties ?? null,
});

/**
 * A finalize appended to the customer's journal as sent, behind whatever lock this slot took, and answered once the
 * append commits. Autumn decides it where the journal lands, after the lock: a lock it holds no row for is refused
 * there, logged, and answered success here all the same.
 */
export const undecidedFinalize = async ({
	ctx,
	request,
}: {
	ctx: SlotProcessorContext;
	request: FinalizeRequest;
}): Promise<FinalizeResponse> => {
	const command = finalizeRequestToUndecided({ request });
	await ctx.journal
		.append({ customerId: command.customerId, command })
		.catch(() => {
			throw new CannotAnswerError({ reason: "journal_not_written" });
		});
	return { success: true };
};
