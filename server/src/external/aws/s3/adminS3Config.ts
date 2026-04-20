export const ADMIN_REQUEST_BLOCK_CONFIG_KEY = "admin/request-block-config.json";
export const ADMIN_ROLLOUT_CONFIG_KEY = "admin/rollout-config.json";
export const ADMIN_FEATURE_FLAGS_CONFIG_KEY = "admin/feature-flags-config.json";
export const ADMIN_CUSTOMER_BLOCK_CONFIG_KEY =
	"admin/customer-block-config.json";
export const ADMIN_ORG_LIMITS_CONFIG_KEY = "admin/org-limits-config.json";

const bucket = process.env.S3_BUCKET || "autumn-prod-server";
const region = process.env.S3_REGION || "us-east-2";

export const getAdminS3Config = () => {
	return {
		bucket,
		region,
	};
};
