const parseRate = (value: string | undefined, fallback: number) => {
	const rate = Number.parseFloat(value ?? "");
	return Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : fallback;
};

export const MAPLE_TRACE_SAMPLE_RATE = parseRate(
	process.env.MAPLE_TRACE_SAMPLE_RATE,
	0.1,
);

const hashToUnitInterval = (value: string) => {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
};

/** The share of sampled traces kept regardless of how they end. Decided by trace id alone, so a trace and its log lines agree. */
export const isInMapleSampleRate = ({
	traceId,
	sampleRate = MAPLE_TRACE_SAMPLE_RATE,
}: {
	traceId: string;
	sampleRate?: number;
}) => hashToUnitInterval(traceId) < sampleRate;
