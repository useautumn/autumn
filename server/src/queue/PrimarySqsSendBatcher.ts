const DEFAULT_BATCH_WINDOW_MS = 10;
const SQS_SEND_MESSAGE_BATCH_LIMIT = 10;
const SQS_SEND_MESSAGE_BATCH_MAX_BODY_BYTES = 1024 * 1024;

export type PrimarySqsQueueEntry = {
	queueUrl: string;
	jobName: string;
	messageBody: string;
	messageGroupId?: string;
	messageDeduplicationId?: string;
	delaySeconds?: number;
};

export type SendPrimarySqsBatchArgs = {
	queueUrl: string;
	entries: PrimarySqsQueueEntry[];
};

type SendPrimarySqsBatch = (args: SendPrimarySqsBatchArgs) => Promise<{
	failures: Array<{ index: number; reason: string }>;
}>;

type PendingEntry = PrimarySqsQueueEntry & {
	resolve: () => void;
	reject: (error: Error) => void;
};

export class PrimarySqsSendBatcher {
	private pendingEntries: PendingEntry[] = [];
	private pendingMessageBodyBytes = 0;
	private flushTimer: NodeJS.Timeout | null = null;
	private readonly inFlightSends = new Set<Promise<void>>();
	private readonly batchWindowMs: number;
	private readonly sendBatch: SendPrimarySqsBatch;
	private acceptingEntries = true;

	constructor({
		batchWindowMs = DEFAULT_BATCH_WINDOW_MS,
		sendBatch,
	}: {
		batchWindowMs?: number;
		sendBatch: SendPrimarySqsBatch;
	}) {
		this.batchWindowMs = batchWindowMs;
		this.sendBatch = sendBatch;
	}

	enqueue(entry: PrimarySqsQueueEntry): Promise<void> {
		if (!this.acceptingEntries) {
			return Promise.reject(
				new Error("Primary SQS send batcher is shutting down"),
			);
		}

		const messageBodyBytes = Buffer.byteLength(entry.messageBody, "utf8");
		const pendingQueueUrl = this.pendingEntries[0]?.queueUrl;
		const mustStartNewBatch =
			this.pendingEntries.length > 0 &&
			(pendingQueueUrl !== entry.queueUrl ||
				this.pendingMessageBodyBytes + messageBodyBytes >
					SQS_SEND_MESSAGE_BATCH_MAX_BODY_BYTES);

		if (mustStartNewBatch) {
			void this.startSend();
		}

		return new Promise<void>((resolve, reject) => {
			this.pendingEntries.push({ ...entry, resolve, reject });
			this.pendingMessageBodyBytes += messageBodyBytes;

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
		this.pendingMessageBodyBytes = 0;
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
		let failures: Array<{ index: number; reason: string }>;
		try {
			const result = await this.sendBatch({
				queueUrl: pendingEntries[0].queueUrl,
				entries: pendingEntries.map(
					({
						queueUrl,
						jobName,
						messageBody,
						messageGroupId,
						messageDeduplicationId,
						delaySeconds,
					}) => ({
						queueUrl,
						jobName,
						messageBody,
						messageGroupId,
						messageDeduplicationId,
						delaySeconds,
					}),
				),
			});
			failures = result.failures;
		} catch (error) {
			const sendError =
				error instanceof Error
					? error
					: new Error("Unknown primary SQS batch error");
			for (const pendingEntry of pendingEntries) {
				pendingEntry.reject(sendError);
			}
			return;
		}

		const failureReasons = new Map(
			failures.map(({ index, reason }) => [index, reason]),
		);
		for (const [index, pendingEntry] of pendingEntries.entries()) {
			const failureReason = failureReasons.get(index);
			if (failureReason === undefined) pendingEntry.resolve();
			else pendingEntry.reject(new Error(failureReason));
		}
	}
}
