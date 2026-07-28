export type KnownJobQueue = {
	id: string;
	label: string;
	description: string;
	defaultEnabled: boolean;
};

export type JobQueueConfig = {
	queues: Record<string, { enabled: boolean }>;
	knownQueues: KnownJobQueue[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const JOB_QUEUE_QUERY_KEY = ["admin-edge-config", "job-queues"] as const;
