import type { AppEnv, AuthType } from "@autumn/shared";

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

	query: Record<string, string>;
	body: unknown;

	name: string;
	route?: string;
};

export type InternalLogRequestContext = Omit<LogRequestContext, "body">;

export type LogAppContext = {
	org_id: string;
	org_slug: string;
	env: AppEnv;
	auth_type: AuthType;

	customer_id?: string;
	entity_id?: string;
	user_id?: string;
	api_key_id?: string;
	user_email?: string;
	impersonated_by?: string;
	api_version: string;
	scopes?: string[];
	full_subject_bucket?: number;
	balance_worker_rollout_enabled?: boolean;
};

export type LogStripeEventContext = {
	id: string;
	type: string;
	object_id: string;
};

export type LogRevenueCatEventContext = {
	id?: string;
	type?: string;
	app_user_id?: string;
	original_app_user_id?: string;
	product_id?: string;
	transferred_from?: string[];
	transferred_to?: string[];
};

export type LogVercelEventContext = {
	id?: string;
	type?: string;
	installation_id?: string;
	invoice_id?: string;
	external_invoice_id?: string;
	resource_id?: string;
};

export type LogWorkflowContext = {
	id: string;
	payload: unknown;
	name: string;
};

export type LogTriggerContext = {
	run_id: string;
	task_id: string;
	attempt_number?: number;
};

export type LogRedisData = {
	operation: string;
	duration_ms: number;
	slow_ms: number;
	base_slow_ms: number;
	region_baseline_ms: number;
	severe_ms: number;
	breach_ratio: number;
	region?: string;
	redis_type?: string;
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
