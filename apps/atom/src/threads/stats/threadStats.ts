/** What each thread reports since boot: work served, the held copies and their hit rate, and its event loop's health. */
export const THREAD_STAT_FIELDS = [
	"checks",
	"pushes",
	"heldSubjects",
	"heldBytes",
	"heldLookups",
	"heldMisses",
	/** The last 1 s tick's lateness, and how many ticks since boot were ≥100 ms late. */
	"loopLagMs",
	"loopStalls",
] as const;

export type ThreadStatField = (typeof THREAD_STAT_FIELDS)[number];
export type ThreadStats = Record<ThreadStatField, number> & { index: number };

/** This thread's row of the shared buffer: counters it adds to and gauges it sets. */
export type ThreadCounters = {
	add(field: ThreadStatField, by?: number): void;
	set(field: ThreadStatField, value: number): void;
};

const FIELD_INDEX = Object.fromEntries(
	THREAD_STAT_FIELDS.map((field, index) => [field, index]),
) as Record<ThreadStatField, number>;
const ROW_BYTES = THREAD_STAT_FIELDS.length * Float64Array.BYTES_PER_ELEMENT;

/** One row of doubles per thread, shared so any thread's /health reads every row. */
export const createThreadStatsBuffer = ({
	threads,
}: {
	threads: number;
}): SharedArrayBuffer => new SharedArrayBuffer(threads * ROW_BYTES);

export const openThreadCounters = ({
	buffer,
	index,
}: {
	buffer: SharedArrayBuffer;
	index: number;
}): ThreadCounters => {
	const row = new Float64Array(
		buffer,
		index * ROW_BYTES,
		THREAD_STAT_FIELDS.length,
	);
	return {
		add: (field, by = 1) => {
			row[FIELD_INDEX[field]] += by;
		},
		set: (field, value) => {
			row[FIELD_INDEX[field]] = value;
		},
	};
};

export const readThreadStats = ({
	buffer,
}: {
	buffer: SharedArrayBuffer;
}): ThreadStats[] => {
	const all = new Float64Array(buffer);
	const threads = all.length / THREAD_STAT_FIELDS.length;
	return Array.from({ length: threads }, (_, index) => {
		const row = all.subarray(
			index * THREAD_STAT_FIELDS.length,
			(index + 1) * THREAD_STAT_FIELDS.length,
		);
		const stats = Object.fromEntries(
			THREAD_STAT_FIELDS.map((field, position) => [field, row[position]]),
		) as Record<ThreadStatField, number>;
		return { index, ...stats };
	});
};
