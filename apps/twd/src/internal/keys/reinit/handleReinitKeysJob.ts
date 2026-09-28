import type { JobHandler } from "../../jobs/types/jobHandler.ts";

/** Drain → delete webhooks on TW_V3_KEYS → register → re-probe → open. OWNED BY THE KEYS TASK. */
export const handleReinitKeysJob: JobHandler = async () => {
	throw new Error("handleReinitKeysJob: not implemented");
};
