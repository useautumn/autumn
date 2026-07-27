export type StripeSyncConfig = {
	enabledOrgIds: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const STRIPE_SYNC_DEFAULT_CONFIG: StripeSyncConfig = {
	enabledOrgIds: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const STRIPE_SYNC_QUERY_KEY = [
	"admin-edge-config",
	"stripe-sync",
] as const;

export const buildStripeSyncJsonText = ({
	config,
}: {
	config: StripeSyncConfig;
}): string => JSON.stringify({ enabledOrgIds: config.enabledOrgIds }, null, 2);

export const getStripeSyncStatusMessage = ({
	config,
}: {
	config: StripeSyncConfig;
}) => {
	if (config.configConfigured === false) {
		return "Stripe sync config is missing in S3, so sync stays off for every org.";
	}

	return config.error ?? "Saved changes reach all servers within 60 seconds.";
};
