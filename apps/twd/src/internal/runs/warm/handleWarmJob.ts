import type { JobHandler } from "../../jobs/types/jobHandler.ts";

/** payload: { sha, branch }. Builds + publishes tw-warm:<sha12>. OWNED BY THE RUNS TASK. */
export const handleWarmJob: JobHandler = async () => {
	throw new Error("handleWarmJob: not implemented");
};
