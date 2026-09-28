import { SlotProbeResultSchema } from "@autumn/blue-green";
import { z } from "zod/v4";

/** What one job's consumer is doing in its group; `joined` is what a swap counts. */
export const JobMembershipSchema = z.enum([
	"idle",
	"joining",
	"joined",
	"leaving",
]);
export type JobMembership = z.infer<typeof JobMembershipSchema>;

export const JobHealthSchema = z.object({
	name: z.string(),
	membership: JobMembershipSchema,
	partitions: z.number(),
	maxLagRecords: z.number().nullable(),
});
export type JobHealth = z.infer<typeof JobHealthSchema>;

/** One object per task, in both slot states; the dashboard reads `ok` before a flip and `jobs.joined` after. */
export const HeraldHeartbeatSchema = z.object({
	serviceName: z.literal("herald"),
	fleetId: z.string(),
	deployment: z.string(),
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
		eventsDb: SlotProbeResultSchema,
		miscCache: SlotProbeResultSchema,
	}),
	jobs: z.object({
		total: z.number(),
		joined: z.number(),
		byJob: z.array(JobHealthSchema),
	}),
	startedAt: z.string(),
	writtenAt: z.string(),
});
export type HeraldHeartbeat = z.infer<typeof HeraldHeartbeatSchema>;
