import type { CatalogRow } from "@autumn/balance-engine";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";

/** One data folder: its customers, reached through the slot each lives in, and the one catalog they share. */
export type Slots = {
	processorFor(params: { customerId: string }): SlotProcessor;
	/** False when the catalog was read before the one held, and so ignored. */
	setCatalog(params: { rows: CatalogRow[]; readAt: number }): boolean;
	close(): void;
};
