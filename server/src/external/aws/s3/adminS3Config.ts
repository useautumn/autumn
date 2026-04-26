export const ADMIN_REQUEST_BLOCK_CONFIG_KEY = "admin/request-block-config.json";
export const ADMIN_ROLLOUT_CONFIG_KEY = "admin/rollout-config.json";
export const ADMIN_FEATURE_FLAGS_CONFIG_KEY = "admin/feature-flags-config.json";
export const ADMIN_CUSTOMER_BLOCK_CONFIG_KEY =
	"admin/customer-block-config.json";
export const ADMIN_ORG_LIMITS_CONFIG_KEY = "admin/org-limits-config.json";
export const ADMIN_REDIS_V2_CACHE_CONFIG_KEY =
	"admin/redis-v2-cache-config.json";
export const ADMIN_JOB_QUEUE_CONFIG_KEY = "admin/job-queue-config.json";
export const BLUE_GREEN_ACTIVE_SLOT_KEY = "admin/blue-green-active-slot.json";
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
			id: "redis-v2-cache",
			label: "V2 Redis Instance",
			key: ADMIN_REDIS_V2_CACHE_CONFIG_KEY,
		},
		{
			id: "job-queues",
			label: "Job Queues",
			key: ADMIN_JOB_QUEUE_CONFIG_KEY,
		},
		{
			id: "stripe-sync",
			label: "Stripe Sync",
			key: "admin/stripe-sync-config.json",
		},
	],
});
