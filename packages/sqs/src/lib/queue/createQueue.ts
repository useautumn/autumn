import KSUID from "ksuid";
import { isFifoQueueUrl, queueUrlToName } from "../client/queueUrl.js";
import { serializeJobEnvelope } from "../job/jobEnvelope.js";
import type { JobDefinition } from "../job/types/job.js";
import {
	type BatchAccumulator,
	createBatchAccumulator,
} from "./createBatchAccumulator.js";
import { sendEntries, sendEntry } from "./sendEntries.js";
import type {
	Queue,
	QueueConfig,
	QueueContext,
	QueueEntry,
	SendOptions,
	SendResult,
} from "./types/queue.js";

const MAX_DELAY_SECONDS = 900;

export const DEFAULT_QUEUE_BATCH = {
	windowMs: 10,
	maxEntries: 10,
	maxBodyBytes: 1024 * 1024,
} as const;

type QueueScope = {
	ctx: QueueContext;
	config: QueueConfig;
	isFifo: boolean;
	accumulator: BatchAccumulator | null;
	/** Set by shutdown: a send after it is a request that outlived teardown. */
	closed: boolean;
};

const newJobId = (): string => `job_${KSUID.randomSync().string}`;

/** `{ id, name, data }` as the server has always sent it; FIFO ids only on a FIFO queue. */
const toEntry = ({
	scope,
	job,
	payload,
	options = {},
}: {
	scope: QueueScope;
	job: JobDefinition;
	payload: unknown;
	options?: SendOptions;
}): QueueEntry => {
	const id = newJobId();
	const delaySeconds = options.delayMs
		? Math.min(Math.floor(options.delayMs / 1000), MAX_DELAY_SECONDS)
		: undefined;
	return {
		body: serializeJobEnvelope({ id, name: job.name, payload }),
		...(delaySeconds && { delaySeconds }),
		...(scope.isFifo && {
			groupId: options.groupId ?? `msg_${KSUID.randomSync().string}`,
			dedupeId: options.dedupeId ?? Bun.hash(id).toString(),
		}),
	};
};

const sendOnce = ({
	scope,
	entry,
}: {
	scope: QueueScope;
	entry: QueueEntry;
}): Promise<void> =>
	scope.accumulator
		? scope.accumulator.enqueue(entry)
		: sendEntry({
				client: scope.ctx.client,
				queueUrl: scope.config.url,
				entry,
			});

/** One retry, alone rather than batched, so a batch-level transport blip costs one extra call and not the job. */
const send = async ({
	scope,
	job,
	payload,
	options,
}: {
	scope: QueueScope;
	job: JobDefinition;
	payload: unknown;
	options?: SendOptions;
}): Promise<void> => {
	if (scope.closed) {
		throw new Error(
			`[sqs] queue ${queueUrlToName({ queueUrl: scope.config.url })} is shut down`,
		);
	}
	const entry = toEntry({ scope, job, payload, options });
	try {
		await sendOnce({ scope, entry });
	} catch (error) {
		scope.ctx.logger.warn("[sqs] send failed; retrying once", {
			error,
			data: {
				queue: queueUrlToName({ queueUrl: scope.config.url }),
				job: job.name,
			},
		});
		await sendEntry({
			client: scope.ctx.client,
			queueUrl: scope.config.url,
			entry,
		});
	}
};

const trySend = async ({
	scope,
	job,
	payload,
	options,
}: {
	scope: QueueScope;
	job: JobDefinition;
	payload: unknown;
	options?: SendOptions;
}): Promise<SendResult> => {
	try {
		await send({ scope, job, payload, options });
		return { sent: true };
	} catch (error) {
		scope.ctx.logger.error("[sqs] send failed; job dropped", {
			error,
			data: {
				queue: queueUrlToName({ queueUrl: scope.config.url }),
				job: job.name,
			},
		});
		return { sent: false, error };
	}
};

export const createQueue = <const TJobs extends readonly JobDefinition[]>({
	ctx,
	config,
	jobs,
}: {
	ctx: QueueContext;
	config: QueueConfig;
	jobs: TJobs;
}): Queue<TJobs> => {
	const batch = config.batch === undefined ? DEFAULT_QUEUE_BATCH : config.batch;
	const scope: QueueScope = {
		ctx,
		config,
		isFifo: isFifoQueueUrl({ queueUrl: config.url }),
		closed: false,
		accumulator: batch
			? createBatchAccumulator({
					config: batch,
					sendBatch: (entries) =>
						sendEntries({ client: ctx.client, queueUrl: config.url, entries }),
					onRejectedDuringShutdown: (count) =>
						ctx.logger.warn(
							`[sqs] send rejected during shutdown (#${count}, queue=${queueUrlToName({ queueUrl: config.url })})`,
						),
				})
			: null,
	};
	return {
		url: config.url,
		isFifo: scope.isFifo,
		jobs,
		send: ({ job, payload, options }) => send({ scope, job, payload, options }),
		trySend: ({ job, payload, options }) =>
			trySend({ scope, job, payload, options }),
		flush: () => scope.accumulator?.flush() ?? Promise.resolve(),
		shutdown: async () => {
			scope.closed = true;
			await scope.accumulator?.shutdown();
		},
	};
};
