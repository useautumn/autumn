import { type AtomMetricsChartData, requestsOf } from "./atomMetricsChartData";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_MS = 10_000;

export type AtomRequestsHeadline =
	| { kind: "rate"; requests: number; answeredShare: number }
	| { kind: "idle"; idleFor: string }
	| { kind: "silent" };

const formatIdleFor = (ms: number) => {
	if (ms < HOUR_MS) return `${Math.max(1, Math.floor(ms / MINUTE_MS))} min`;
	if (ms < 2 * DAY_MS) return `${Math.floor(ms / HOUR_MS)}h`;
	return `${Math.floor(ms / DAY_MS)}d`;
};

export const atomRequestsHeadline = (
	chartData: AtomMetricsChartData | null,
): AtomRequestsHeadline => {
	const now = chartData?.now;
	if (!chartData || !now) return { kind: "silent" };

	const requests = requestsOf(now);
	if (requests > 0)
		return {
			kind: "rate",
			requests,
			answeredShare: (now.answered ?? 0) / requests,
		};

	const idleSince = chartData.lastTrafficAt ?? chartData.timeAxis.domain[0];
	return {
		kind: "idle",
		idleFor: formatIdleFor(now.at + WINDOW_MS - idleSince),
	};
};
