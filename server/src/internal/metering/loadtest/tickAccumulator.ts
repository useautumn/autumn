// Fixed-tick batch sizing for load-test schedulers. A rate in events/sec
// rarely divides evenly into a tick interval (e.g. 13 events/sec at a 50ms
// tick is 0.65 events/tick), so this carries the fractional remainder
// forward instead of rounding every tick — cumulative sent count tracks
// ratePerSec * elapsedTime with no long-run drift.
export const createTickAccumulator = ({
	ratePerSec,
	tickIntervalMs,
}: {
	ratePerSec: number;
	tickIntervalMs: number;
}): { next: () => number } => {
	const perTick = Math.max(0, (ratePerSec * tickIntervalMs) / 1000);
	let carry = 0;

	return {
		next: (): number => {
			carry += perTick;
			const batchSize = Math.floor(carry);
			carry -= batchSize;
			return batchSize;
		},
	};
};
