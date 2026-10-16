import type { RigConfig } from "./rigConfig.js";

const Z_P99 = 2.3263;
const Z_P999 = 3.0902;

/** A standard normal draw (Box–Muller). */
const normal = (): number =>
	Math.sqrt(-2 * Math.log(1 - Math.random())) *
	Math.cos(2 * Math.PI * Math.random());

/** Samples a log-normal fitted to its p50 and p99. */
export const logNormalOf = ({ p50, p99 }: { p50: number; p99: number }) => {
	const sigma = Math.log(p99 / p50) / Z_P99;
	return () => p50 * Math.exp(sigma * normal());
};

/** One draw of a customer's rate: log-normal through p50 and p99, its tail steepened to pass through p99.9. */
export const drawCustomerRate = ({
	p50,
	p99,
	p999,
}: {
	p50: number;
	p99: number;
	p999: number;
}): number => {
	const z = normal();
	const body = Math.log(p99 / p50) / Z_P99;
	const tail = Math.log(p999 / p99) / (Z_P999 - Z_P99);
	const logRate = z <= Z_P99 ? body * z : body * Z_P99 + tail * (z - Z_P99);
	return p50 * Math.exp(Math.min(logRate, body * Z_P99 + tail * 1.5));
};

/** Every seeded customer, the hot one last. */
export const customerIdsOf = ({ config }: { config: RigConfig }): string[] => [
	...Array.from(
		{ length: config.customers.count - 1 },
		(_, i) => `cus_${String(i).padStart(5, "0")}`,
	),
	config.customers.hotCustomerId,
];

/** Latency buckets: 0.1 ms to ~13 s, 10% apart, so per-process histograms merge exactly. */
const BUCKET_BASE_MS = 0.1;
const BUCKET_RATIO = 1.1;
export const BUCKETS = 124;

export const bucketOf = (ms: number): number =>
	Math.min(
		BUCKETS - 1,
		Math.max(
			0,
			Math.floor(Math.log(ms / BUCKET_BASE_MS) / Math.log(BUCKET_RATIO)),
		),
	);

export const percentileOf = ({
	histogram,
	p,
}: {
	histogram: number[];
	p: number;
}): number | null => {
	const total = histogram.reduce((sum, n) => sum + n, 0);
	if (total === 0) return null;
	let seen = 0;
	for (const [bucket, n] of histogram.entries()) {
		seen += n;
		if (seen >= total * p)
			return Number((BUCKET_BASE_MS * BUCKET_RATIO ** (bucket + 1)).toFixed(1));
	}
	return null;
};

/** What one class of request did in one step, as a load process reports it and the driver merges. */
export type StepCounts = {
	sent: number;
	answered: number;
	forwarded: number;
	shed: number;
	failed: number;
	forwardReasons: Record<string, number>;
	histogram: number[];
};

export const emptyCounts = (): StepCounts => ({
	sent: 0,
	answered: 0,
	forwarded: 0,
	shed: 0,
	failed: 0,
	forwardReasons: {},
	histogram: new Array(BUCKETS).fill(0),
});

export const mergeCounts = (into: StepCounts, from: StepCounts): StepCounts => {
	into.sent += from.sent;
	into.answered += from.answered;
	into.forwarded += from.forwarded;
	into.shed += from.shed;
	into.failed += from.failed;
	for (const [reason, n] of Object.entries(from.forwardReasons))
		into.forwardReasons[reason] = (into.forwardReasons[reason] ?? 0) + n;
	for (const [bucket, n] of from.histogram.entries())
		into.histogram[bucket] = (into.histogram[bucket] ?? 0) + n;
	return into;
};

