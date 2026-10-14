import type { AutumnLogger } from "@autumn/logging";
import type { SqsClient } from "../../client/types/sqsClient.js";
import type { JobDefinition } from "../../job/types/job.js";

export type QueueContext = {
	client: SqsClient;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
};

export type QueueBatchConfig = {
	windowMs: number;
	maxEntries: number;
	maxBodyBytes: number;
};

export type QueueConfig = {
	url: string;
	batch?: QueueBatchConfig | false;
};

export type SendOptions = {
	/** Capped at SQS's 15 minutes. */
	delayMs?: number;
	groupId?: string;
	dedupeId?: string;
};

export type SendResult = { sent: true } | { sent: false; error: unknown };

export type Queue<
	TJobs extends readonly JobDefinition[] = readonly JobDefinition[],
> = {
	url: string;
	isFifo: boolean;
	jobs: TJobs;
	send(params: {
		job: TJobs[number];
		payload: unknown;
		options?: SendOptions;
	}): Promise<void>;
	trySend(params: {
		job: TJobs[number];
		payload: unknown;
		options?: SendOptions;
	}): Promise<SendResult>;
	flush(): Promise<void>;
	shutdown(): Promise<void>;
};

export type QueueEntry = {
	body: string;
	delaySeconds?: number;
	groupId?: string;
	dedupeId?: string;
};

export type EntryFailure = { index: number; reason: string };
