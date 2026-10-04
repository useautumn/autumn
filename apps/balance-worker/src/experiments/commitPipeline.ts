import { variant } from "@autumn/edge-config";

/** ATMN-601 lever 2: B lingers commits adaptively, C coalesces store flushes, D turns commit log lines into counters. */
export const COMMIT_PIPELINE_EXPERIMENT = "commit-pipeline";

export function commitPipelineArm() {
	return variant(COMMIT_PIPELINE_EXPERIMENT);
}
