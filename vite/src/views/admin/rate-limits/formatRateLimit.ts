import type { RateLimitLayerSummary } from "./rateLimitTypes";

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

export const COUNTED_LABELS: Record<RateLimitLayerSummary["counted"], string> =
	{
		allPods: "All pods (Redis)",
		perPod: "Per pod (memory); Redis for allowlisted customers",
	};

export const OVER_LIMIT_LABELS: Record<
	RateLimitLayerSummary["overLimit"],
	string
> = {
	reject: "429",
	degrade: "Still served via the fallback path",
	rejectAndQueueCreate: "429; customer creates queued for replay",
};
