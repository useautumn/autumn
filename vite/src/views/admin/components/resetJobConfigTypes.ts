export type ResetJobConfig = {
	enabled: boolean;
	batchSize: number;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export type ResetJobFormValues = Pick<ResetJobConfig, "enabled" | "batchSize">;

export const RESET_JOB_QUERY_KEY = ["admin-edge-config", "reset-job"] as const;
