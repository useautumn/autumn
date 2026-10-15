/** A seeded PRNG (mulberry32) for property tests: a failing run is replayed from its seed alone. */
export type Random = {
	seed: number;
	next(): number;
	chance(probability: number): boolean;
	int(min: number, max: number): number;
	pick<T>(items: readonly T[]): T;
	subset<T>(items: readonly T[]): T[];
};

export function createRandom(seed: number): Random {
	let a = seed >>> 0;
	function next(): number {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	function int(min: number, max: number): number {
		return min + Math.floor(next() * (max - min + 1));
	}
	function pick<T>(items: readonly T[]): T {
		return items[int(0, items.length - 1)] as T;
	}
	function subset<T>(items: readonly T[]): T[] {
		return items.filter(() => next() < 0.5);
	}
	return {
		seed,
		next,
		chance: (probability) => next() < probability,
		int,
		pick,
		subset,
	};
}

/** Seeds for this run: FUZZ_SEED replays one, FUZZ_RUNS widens the sweep (default small enough for CI). */
export function fuzzSeeds({ defaultRuns }: { defaultRuns: number }): number[] {
	const only = process.env.FUZZ_SEED;
	if (only) return [Number(only)];
	const runs = Number(process.env.FUZZ_RUNS ?? defaultRuns);
	const base = Number(process.env.FUZZ_BASE_SEED ?? 1);
	return Array.from({ length: runs }, (_, index) => base + index);
}
