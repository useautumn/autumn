import { z } from "zod/v4";

/** What a worker reports once it has handled a cold-start request; the load-test runner reads it from the heartbeat. */
export const ColdStartAckSchema = z.object({
	requestId: z.string(),
	completedAt: z.string(),
	durationMs: z.number(),
	evictedSubjects: z.number(),
	/** Still resident after the eviction: subjects pinned by a write that landed meanwhile. */
	residentSubjects: z.number(),
	/** Partitions whose eviction failed; the request counts as not handled while any are listed. */
	failedPartitions: z.array(z.number()),
});
export type ColdStartAck = z.infer<typeof ColdStartAckSchema>;
