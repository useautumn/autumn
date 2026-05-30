export const ADMIN_REQUEST_BLOCK_CONFIG_KEY = "admin/request-block-config.json";
export const ADMIN_ROLLOUT_CONFIG_KEY = "admin/rollout-config.json";
export const ADMIN_FEATURE_FLAGS_CONFIG_KEY = "admin/feature-flags-config.json";
export const ADMIN_CUSTOMER_BLOCK_CONFIG_KEY =
	"admin/customer-block-config.json";
export const ADMIN_ORG_LIMITS_CONFIG_KEY = "admin/org-limits-config.json";
export const ADMIN_RATE_LIMIT_OVERRIDES_CONFIG_KEY =
	"admin/rate-limit-overrides-config.json";
export const ADMIN_RATE_LIMIT_REDIS_ALLOWLIST_CONFIG_KEY =
	"admin/rate-limit-redis-allowlist-config.json";
export const ADMIN_REDIS_V2_CACHE_CONFIG_KEY =
	"admin/redis-v2-cache-config.json";
export const ADMIN_CACHE_V2_RAMP_CONFIG_KEY = "admin/cache-v2-ramp-config.json";
export const ADMIN_JOB_QUEUE_CONFIG_KEY = "admin/job-queue-config.json";
export const ADMIN_MISCELLANEOUS_EDGE_CONFIG_KEY =
	"admin/miscellaneous-edge-config.json";
export const ADMIN_FULL_SUBJECT_GATE_CONFIG_KEY =
	"admin/full-subject-gate-config.json";
export const BLUE_GREEN_ACTIVE_SLOT_KEY = "admin/blue-green-active-slot.json";
export const BLUE_GREEN_CRON_ACTIVE_SLOT_KEY =
	"admin/blue-green-cron-active-slot.json";
export const BLUE_GREEN_HEARTBEAT_KEY_PREFIX = "admin/blue-green-heartbeats";

const bucket = process.env.S3_BUCKET || "autumn-prod-server";
const region = process.env.S3_REGION || "us-east-2";

export const getAdminS3Config = () => {
	return {
		bucket,
		region,
	};
};

export const getAdminEdgeConfigSources = () => ({
	...getAdminS3Config(),
	configs: [
		{
			id: "request-block",
			label: "Request Blocking",
			key: ADMIN_REQUEST_BLOCK_CONFIG_KEY,
		},
		{ id: "rollouts", label: "Rollouts", key: ADMIN_ROLLOUT_CONFIG_KEY },
		{
			id: "feature-flags",
			label: "Feature Flags",
			key: ADMIN_FEATURE_FLAGS_CONFIG_KEY,
		},
		{
			id: "customer-block",
			label: "Customer Blocking",
			key: ADMIN_CUSTOMER_BLOCK_CONFIG_KEY,
		},
		{ id: "org-limits", label: "Org Limits", key: ADMIN_ORG_LIMITS_CONFIG_KEY },
		{
			id: "rate-limit-overrides",
			label: "Rate Limit Overrides",
			key: ADMIN_RATE_LIMIT_OVERRIDES_CONFIG_KEY,
		},
		{
			id: "rate-limit-redis-allowlist",
			label: "Rate Limit Redis Allowlist",
			key: ADMIN_RATE_LIMIT_REDIS_ALLOWLIST_CONFIG_KEY,
		},
		{
			id: "redis-v2-cache",
			label: "V2 Redis Instance",
			key: ADMIN_REDIS_V2_CACHE_CONFIG_KEY,
		},
		{
			id: "cache-v2-ramp",
			label: "Cache V2 Ramp",
			key: ADMIN_CACHE_V2_RAMP_CONFIG_KEY,
		},
		{
			id: "job-queues",
			label: "Job Queues",
			key: ADMIN_JOB_QUEUE_CONFIG_KEY,
		},
		{
			id: "miscellaneous",
			label: "Miscellaneous",
			key: ADMIN_MISCELLANEOUS_EDGE_CONFIG_KEY,
		},
		{
			id: "full-subject-gate",
			label: "FullSubject Concurrency Gate",
			key: ADMIN_FULL_SUBJECT_GATE_CONFIG_KEY,
		},
		{
			id: "stripe-sync",
			label: "Stripe Sync",
			key: "admin/stripe-sync-config.json",
		},
	],
});
