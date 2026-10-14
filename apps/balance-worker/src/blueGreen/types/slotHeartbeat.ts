import { z } from "zod/v4";
import { ColdStartAckSchema } from "../../coldStart/types/coldStartAck.js";

export const SLOT_HEARTBEAT_KEY_PREFIX =
	"admin/blue-green-heartbeats/balance-workers";

export function slotHeartbeatKeyOf({
	fleetId,
	instanceId,
}: {
	fleetId: string;
	instanceId: string;
}): string {
	return `${SLOT_HEARTBEAT_KEY_PREFIX}/${fleetId}/${instanceId}.json`;
}

export const SlotProbeResultSchema = z.object({
	ok: z.boolean(),
	latencyMs: z.number(),
	error: z.string().optional(),
});
export type SlotProbeResult = z.infer<typeof SlotProbeResultSchema>;

export const SlotHeartbeatSchema = z.object({
	serviceName: z.literal("balance-workers"),
	fleetId: z.string(),
	deployment: z.string(),
	endpoint: z.string(),
	instanceId: z.string(),
	pid: z.number(),
	identity: z.object({
		serviceArn: z.string().nullable(),
		imageSha: z.string().nullable(),
	}),
	declaredActive: z.boolean(),
	gate: z.enum(["blue-green-disabled", "no-active-record", "active", "idle"]),
	storeHealthy: z.boolean(),
	ok: z.boolean(),
	checks: z.object({
		kafka: SlotProbeResultSchema,
		postgres: SlotProbeResultSchema,
	}),
	partitions: z.object({
		prepared: z.number(),
		ready: z.number(),
		admitted: z.number(),
		total: z.number(),
		byPartition: z.array(
			z.object({
				partition: z.number(),
				status: z.string(),
				lagRecords: z.number().nullable(),
			}),
		),
	}),
	coldStart: ColdStartAckSchema.nullable().optional(),
	startedAt: z.string(),
	writtenAt: z.string(),
});
export type SlotHeartbeat = z.infer<typeof SlotHeartbeatSchema>;
