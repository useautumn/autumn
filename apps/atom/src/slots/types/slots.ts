import type { SlotProcessor } from "../../processor/types/slotProcessor.js";

/** One data folder's customers, reached through the slot each customer lives in. */
export type Slots = {
	processorFor(params: { customerId: string }): SlotProcessor;
	close(): void;
};
