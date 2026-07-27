export type OrgAllowlistEdgeConfig = {
	enabledOrgIds: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const ORG_ALLOWLIST_DEFAULT_CONFIG: OrgAllowlistEdgeConfig = {
	enabledOrgIds: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const buildOrgAllowlistJsonText = ({
	config,
}: {
	config: OrgAllowlistEdgeConfig;
}): string => JSON.stringify({ enabledOrgIds: config.enabledOrgIds }, null, 2);
