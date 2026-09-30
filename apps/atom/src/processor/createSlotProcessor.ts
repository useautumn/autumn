import { check } from "./actions/check/check.js";
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
	check: (params) => check({ ctx, ...params }),
	setSubject: (params) => setSubject({ ctx, ...params }),
});
