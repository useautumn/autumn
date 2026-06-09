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

	critical_db_admission_enabled: z.boolean().default(false),
	critical_db_share: z.number().min(0.1).max(1).default(0.7),
	critical_db_reserve: z.number().int().min(0).max(1_000).default(2),
});

export type FullSubjectGateEdgeConfig = z.infer<
	typeof FullSubjectGateEdgeConfigSchema
>;
