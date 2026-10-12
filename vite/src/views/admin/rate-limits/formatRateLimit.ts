import type {
	RateLimitLayerSummary,
	RateLimitPolicyOverride,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

const WINDOW_LABELS: Record<number, string> = { 1000: "s", 60000: "min" };

export const formatCount = (count: number) =>
	count >= 1000 ? `${Number((count / 1000).toFixed(1))}k` : `${count}`;

export const formatWindow = (windowMs: number) =>
	WINDOW_LABELS[windowMs] ?? `${windowMs / 1000}s`;

export const formatLimit = ({
	limit,
	windowMs,
}: {
	limit: number;
	windowMs: number;
}) => `${formatCount(limit)}/${formatWindow(windowMs)}`;

/** An org's override values on a row: per customer first, then per org. */
export const formatOverrideValues = ({
	policy,
	override,
}: {
	policy: RateLimitPolicySummary;
	override: RateLimitPolicyOverride;
}) =>
	(["perCustomer", "perOrg"] as const).flatMap((scope) => {
		const layer = policy[scope];
		const value = override[scope];
		if (!layer || value === undefined) return [];
		return [formatLimit({ limit: value, windowMs: layer.windowMs })];
	});

/** A 0 endpoint cap answers every request with a 429. */
export const formatEndpointLimit = ({
	limit,
	windowMs,
}: {
	limit: number;
	windowMs: number;
}) => (limit === 0 ? "blocked" : formatLimit({ limit, windowMs }));

export const formatVersion = (version: string) => version.replace(/\.0$/, "");

export const formatPolicyLabel = (id: string) => {
	if (id === "general") return "Everything else";
	const words = id.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Version limits that differ from the layer's default, e.g. "2.3 · 50/s". */
export const formatVersionLimits = ({
	layer,
}: {
	layer: RateLimitLayerSummary;
}) =>
	layer.versionLimits
		.filter(({ limit }) => limit !== layer.limit)
		.map(
			({ upTo, limit }) =>
				`${formatVersion(upTo)} · ${formatLimit({ limit, windowMs: layer.windowMs })}`,
		);

export const STORE_LABELS: Record<RateLimitLayerSummary["store"], string> = {
	redis: "All pods (Redis)",
	memory: "Per pod (memory), so the real ceiling is limit × pods",
};

export const OVER_LIMIT_LABELS: Record<
	RateLimitLayerSummary["overLimit"],
	string
> = {
	reject: "429",
	degrade: "Served degraded: track queues, check fails open, reads 429",
};
