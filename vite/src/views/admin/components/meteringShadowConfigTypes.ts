export type MeteringShadowConfig = {
	enabled: boolean;
	/** Empty means every org is mirrored. */
	orgs: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const METERING_SHADOW_DEFAULT_CONFIG: MeteringShadowConfig = {
	enabled: false,
	orgs: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export const METERING_SHADOW_QUERY_KEY = [
	"admin-edge-config",
	"metering-shadow",
] as const;
