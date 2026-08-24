export type LatencyStats = {
	p50: number;
	p95: number;
	p99: number;
	max: number;
};

const ZERO_STATS: LatencyStats = { p50: 0, p95: 0, p99: 0, max: 0 };

// Percentiles by sort — nearest-rank on a copy of the samples, no dependency.
export const computeLatencyStats = ({
	samplesMs,
}: {
	samplesMs: number[];
}): LatencyStats => {
	if (samplesMs.length === 0) return ZERO_STATS;

	const sorted = [...samplesMs].sort((a, b) => a - b);
	const percentile = (p: number): number => {
		const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
		return sorted[index];
	};

	return {
		p50: percentile(0.5),
		p95: percentile(0.95),
		p99: percentile(0.99),
		max: sorted[sorted.length - 1],
	};
};
