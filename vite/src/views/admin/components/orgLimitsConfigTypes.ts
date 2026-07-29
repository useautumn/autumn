export const DEFAULT_CUS_PRODUCT_LIMIT = 15;

export type OrgLimitsEntry = {
	maxCusProducts?: number;
};

export type OrgLimitsConfig = {
	orgs: Record<string, OrgLimitsEntry>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const ORG_LIMITS_DEFAULT_CONFIG: OrgLimitsConfig = {
	orgs: {},
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const ORG_LIMITS_QUERY_KEY = [
	"admin-edge-config",
	"org-limits",
] as const;

export const getEditableConfig = ({ config }: { config: OrgLimitsConfig }) => ({
	orgs: config.orgs,
});

export const buildOrgLimitsJsonText = ({
	config,
}: {
	config: OrgLimitsConfig;
}): string => JSON.stringify(getEditableConfig({ config }), null, 2);

export const getEntryRows = ({ config }: { config: OrgLimitsConfig }) => {
	return Object.entries(config.orgs)
		.map(([orgId, entry]) => ({
			orgId,
			maxCusProducts: entry.maxCusProducts ?? DEFAULT_CUS_PRODUCT_LIMIT,
		}))
		.sort((a, b) => a.orgId.localeCompare(b.orgId));
};

export const getStatusMessage = ({ config }: { config: OrgLimitsConfig }) => {
	if (config.configConfigured === false) {
		return `Org limits config is missing in S3, so every org uses the default of ${DEFAULT_CUS_PRODUCT_LIMIT}.`;
	}

	return config.error ?? "Saved changes reach all servers within 30 seconds.";
};
