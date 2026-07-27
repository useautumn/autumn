export type RequestBlockOrgEntry = {
	blockAll: boolean;
	blockedEndpoints: { method: string; pattern: string }[];
	updatedAt: string;
	updatedBy?: string;
};

export type RequestBlockFullConfig = {
	orgs: Record<string, RequestBlockOrgEntry>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const RAW_REQUEST_BLOCK_QUERY_KEY = [
	"admin-edge-config",
	"request-block-raw",
] as const;

export const stripConfigStatusFields = (config: RequestBlockFullConfig) => {
	const {
		configHealthy: _configHealthy,
		configConfigured: _configConfigured,
		lastSuccessAt: _lastSuccessAt,
		error: _error,
		...configData
	} = config;
	return configData;
};
