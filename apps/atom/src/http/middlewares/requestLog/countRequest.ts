import type { ThreadCounters } from "../../../threads/stats/threadStats.js";

/** What the thread counts for /health, by route. */
const COUNTED_PATHS = {
	"/v1/balances.check": "checks",
	"/v1/subjects.set": "pushes",
	"/v1/catalog.set": "pushes",
} as const;

const isAuthenticated = ({ statusCode }: { statusCode: number }) =>
	statusCode !== 401 && statusCode !== 403;

/** Every check and push is counted; a check its key got through is also the org's traffic, and forwarded when the API answered it. */
export const countRequest = ({
	counters,
	path,
	statusCode,
	forwarded,
}: {
	counters: ThreadCounters;
	path: string;
	statusCode: number;
	forwarded: boolean;
}): void => {
	const counted = COUNTED_PATHS[path as keyof typeof COUNTED_PATHS];
	if (!counted) return;
	counters.add(counted);
	if (counted !== "checks" || !isAuthenticated({ statusCode })) return;
	counters.add("requests");
	if (forwarded) counters.add("forwarded");
};
