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

/** One job as a producer sees it: send it, and nothing about where it goes. */
export type JobSender<TPayload> = {
	/** One retry on a transport error, then throws. */
	send(payload: TPayload, options?: SendOptions): Promise<void>;
	/** `send` that never throws: a failure is logged and reported, so a request path can carry on. */
	trySend(payload: TPayload, options?: SendOptions): Promise<SendResult>;
};

/** Every job Autumn queues, ready to send; the queues underneath open on first use. */
export type SqsJobs = {
	[K in keyof JobCatalogue]: JobSender<JobPayload<JobCatalogue[K]>>;
} & {
	/** Sends whatever is still batched; a process calls this before it exits. */
	flush(): Promise<void>;
	/** Flushes, then refuses further sends and closes the connections. */
	shutdown(): Promise<void>;
};
