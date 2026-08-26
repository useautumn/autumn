/** An org listed in `orgModes` is opted in, so `off` is not one of its values —
 *  remove the entry and the org falls back to `defaultMode`. */
export type MeteringRoutingOrgMode = "shadow" | "serve_reads" | "full";

export type MeteringRoutingMode = "off" | MeteringRoutingOrgMode;

export type MeteringRoutingConfig = {
	orgModes: Record<string, MeteringRoutingOrgMode>;
	defaultMode: MeteringRoutingMode;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
	/** Without METERING_WORKER_URL on the deploy, no mode here does anything. */
	workerUrlConfigured: boolean;
};

export type MeteringRoutingPayload = Pick<
	MeteringRoutingConfig,
	"orgModes" | "defaultMode"
>;

export const METERING_ROUTING_DEFAULT_CONFIG: MeteringRoutingConfig = {
	orgModes: {},
	defaultMode: "off",
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
	workerUrlConfigured: false,
};

export const METERING_ROUTING_MODE_OPTIONS: {
	value: MeteringRoutingMode;
	label: string;
	description: string;
}[] = [
	{
		value: "off",
		label: "Off",
		description: "Check and track stay on Redis.",
	},
	{
		value: "shadow",
		label: "Shadow",
		description: "Mirrored only; serving is identical to off.",
	},
	{
		value: "serve_reads",
		label: "Serve reads",
		description: "Check answered by the worker, track stays on Redis.",
	},
	{
		value: "full",
		label: "Full",
		description: "Worker owns check and track; Redis is dual-written behind.",
	},
];

export const METERING_ROUTING_ORG_MODE_OPTIONS =
	METERING_ROUTING_MODE_OPTIONS.filter((option) => option.value !== "off");

export const METERING_ROUTING_QUERY_KEY = [
	"admin-edge-config",
	"metering-routing",
] as const;
