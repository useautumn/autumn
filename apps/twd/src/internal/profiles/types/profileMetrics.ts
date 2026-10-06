/** Smoothed with the mean alpha. */
export const MEAN_METRICS = [
	"stripeRequests",
	"stripeTestRequests",
	"stripeServerRequests",
	"stripeMeanRps",
	"rateLimited",
	"permitWaitMs",
	"cpuCoreSeconds",
	"testCpuSeconds",
] as const;

/** Smoothed fast up, slow down, so headroom shrinks quickly and grows back slowly. */
export const PEAK_METRICS = [
	"stripePeakRps",
	"stripePeakInFlight",
	"workerPeakRps",
	"workerPeakInFlight",
	"permitWaitP95Ms",
	"cpuPeakCores",
	"memPeakMib",
	"testPeakMib",
] as const;

export type MeanMetric = (typeof MEAN_METRICS)[number];
export type PeakMetric = (typeof PEAK_METRICS)[number];
export type ProfileMetrics = Record<MeanMetric | PeakMetric, number | null>;
