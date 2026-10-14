import type { ProfileMetrics } from "./profileMetrics.ts";

export type FileProfileSample = {
	durationMs: number;
	failure: number;
	hung: boolean;
	packed: boolean;
	metrics: ProfileMetrics | null;
};
