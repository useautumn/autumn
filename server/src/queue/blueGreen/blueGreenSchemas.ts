import { z } from "zod/v4";
import { AwsTaskIdentitySchema } from "@/external/aws/ecs/awsTaskIdentity.js";

export const ActiveSlotConfigSchema = z.object({
	activeTaskDefinitionArn: z.string().nullable(),
	activeImageSha: z.string().nullable(),
	flightcontrolBlueArn: z.string().nullable().optional(),
	updatedAt: z.string(),
	updatedBy: z.string().optional(),
	reason: z.string().optional(),
});
export type ActiveSlotConfig = z.infer<typeof ActiveSlotConfigSchema>;

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

export const BlueGreenProbeResultSchema = z.object({
	ok: z.boolean(),
	latencyMs: z.number(),
	error: z.string().optional(),
});
export type BlueGreenProbeResult = z.infer<typeof BlueGreenProbeResultSchema>;

export const BlueGreenReadinessHeartbeatSchema = z.object({
	serviceName: z.enum(["workers", "cron"]),
	instanceId: z.string(),
	pid: z.number(),
	identity: AwsTaskIdentitySchema,
	declaredActive: z.boolean(),
	storeHealthy: z.boolean(),
	ok: z.boolean(),
	checks: z.object({
		db: BlueGreenProbeResultSchema,
		redis: BlueGreenProbeResultSchema,
		redisV2: BlueGreenProbeResultSchema,
		sqs: BlueGreenProbeResultSchema,
	}),
	worker: z
		.object({
			lastReceivePollAt: z.string().nullable(),
			lastMessageReceivedAt: z.string().nullable(),
			messagesLastMinute: z.number(),
			queueUrls: z.array(z.string()),
		})
		.optional(),
	startedAt: z.string(),
	writtenAt: z.string(),
});
export type BlueGreenReadinessHeartbeat = z.infer<
	typeof BlueGreenReadinessHeartbeatSchema
>;
