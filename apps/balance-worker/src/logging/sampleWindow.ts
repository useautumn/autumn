export function sampleInto({
	samples,
	value,
	seen,
	limit,
}: {
	samples: number[];
	value: number;
	seen: number;
	limit: number;
}): void {
	if (samples.length < limit) {
		samples.push(value);
		return;
	}
	const slot = Math.floor(Math.random() * seen);
	if (slot < limit) samples[slot] = value;
}

export function percentileOf({
	sorted,
	fraction,
}: {
	sorted: number[];
	fraction: number;
}): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(fraction * sorted.length) - 1),
	);
	return sorted[index] ?? 0;
}
