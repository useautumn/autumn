import { subjectPushToStoredSubject } from "../lib/contracts/subjectContract.js";
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
}): SlotProcessor => ({
	check: async (params) =>
		checkResponseToJson({ response: check({ ctx, ...params }) }),
	setSubject: async (params) =>
		setSubject({ ctx, subject: subjectPushToStoredSubject(params) }),
});
