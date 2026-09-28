import type { JobHandler } from "../../jobs/types/jobHandler.ts";

/** payload: { platformAccountId }. OWNED BY THE ACCOUNTS TASK. */
export const handleFullNukeKeyJob: JobHandler = async () => {
	throw new Error("handleFullNukeKeyJob: not implemented");
};
