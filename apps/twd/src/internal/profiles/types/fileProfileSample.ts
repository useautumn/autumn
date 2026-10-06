import type { ProfileMetrics } from "./profileMetrics.ts";

/** One run's first-attempt observation of a file (repetitions already combined). */
export type FileProfileSample = {
	durationMs: number;
	/** First-attempt failure, 0..1 (a repeat run's share of failed repetitions). */
	failure: number;
	/** Timed out or crashed: the duration only ever pushes the mean up. */
	hung: boolean;
	/** Null when the attempt printed no `[tw-file-stats]` line. */
	metrics: ProfileMetrics | null;
};
