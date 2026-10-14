import type { SqsEnv } from "@autumn/env/sqs";
import type { AutumnLogger } from "@autumn/logging";
import type { JobCatalogue } from "../jobs/jobs.js";
import type { JobPayload } from "../lib/job/types/job.js";
import type { SendOptions, SendResult } from "../lib/queue/types/queue.js";

export type SqsJobsContext = {
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
};

export type SqsJobsConfig = {
	env: SqsEnv;
};

export type JobSender<TPayload> = {
	send(payload: TPayload, options?: SendOptions): Promise<void>;
	trySend(payload: TPayload, options?: SendOptions): Promise<SendResult>;
};

export type SqsJobs = {
	[K in keyof JobCatalogue]: JobSender<JobPayload<JobCatalogue[K]>>;
} & {
	flush(): Promise<void>;
	shutdown(): Promise<void>;
};
