export type DurationStats = {
	count: number;
	avg: number;
	min: number;
	p50: number;
	p90: number;
	max: number;
};

const percentile = ({
	sorted,
	fraction,
}: {
	sorted: number[];
	fraction: number;
}): number =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
	0;

export const summarizeDurations = (values: number[]): DurationStats => {
	const sorted = [...values].sort((a, b) => a - b);
	const total = sorted.reduce((sum, value) => sum + value, 0);
	return {
		count: sorted.length,
		avg: total / Math.max(1, sorted.length),
		min: sorted[0] ?? 0,
		p50: percentile({ sorted, fraction: 0.5 }),
		p90: percentile({ sorted, fraction: 0.9 }),
		max: sorted.at(-1) ?? 0,
	};
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export const formatDurations = (stats: DurationStats): string =>
	`avg ${seconds(stats.avg)} · p50 ${seconds(stats.p50)} · p90 ${seconds(stats.p90)} · max ${seconds(stats.max)}`;
