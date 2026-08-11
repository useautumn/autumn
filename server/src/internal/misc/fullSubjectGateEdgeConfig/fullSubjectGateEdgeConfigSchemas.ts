import { z } from "zod/v4";

// Defaults are deliberately loose — initial deploy is effectively a no-op
// for normal traffic. Tighten to target values (15 / 30) via the admin API
// after observing real load via OTel metrics. See runbook in PR description.
export const FullSubjectGateEdgeConfigSchema = z.object({
	per_customer_limit: z.number().int().min(1).max(10_000).default(200),
	per_org_limit: z.number().int().min(1).max(10_000).default(500),
	// Max time a request can wait at the gate before being rejected with 429.
	// Set generously by default; tighten once we have wait_ms p99 data.
	max_wait_ms: z.number().int().min(100).max(60_000).default(2_000),
	// Max number of queued (pending) requests per (org,env,customer) and
	// (org,env) before rejecting new ones with 429 — bounds memory + wait time.
	per_customer_pending_max: z.number().int().min(1).max(100_000).default(500),
	per_org_pending_max: z.number().int().min(1).max(100_000).default(1_000),
	// Caps above are cluster-wide targets; each process enforces
	// target / fleet_process_count. Default 1 = per-process (no-op).
	fleet_process_count: z.number().int().min(1).max(100_000).default(1),
	// Replica-lane budgets; the top-level numbers stay the primary lane's.
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
	// 0 = steady-state reads stay primary-only (dark by default, flipped via edge config).
	read_split: z
		.object({
			replica_share: z.number().min(0).max(1).default(0),
		})
		.prefault({}),
	// Delayed duplicates reuse the general pool and are capped per process so
	// a shared DB incident cannot multiply load without bound.
	primary_hydration_hedge: z
		.object({
			enabled: z.boolean().default(true),
			hedge_after_ms: z.number().int().min(500).max(1_500).default(1_000),
			max_in_flight_per_process: z.number().int().min(1).max(10).default(1),
		})
		.prefault({}),
});

export type FullSubjectGateEdgeConfig = z.infer<
	typeof FullSubjectGateEdgeConfigSchema
>;
