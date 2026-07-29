import { JobName } from "@/queue/JobName.js";
import { addTasksToQueueBatch, type Payloads } from "@/queue/queueUtils.js";

const DEFAULT_BATCH_WINDOW_MS = 10;
const SQS_SEND_MESSAGE_BATCH_LIMIT = 10;

type AsyncTrackQueueEntry = {
	payload: Payloads[JobName.Track];
	messageGroupId: string;
	messageDeduplicationId: string;
};

export type SendAsyncTrackBatchArgs = {
	jobName: JobName.Track;
	queueUrl: string;
	entries: AsyncTrackQueueEntry[];
};

type SendAsyncTrackBatch = (args: SendAsyncTrackBatchArgs) => Promise<{
	successCount: number;
	failures: Array<{ index: number; reason: string }>;
}>;

type PendingEntry = AsyncTrackQueueEntry & {
	queueUrl: string;
	resolve: () => void;
	reject: (error: Error) => void;
};

export class AsyncTrackSqsBatcher {
	private pendingEntries: PendingEntry[] = [];
	private flushTimer: NodeJS.Timeout | null = null;
	private readonly inFlightSends = new Set<Promise<void>>();
	private readonly batchWindowMs: number;
	private readonly sendBatch: SendAsyncTrackBatch;
	private acceptingEntries = true;

	constructor({
		batchWindowMs = DEFAULT_BATCH_WINDOW_MS,
		sendBatch = addTasksToQueueBatch as SendAsyncTrackBatch,
	}: {
		batchWindowMs?: number;
		sendBatch?: SendAsyncTrackBatch;
	} = {}) {
		this.batchWindowMs = batchWindowMs;
		this.sendBatch = sendBatch;
	}

	enqueue({
		queueUrl,
		payload,
		messageGroupId,
		messageDeduplicationId,
	}: {
		queueUrl: string;
		payload: Payloads[JobName.Track];
		messageGroupId: string;
		messageDeduplicationId: string;
	}): Promise<void> {
		if (!this.acceptingEntries) {
			return Promise.reject(
				new Error("Async track SQS batcher is shutting down"),
			);
		}

		if (
			this.pendingEntries.length > 0 &&
			this.pendingEntries[0].queueUrl !== queueUrl
		) {
			void this.startSend();
		}

		return new Promise<void>((resolve, reject) => {
			this.pendingEntries.push({
				queueUrl,
				payload,
				messageGroupId,
				messageDeduplicationId,
				resolve,
				reject,
			});

			if (this.pendingEntries.length >= SQS_SEND_MESSAGE_BATCH_LIMIT) {
				void this.startSend();
			} else {
				this.scheduleSend();
			}
		});
	}

	async flush(): Promise<void> {
		await this.startSend();
		while (this.inFlightSends.size > 0) {
			await Promise.all(Array.from(this.inFlightSends));
		}
	}

	async shutdown(): Promise<void> {
		this.acceptingEntries = false;
		await this.flush();
	}

	private scheduleSend(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.startSend();
		}, this.batchWindowMs);
	}

	private startSend(): Promise<void> {
		if (this.pendingEntries.length === 0) return Promise.resolve();

		const pendingEntries = this.pendingEntries;
		this.pendingEntries = [];
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		const sendPromise = this.sendEntries({ pendingEntries });
		this.inFlightSends.add(sendPromise);
		void sendPromise.then(() => {
			this.inFlightSends.delete(sendPromise);
		});
		return sendPromise;
	}

	private async sendEntries({
		pendingEntries,
	}: {
		pendingEntries: PendingEntry[];
	}): Promise<void> {
		let result: Awaited<ReturnType<SendAsyncTrackBatch>>;
		try {
			result = await this.sendBatch({
				jobName: JobName.Track,
				queueUrl: pendingEntries[0].queueUrl,
				entries: pendingEntries.map(
					({ payload, messageGroupId, messageDeduplicationId }) => ({
						payload,
						messageGroupId,
						messageDeduplicationId,
					}),
				),
			});
		} catch (error) {
			const sendError =
				error instanceof Error
					? error
					: new Error("Unknown async track SQS batch error");
			for (const pendingEntry of pendingEntries) {
				pendingEntry.reject(sendError);
			}
			return;
		}

		const failureReasons = new Map(
			result.failures.map(({ index, reason }) => [index, reason]),
		);

		for (const [index, pendingEntry] of pendingEntries.entries()) {
			const failureReason = failureReasons.get(index);
			if (failureReason === undefined) pendingEntry.resolve();
			else pendingEntry.reject(new Error(failureReason));
		}
	}
}

export const globalAsyncTrackSqsBatcher = new AsyncTrackSqsBatcher();
