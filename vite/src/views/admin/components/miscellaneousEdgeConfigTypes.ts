export type MiscellaneousEdgeConfig = {
	newFlatCusModel: string[];
	syncCoalesce: boolean;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const MISCELLANEOUS_DEFAULT_CONFIG: MiscellaneousEdgeConfig = {
	newFlatCusModel: [],
	syncCoalesce: false,
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const MISCELLANEOUS_EDGE_CONFIG_QUERY_KEY = [
	"admin-edge-config",
	"miscellaneous",
] as const;

export const buildMiscellaneousJsonText = ({
	config,
}: {
	config: MiscellaneousEdgeConfig;
}): string => {
	const {
		configHealthy: _configHealthy,
		configConfigured: _configConfigured,
		lastSuccessAt: _lastSuccessAt,
		error: _error,
		...flagsOnly
	} = config;
	return JSON.stringify(flagsOnly, null, 2);
};

export const getStatusMessage = ({
	config,
}: {
	config: MiscellaneousEdgeConfig;
}) => {
	if (config.configConfigured === false) {
		return "Miscellaneous config is missing in S3, so every switch below stays off.";
	}

	return config.error ?? "Saved changes reach all servers within 10 seconds.";
};
