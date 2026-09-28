import type { JobHandler } from "../../jobs/types/jobHandler.ts";

/** payload: { runId }. OWNED BY THE RUNS TASK. */
export const handleSwarmJob: JobHandler = async () => {
	throw new Error("handleSwarmJob: not implemented");
};
