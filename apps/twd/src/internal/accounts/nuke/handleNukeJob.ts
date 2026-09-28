import type { JobHandler } from "../../jobs/types/jobHandler.ts";

/** payload: { accountId }. Cleans the account, flips it back to clean. OWNED BY THE KEYS TASK. */
export const handleNukeJob: JobHandler = async () => {
	throw new Error("handleNukeJob: not implemented");
};
