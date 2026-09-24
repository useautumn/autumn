const TOTAL_RPS = 20;
const TOTAL_IN_FLIGHT = 8;

export const stripeBudgetForRun = ({
	workers,
	keys,
}: {
	workers: number;
	keys: number;
}) => {
	if (
		!Number.isInteger(workers) ||
		workers < 1 ||
		!Number.isInteger(keys) ||
		keys < 1
	) {
		throw new Error("Stripe budget requires positive worker and key counts");
	}
	const workersPerKey = Math.ceil(workers / keys);
	const maxInFlight = Math.floor(TOTAL_IN_FLIGHT / workersPerKey);
	if (maxInFlight < 2) {
		throw new Error(
			`Stripe budget supports at most ${keys * 4} workers; reduce --max or add pool keys`,
		);
	}
	return { maxRps: TOTAL_RPS / workersPerKey, maxInFlight };
};
