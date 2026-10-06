import type { ProfileMetrics } from "./profileMetrics.ts";

/** What a file is expected to cost: its own profile, else its folder's, else the suite's. */
export type FileProfileEstimate = {
	source: "file" | "folder" | "global";
	/** The folder the estimate came from; null unless source is "folder". */
	folder: string | null;
	/** min(1, samples / 3); 0 for folder and global estimates. */
	confidence: number;
	durationMs: number;
	durationP90Ms: number;
	failRate: number;
	metrics: ProfileMetrics;
};
