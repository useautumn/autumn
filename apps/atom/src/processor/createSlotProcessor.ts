import { deletePushToDeletedSubject } from "../lib/contracts/deleteSubjectContract.js";
import { subjectPushToStoredSubject } from "../lib/contracts/subjectContract.js";
import { CannotAnswerError } from "../lib/forward/cannotAnswerError.js";
import { check } from "./actions/check/check.js";
import { checkResponseToJson } from "./actions/check/checkResponseToJson.js";
import { deleteSubject } from "./actions/deleteSubject/deleteSubject.js";
import { finalize } from "./actions/finalize/finalize.js";
import { setSubject } from "./actions/setSubject/setSubject.js";
import { track } from "./actions/track/track.js";
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

	const refuseUnwritten = ({
		customer_id: customerId,
		entity_id: entityId,
	}: {
		customer_id: string;
		entity_id?: string;
	}) => {
		if (!unwritten.has(customerId)) return;
		ctx.subjectPulls.request({ customerId, entityId: entityId ?? null });
		throw new CannotAnswerError({ reason: "subject_not_written" });
	};

	return {
		check: async ({ request }) => {
			refuseUnwritten(request.params);
			const { response, result } = await check({ ctx, request });
			return {
				json: checkResponseToJson({ response }),
				allowed: response.allowed,
				denial: response.allowed
					? null
					: { reason: result.reason, limitType: result.limitType },
			};
		},
		track: async ({ request }) => {
			refuseUnwritten(request.params);
			return track({ ctx, request });
		},
		finalize: async ({ request }) => {
			refuseUnwritten(request.params);
			return finalize({ ctx, request });
		},
		setSubject: async (params) => {
			const subject = subjectPushToStoredSubject(params);
			try {
				const stored = setSubject({ ctx, subject });
				unwritten.delete(params.customerId);
				return { stored, entityId: subject.state.identity.entityId ?? null };
			} catch (error) {
				unwritten.add(params.customerId);
				throw error;
			}
		},
		deleteSubject: async (params) =>
			deleteSubject({ ctx, subject: deletePushToDeletedSubject(params) }),
	};
};
