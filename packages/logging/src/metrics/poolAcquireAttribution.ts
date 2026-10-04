/** Per-key wait samples kept for the p99; `n` and `waitMs` keep counting past it. */
const SAMPLES_PER_KEY = 256;
/** Distinct route × reason keys per window; anything past it folds into one overflow row. */
const MAX_KEYS = 64;
/** Rows emitted per window, busiest first; the totals still cover every key. */
const MAX_ROWS = 20;
const OVERFLOW_ROUTE = "(overflow)";

type KeyStats = {
	route: string;
	reason: string;
	n: number;
	errors: number;
	waitMs: number;
	waitMaxMs: number;
	observed: number;
	samples: number[];
};

const round = (value: number) => Math.round(value * 10) / 10;

/** Algorithm R: `samples` stays a uniform sample of every observed wait. */
const sampleWait = ({
	stats,
	waitMs,
	random,
}: {
	stats: KeyStats;
	waitMs: number;
	random: () => number;
}) => {
	stats.observed++;
	if (stats.samples.length < SAMPLES_PER_KEY) {
		stats.samples.push(waitMs);
		return;
	}
	const slot = Math.floor(random() * stats.observed);
	if (slot < SAMPLES_PER_KEY) stats.samples[slot] = waitMs;
};

const p99Of = (samples: number[]) => {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))];
};

/** Pool checkouts per route × reason over one window: count, errors, and acquire wait (sum, max, sampled p99). */
export function createPoolAcquireAttribution({
	random = Math.random,
}: {
	random?: () => number;
} = {}) {
	let byKey = new Map<string, KeyStats>();

	const statsFor = ({ route, reason }: { route: string; reason: string }) => {
		const key = `${route}\u0000${reason}`;
		const existing = byKey.get(key);
		if (existing) return existing;
		const overflow = byKey.size >= MAX_KEYS;
		const target = overflow
			? { route: OVERFLOW_ROUTE, reason: "mixed" }
			: { route, reason };
		const targetKey = `${target.route}\u0000${target.reason}`;
		const found = byKey.get(targetKey);
		if (found) return found;
		const created: KeyStats = {
			...target,
			n: 0,
			errors: 0,
			waitMs: 0,
			waitMaxMs: 0,
			observed: 0,
			samples: [],
		};
		byKey.set(targetKey, created);
		return created;
	};

	const record = ({
		route,
		reason,
		waitMs,
		failed = false,
	}: {
		route: string;
		reason: string;
		waitMs: number;
		failed?: boolean;
	}) => {
		const stats = statsFor({ route, reason });
		stats.n++;
		if (failed) stats.errors++;
		stats.waitMs += waitMs;
		stats.waitMaxMs = Math.max(stats.waitMaxMs, waitMs);
		sampleWait({ stats, waitMs, random });
	};

	/** The window's rows (busiest first) and totals, then a fresh window; null when nothing was recorded. */
	const drain = () => {
		const all = [...byKey.values()];
		byKey = new Map();
		if (all.length === 0) return null;
		const rows = all
			.sort((a, b) => b.n - a.n)
			.slice(0, MAX_ROWS)
			.map((stats) => ({
				route: stats.route,
				reason: stats.reason,
				n: stats.n,
				errors: stats.errors,
				waitMs: round(stats.waitMs),
				waitMaxMs: round(stats.waitMaxMs),
				waitP99Ms: round(p99Of(stats.samples)),
			}));
		return {
			n: all.reduce((sum, stats) => sum + stats.n, 0),
			waitMs: round(all.reduce((sum, stats) => sum + stats.waitMs, 0)),
			keys: all.length,
			rows,
		};
	};

	return { record, drain };
}

export type PoolAcquireAttribution = ReturnType<
	typeof createPoolAcquireAttribution
>;
