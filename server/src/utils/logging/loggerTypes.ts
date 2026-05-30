import type { AppEnv, AuthType } from "@autumn/shared";

/** Request-level metadata - emits as req.* fields. */
export type LogRequestContext = {
	id: string;
	method: string;
	url: string;
	timestamp: number;
	customer_id?: string;
	entity_id?: string;

	user_agent?: string;
	ip_address?: string;

	region?: string;

	// New fields
	query: Record<string, string>;
	body: unknown;

	name: string;
};

/** App context - emits as context.* fields. */
export type LogAppContext = {
	org_id: string;
	org_slug: string;
	env: AppEnv;
	auth_type: AuthType;

	customer_id?: string;
	entity_id?: string;
	user_id?: string;
	user_email?: string;
	api_version: string;
	scopes?: string[];
	full_subject_bucket?: number;
	full_subject_rollout_enabled?: boolean;
};

/** Stripe webhook event context */
export type LogStripeEventContext = {
	id: string;
	type: string;
	object_id: string;
};

/** Vercel webhook event context */
export type LogVercelEventContext = {
	id?: string;
	type?: string;
	installation_id?: string;
	invoice_id?: string;
	external_invoice_id?: string;
	resource_id?: string;
};

/** Background worker context */
export type LogWorkflowContext = {
	id: string;
	payload: unknown;
	name: string; // workflow / job name
};

/** trigger.dev run context — goes under context.trigger */
export type LogTriggerContext = {
	run_id: string;
	task_id: string;
	attempt_number?: number;
};

/** Redis slow-command context - goes under context.redis.data (map field) */
export type LogRedisData = {
	operation: string;
	duration_ms: number;
	slow_ms: number;
	base_slow_ms: number;
	region_baseline_ms: number;
	severe_ms: number;
	breach_ratio: number;
	region?: string;
	key?: string;
	org_id?: string;
	customer_id?: string;
	entity_id?: string;
};

export type AlertSeverity = "warning" | "error" | "critical";

export type AlertCategory =
	| "redis"
	| "db"
	| "worker"
	| "cache"
	| "billing"
	| "system";
