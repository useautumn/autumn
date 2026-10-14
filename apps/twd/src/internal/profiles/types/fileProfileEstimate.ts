import type { ProfileMetrics } from "./profileMetrics.ts";

export type FileProfileEstimate = {
	source: "file" | "folder" | "global";
	folder: string | null;
	confidence: number;
	durationMs: number;
	durationP90Ms: number;
	failRate: number;
	packedFailRate: number | null;
	metrics: ProfileMetrics;
};
