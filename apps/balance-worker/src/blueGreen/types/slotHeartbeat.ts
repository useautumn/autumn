import { z } from "zod/v4";
import { ColdStartAckSchema } from "../../coldStart/types/coldStartAck.js";

/** One object per task; the dashboard lists the fleet's prefix and sums the fresh ones. */
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

/** The server's readiness heartbeat plus what a swap needs to know about partitions. */
export const SlotHeartbeatSchema = z.object({
	serviceName: z.literal("balance-workers"),
	/** sha256(identity.serviceArn) first 8 hex; the dashboard groups by the ARN itself. */
	fleetId: z.string(),
	deployment: z.string(),
	endpoint: z.string(),
	instanceId: z.string(),
	pid: z.number(),
	identity: z.object({
		serviceArn: z.string().nullable(),
		imageSha: z.string().nullable(),
	}),
	/** The gate's answer at write time; false means ready announcements are held. */
	declaredActive: z.boolean(),
	gate: z.enum(["blue-green-disabled", "no-active-record", "active", "idle"]),
	storeHealthy: z.boolean(),
	ok: z.boolean(),
	checks: z.object({
		kafka: SlotProbeResultSchema,
		postgres: SlotProbeResultSchema,
	}),
	partitions: z.object({
		/** Prepared and holding: the dashboard's `prepared == total` preflight. */
		prepared: z.number(),
		ready: z.number(),
		/** Named owner, fencing through serving: the swap's "taken over by the target" count. */
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
	/** Absent where cold starts are not honoured; null until this worker handles its first request. */
	coldStart: ColdStartAckSchema.nullable().optional(),
	startedAt: z.string(),
	writtenAt: z.string(),
});
export type SlotHeartbeat = z.infer<typeof SlotHeartbeatSchema>;
