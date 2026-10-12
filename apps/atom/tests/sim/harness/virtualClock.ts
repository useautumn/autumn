/** mulberry32: a small seeded generator; the same seed replays the same run. */
export const createSeededRandom = (seed: number) => {
	let state = seed >>> 0;
	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		next,
		int: (min: number, max: number) =>
			min + Math.floor(next() * (max - min + 1)),
		chance: (probability: number) => next() < probability,
		pick: <T>(items: readonly T[]): T =>
			items[Math.floor(next() * items.length)] as T,
	};
};

export type SeededRandom = ReturnType<typeof createSeededRandom>;

type Wake = { at: number; seq: number; resolve: () => void };

/**
 * Discrete time: every wait registers a wake, and `run` fires wakes in order, letting the promise chains
 * between them settle before the clock moves. Nothing in a simulated run touches a real timer.
 */
export const createVirtualClock = ({
	startAt = 1_700_000_000_000,
}: {
	startAt?: number;
} = {}) => {
	let now = startAt;
	let seq = 0;
	let wakes: Wake[] = [];

	const sleep = (ms: number): Promise<void> =>
		new Promise((resolve) => {
			wakes.push({ at: now + Math.max(0, ms), seq: seq++, resolve });
		});

	/** Lets every promise chain run to its next wait: a few macrotask turns, until nothing new was scheduled. */
	const settle = async (): Promise<void> => {
		for (let turn = 0; turn < 50; turn++) {
			const before = seq;
			await new Promise<void>((resolve) => setImmediate(resolve));
			await new Promise<void>((resolve) => setImmediate(resolve));
			if (seq === before) return;
		}
	};

	/** Advances to `until`, firing every wake due by then in order. */
	const run = async (ms: number): Promise<void> => {
		const until = now + ms;
		await settle();
		for (;;) {
			wakes.sort((a, b) => a.at - b.at || a.seq - b.seq);
			const next = wakes[0];
			if (!next || next.at > until) break;
			wakes = wakes.slice(1);
			now = Math.max(now, next.at);
			next.resolve();
			await settle();
		}
		now = until;
	};

	return { now: () => now, sleep, run, settle, pending: () => wakes.length };
};

export type VirtualClock = ReturnType<typeof createVirtualClock>;
