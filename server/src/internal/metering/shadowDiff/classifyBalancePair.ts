export type BalanceSide = number | null;

export type DiffClassification =
	| { kind: "match" }
	| { kind: "mismatch"; api: number; worker: number; delta: number }
	| { kind: "worker_missing"; api: number }
	| { kind: "api_missing"; worker: number };

// Pure classification over two already-fetched balances for the same
// (customer, feature) pair — no network. `null` means "no balance found for
// this pair" on that side; a present worker balance of 0 is a real reading
// (the fold found the meter and its balance is zero), not a missing one.
// `delta` is worker minus api, so a positive delta means the worker read
// high relative to the live API.
export const classifyBalancePair = ({
	apiBalance,
	workerBalance,
}: {
	apiBalance: BalanceSide;
	workerBalance: BalanceSide;
}): DiffClassification => {
	if (apiBalance === null && workerBalance === null) return { kind: "match" };
	if (apiBalance === null) {
		return { kind: "api_missing", worker: workerBalance as number };
	}
	if (workerBalance === null) {
		return { kind: "worker_missing", api: apiBalance };
	}
	if (apiBalance === workerBalance) return { kind: "match" };

	return {
		kind: "mismatch",
		api: apiBalance,
		worker: workerBalance,
		delta: workerBalance - apiBalance,
	};
};
