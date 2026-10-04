import { variant } from "@autumn/edge-config";
import type { PartitionWriterLimits } from "../processor/writer/types/partitionWriter.js";

/** ATMN-603: B keeps two appends on the wire per partition and settles them in log order; A waits for each. */
export const COMMIT_DEPTH_EXPERIMENT = "commit-depth";

export function commitDepthArm() {
	return variant(COMMIT_DEPTH_EXPERIMENT);
}

/** Appends the writer may have in flight this window: the configured depth under arm B, otherwise one. */
export function commitPipelineDepthOf({
	limits,
}: {
	limits: Pick<PartitionWriterLimits, "commitPipelineDepth">;
}): number {
	const configured = limits.commitPipelineDepth ?? 1;
	if (configured <= 1) return 1;
	return commitDepthArm() === "B" ? configured : 1;
}
