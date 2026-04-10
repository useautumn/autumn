export const ADMIN_REQUEST_BLOCK_CONFIG_KEY = "admin/request-block-config.json";
export const ADMIN_FEATURE_FLAGS_CONFIG_KEY = "admin/feature-flags-config.json";
export const ADMIN_CUSTOMER_BLOCK_CONFIG_KEY =
	"admin/customer-block-config.json";
export const ADMIN_ORG_LIMITS_CONFIG_KEY = "admin/org-limits-config.json";

type AdminS3Target = "dev" | "prod";

const isDevTarget = ({ target }: { target?: AdminS3Target }) => {
	if (target) return target === "dev";
	return (
		process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development"
	);
};

export const getAdminS3Config = ({
	target,
}: {
	target?: AdminS3Target;
} = {}) => {
	if (isDevTarget({ target })) {
		return {
			bucket: "autumn-dev-server",
			region: "eu-west-2",
		};
	}

	return {
		bucket: "autumn-prod-server",
		region: "us-east-2",
	};
};
