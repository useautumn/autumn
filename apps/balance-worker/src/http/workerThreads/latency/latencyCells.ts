const BUCKETS = 96;
const SLOTS = BUCKETS + 1;
const MAX_SLOT = BUCKETS;
const BUCKETS_PER_DOUBLING = 4;

export type LatencyPercentiles = {
	p50: number;
	p99: number;
	max: number;
	count: number;
};

export function createLatencyCells({ routes }: { routes: number }) {
	return new SharedArrayBuffer(routes * SLOTS * Int32Array.BYTES_PER_ELEMENT);
}

export function recordLatency({
	cells,
	route,
	micros,
}: {
	cells: Int32Array;
	route: number;
	micros: number;
}): void {
	const base = route * SLOTS;
	const bucket = Math.min(
		BUCKETS - 1,
		Math.floor(Math.log2(micros + 1) * BUCKETS_PER_DOUBLING),
	);
	Atomics.add(cells, base + bucket, 1);
	const whole = Math.min(Math.round(micros), 0x7fffffff);
	let max = Atomics.load(cells, base + MAX_SLOT);
	while (whole > max) {
		const seen = Atomics.compareExchange(cells, base + MAX_SLOT, max, whole);
		if (seen === max) return;
		max = seen;
	}
}

export function drainLatency({
	cells,
	route,
}: {
	cells: Int32Array;
	route: number;
}): LatencyPercentiles | null {
	const base = route * SLOTS;
	const counts = new Array<number>(BUCKETS);
	let count = 0;
	for (let bucket = 0; bucket < BUCKETS; bucket++) {
		counts[bucket] = Atomics.exchange(cells, base + bucket, 0);
		count += counts[bucket] as number;
	}
	const maxMicros = Atomics.exchange(cells, base + MAX_SLOT, 0);
	if (count === 0) return null;
	return {
		p50: msOf(bucketAt({ counts, rank: Math.ceil(count * 0.5) })),
		p99: msOf(bucketAt({ counts, rank: Math.ceil(count * 0.99) })),
		max: Math.round(maxMicros / 10) / 100,
		count,
	};
}

function bucketAt({ counts, rank }: { counts: number[]; rank: number }) {
	let seen = 0;
	for (let bucket = 0; bucket < BUCKETS; bucket++) {
		seen += counts[bucket] as number;
		if (seen >= rank) return bucket;
	}
	return BUCKETS - 1;
}

function msOf(bucket: number): number {
	const upperMicros = 2 ** ((bucket + 1) / BUCKETS_PER_DOUBLING) - 1;
	return Math.round(upperMicros / 10) / 100;
}
