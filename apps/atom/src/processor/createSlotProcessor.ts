import { subjectPushToStoredSubject } from "../lib/contracts/subjectContract.js";
import { CannotAnswerError } from "../lib/forward/cannotAnswerError.js";
import { check } from "./actions/check/check.js";
import { checkResponseToJson } from "./actions/check/checkResponseToJson.js";
import { setSubject } from "./actions/setSubject/setSubject.js";
import type {
	SlotProcessor,
	SlotProcessorContext,
} from "./types/slotProcessor.js";

export const createSlotProcessor = ({
	ctx,
}: {
	ctx: SlotProcessorContext;
}): SlotProcessor => {
	/** Customers whose latest push failed to store (a full or failing disk): their rows are older than what Autumn sent. */
	const unwritten = new Set<string>();

	return {
		check: async ({ request }) => {
			const { customer_id: customerId, entity_id: entityId } = request.params;
			if (unwritten.has(customerId)) {
				ctx.subjectPulls.request({ customerId, entityId: entityId ?? null });
				throw new CannotAnswerError({ reason: "subject_not_written" });
			}
			const { response, result } = await check({ ctx, request });
			return {
				json: checkResponseToJson({ response }),
				allowed: response.allowed,
				denial: response.allowed
					? null
					: { reason: result.reason, limitType: result.limitType },
			};
		},
		setSubject: async (params) => {
			const subject = subjectPushToStoredSubject(params);
			try {
				const stored = setSubject({ ctx, subject });
				unwritten.delete(params.customerId);
				return stored;
			} catch (error) {
				unwritten.add(params.customerId);
				throw error;
			}
		},
	};
};
