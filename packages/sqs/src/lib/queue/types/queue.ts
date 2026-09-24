import type { AutumnLogger } from "@autumn/logging";
import type { SqsClient } from "../../client/types/sqsClient.js";
import type { JobDefinition } from "../../job/types/job.js";

export type QueueContext = {
	client: SqsClient;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
};

export type QueueBatchConfig = {
	/** How long a send waits for company before the batch goes out. */
	windowMs: number;
	/** SendMessageBatch takes at most 10. */
	maxEntries: number;
	maxBodyBytes: number;
};

export type QueueConfig = {
	url: string;
	/** Sends are coalesced into SendMessageBatch calls; `false` sends each message on its own. */
	batch?: QueueBatchConfig | false;
};

export type SendOptions = {
	/** Capped at SQS's 15 minutes. */
	delayMs?: number;
	/** FIFO only. Unset means every message is its own group, as the server has always sent. */
	groupId?: string;
	/** FIFO only. Unset derives one from the job id. */
	dedupeId?: string;
};

export type SendResult = { sent: true } | { sent: false; error: unknown };

/** One SQS queue and the jobs it carries. */
export type Queue<
	TJobs extends readonly JobDefinition[] = readonly JobDefinition[],
> = {
	url: string;
	isFifo: boolean;
	/** Every job this queue carries: what a consumer parses with. */
	jobs: TJobs;
	/** One retry on a transport error, then throws. */
	send(params: {
		job: TJobs[number];
		payload: unknown;
		options?: SendOptions;
	}): Promise<void>;
	/** `send` that never throws: a failure is logged and reported, so a request path can carry on. */
	trySend(params: {
		job: TJobs[number];
		payload: unknown;
		options?: SendOptions;
	}): Promise<SendResult>;
	/** Sends whatever is still batched; a process calls this before it exits. */
	flush(): Promise<void>;
	/** Flushes, then refuses further sends. */
	shutdown(): Promise<void>;
};

/** One message as it goes to SQS, batched or alone. */
export type QueueEntry = {
	body: string;
	delaySeconds?: number;
	groupId?: string;
	dedupeId?: string;
};

export type EntryFailure = { index: number; reason: string };
