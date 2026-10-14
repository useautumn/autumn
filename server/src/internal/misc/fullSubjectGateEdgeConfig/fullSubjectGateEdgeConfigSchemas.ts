import { z } from "zod/v4";

export const FullSubjectGateEdgeConfigSchema = z.object({
	per_customer_limit: z.number().int().min(1).max(10_000).default(200),
	per_org_limit: z.number().int().min(1).max(10_000).default(500),
	max_wait_ms: z.number().int().min(100).max(60_000).default(2_000),
	per_customer_pending_max: z.number().int().min(1).max(100_000).default(500),
	per_org_pending_max: z.number().int().min(1).max(100_000).default(1_000),
	fleet_process_count: z.number().int().min(1).max(100_000).default(1),
	replica_lane: z
		.object({
			per_customer_limit: z.number().int().min(1).max(10_000).default(540),
			per_org_limit: z.number().int().min(1).max(10_000).default(810),
			per_customer_pending_max: z
				.number()
				.int()
				.min(1)
				.max(100_000)
				.default(1_500),
			per_org_pending_max: z.number().int().min(1).max(100_000).default(3_000),
		})
		.prefault({}),
	read_split: z
		.object({
			replica_share: z.number().min(0).max(1).default(0),
		})
		.prefault({}),
	delayed_postgres_backup_read: z
		.object({
			enabled: z.boolean().default(true),
			delay_ms: z.number().int().min(500).max(1_500).default(1_000),
			max_in_flight_per_process: z.number().int().min(1).max(10).default(1),
		})
		.prefault({}),
});

export type FullSubjectGateEdgeConfig = z.infer<
	typeof FullSubjectGateEdgeConfigSchema
>;
