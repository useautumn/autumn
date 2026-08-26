/** Counters for the single server that answered the request, not the fleet: a
 *  zero here means "not this box", never "nothing mirrored anywhere". */
export type MeteringShadowRuntime = {
	tapBuilt: boolean;
	producerState: "idle" | "connected" | "disabled";
	queueDepth: number;
	dropped: number;
	mirrored: number;
	lastError: string | null;
	lastSendAt: string | null;
};

export type MeteringShadowConfig = {
	enabled: boolean;
	/** Empty means every org is mirrored. */
	orgs: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
	runtime: MeteringShadowRuntime;
};

export const METERING_SHADOW_DEFAULT_CONFIG: MeteringShadowConfig = {
	enabled: false,
	orgs: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
	runtime: {
		tapBuilt: false,
		producerState: "disabled",
		queueDepth: 0,
		dropped: 0,
		mirrored: 0,
		lastError: null,
		lastSendAt: null,
	},
};

export const METERING_SHADOW_QUERY_KEY = [
	"admin-edge-config",
	"metering-shadow",
] as const;
