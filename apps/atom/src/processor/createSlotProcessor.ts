import { subjectPushToStoredSubject } from "../lib/contracts/subjectContract.js";
import { pushPhaseMs } from "../pushes/pushPhaseMs.js";
import { check } from "./actions/check/check.js";
import { checkResponseToJson } from "./actions/check/checkResponseToJson.js";
import {
	CHECK_TIMEOUT_MS,
	checkTimeouts,
} from "./actions/check/checkTimeouts.js";
import { setSubject } from "./actions/setSubject/setSubject.js";
import type {
	SlotProcessor,
	SlotProcessorContext,
} from "./types/slotProcessor.js";

export const createSlotProcessor = ({
	ctx,
}: {
	ctx: SlotProcessorContext;
}): SlotProcessor => ({
	check: async (params) => {
		const json = checkResponseToJson({ response: check({ ctx, ...params }) });
		// Counted on the owner, so a timeout names the thread whose customer it was.
		if (Date.now() - params.request.occurredAt >= CHECK_TIMEOUT_MS)
			checkTimeouts.count += 1;
		return json;
	},
	setSubject: async (params) => {
		const startedAt = performance.now();
		try {
			return setSubject({ ctx, subject: subjectPushToStoredSubject(params) });
		} finally {
			pushPhaseMs.owner += performance.now() - startedAt;
		}
	},
});
