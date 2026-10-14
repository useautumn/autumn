import { z } from "zod/v4";

export const ColdStartAckSchema = z.object({
	requestId: z.string(),
	completedAt: z.string(),
	durationMs: z.number(),
	evictedSubjects: z.number(),
	keptSubjects: z.number(),
	residentSubjects: z.number(),
	failedPartitions: z.array(z.number()),
});
export type ColdStartAck = z.infer<typeof ColdStartAckSchema>;