/** The timeline both the driver and its load processes follow: warmup, then each hot step for stepSeconds. */
export const timelineOf = ({ config }: { config: RigConfig }) => {
	const { hot, warmupSeconds } = config;
	const steps = hot.steps.map((multiple, index) => ({
		index,
		multiple,
		startsAtS: warmupSeconds + index * hot.stepSeconds,
		hotDeductionsPerSec: Math.round(
			Math.min(hot.ratePerStep * multiple, hot.maxRatePerSec),
		),
	}));
	return {
		steps,
		endsAtS: warmupSeconds + steps.length * hot.stepSeconds,
		/** The step running `elapsedS` into the run; -1 during warmup. */
		stepAt: (elapsedS: number) =>
			elapsedS < warmupSeconds
				? -1
				: Math.min(
						steps.length - 1,
						Math.floor((elapsedS - warmupSeconds) / hot.stepSeconds),
					),
		/** The background's share of its peak: flat, or the snapshot's ramp to the peak at T+90 s. */
		backgroundShareAt: (elapsedS: number) =>
			config.background.shape === "flat" ? 1 : Math.min(1, elapsedS / 90),
	};
};

/** Which replica owns the customer a request is about, by the Atom's ring over the pair. */
export type OwnerClass = "a" | "b";

/** What one owner class's requests did in one second of a roll, as a load process reports it and the driver merges. */
export type RollCounts = {
	sent: number;
	/** Which replica each request was sent to, as the driver routed it then. */
	sentTo: Record<string, number>;
	answered: number;
	/** Deductions the client saw allowed, by the Atom (in `answered` too) or by the API (in `forwarded` too). */
	allowed: number;
	forwarded: number;
	forwardReasons: Record<string, number>;
	/** x-atom-proxied: owner or starting, when another replica answered. */
	proxied: Record<string, number>;
	/** Replies that were neither answered nor forwarded, by status, timeout or error. */
	failedStatus: Record<string, number>;
	histogram: number[];
};

export const emptyRollCounts = (): RollCounts => ({
	sent: 0,
	sentTo: {},
	answered: 0,
	allowed: 0,
	forwarded: 0,
	forwardReasons: {},
	proxied: {},
	failedStatus: {},
	histogram: new Array(BUCKETS).fill(0),
});

const mergeRecord = (
	into: Record<string, number>,
	from: Record<string, number>,
) => {
	for (const [key, n] of Object.entries(from)) into[key] = (into[key] ?? 0) + n;
};

export const mergeRollCounts = (
	into: RollCounts,
	from: RollCounts,
): RollCounts => {
	into.sent += from.sent;
	into.answered += from.answered;
	into.allowed += from.allowed;
	into.forwarded += from.forwarded;
	mergeRecord(into.sentTo, from.sentTo);
	mergeRecord(into.forwardReasons, from.forwardReasons);
	mergeRecord(into.proxied, from.proxied);
	mergeRecord(into.failedStatus, from.failedStatus);
	for (const [bucket, n] of from.histogram.entries())
		into.histogram[bucket] = (into.histogram[bucket] ?? 0) + n;
	return into;
};

export type RollLoadPlan = {
	index: number;
	replicaUrls: Record<OwnerClass, string>;
	/** The replicas' addresses as their rings know them. */
	members: Record<OwnerClass, string>;
	startAt: number;
	durationS: number;
	customerIds: string[];
	deductionsPerSec: number[];
	readChecksPerDeduction: number;
	lockEvery: number;
	lockFinalizeAfterMs: number;
};

/** The locked checks a load process sent and how each finalize ended; summed by the driver. */
export type RollLockCounts = {
	taken: number;
	takeFailed: Record<string, number>;
	finalized: number;
	finalizeForwarded: Record<string, number>;
	finalizeFailed: Record<string, number>;
};

export const emptyRollLockCounts = (): RollLockCounts => ({
	taken: 0,
	takeFailed: {},
	finalized: 0,
	finalizeForwarded: {},
	finalizeFailed: {},
});

export const mergeRollLockCounts = (
	into: RollLockCounts,
	from: RollLockCounts,
): RollLockCounts => {
	into.taken += from.taken;
	into.finalized += from.finalized;
	mergeRecord(into.takeFailed, from.takeFailed);
	mergeRecord(into.finalizeForwarded, from.finalizeForwarded);
	mergeRecord(into.finalizeFailed, from.finalizeFailed);
	return into;
};

/** The driver's routing, on each load process's stdin: the replicas new requests go to, as the ALB's targets; then stop. */
export type RollRouting =
	| { type: "route"; to: OwnerClass[] }
	| { type: "stop" };
