import { z } from "zod/v4";
import { AwsTaskIdentitySchema } from "@/external/aws/ecs/awsTaskIdentity.js";

/**
 * Single source-of-truth pointer naming which task set should consume SQS.
 * Either field is sufficient; both are populated when known so the gate has
 * redundancy. Both null = blue-green disabled (back-compat).
 */
export const ActiveSlotConfigSchema = z.object({
	activeTaskDefinitionArn: z.string().nullable(),
	activeImageSha: z.string().nullable(),
	/**
	 * Operator-maintained record of which ECS service ARN Flightcontrol
	 * currently considers Blue (Production). Dashboard-side metadata only —
	 * the autumn server gate doesn't read this. Allowed to be unset for
	 * back-compat with existing records.
	 */
	flightcontrolBlueArn: z.string().nullable().optional(),
	updatedAt: z.string(),
	updatedBy: z.string().optional(),
	reason: z.string().optional(),
});
export type ActiveSlotConfig = z.infer<typeof ActiveSlotConfigSchema>;

/** Per-process liveness record. Written every ~10s; dashboard reads + aggregates. */
export const WorkerHeartbeatSchema = z.object({
	instanceId: z.string(),
	pid: z.number(),
	identity: AwsTaskIdentitySchema,
	declaredActive: z.boolean(),
	storeHealthy: z.boolean(),
	lastReceivePollAt: z.string().nullable(),
	lastMessageReceivedAt: z.string().nullable(),
	messagesLastMinute: z.number(),
	queueUrls: z.array(z.string()),
	startedAt: z.string(),
	writtenAt: z.string(),
});
export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>;
