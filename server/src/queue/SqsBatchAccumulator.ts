const DEFAULT_BATCH_WINDOW_MS = 10;
const DEFAULT_MAX_BATCH_ENTRIES = 10;
const DEFAULT_MAX_BATCH_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_IN_FLIGHT_SENDS = 10;

export type SqsBatchAccumulatorEntry = {
	queueUrl: string;
	messageBody: string;
};

export type SendSqsAccumulatorBatchArgs<
	TEntry extends SqsBatchAccumulatorEntry,
> = {
	queueUrl: string;
	entries: TEntry[];
};

type SendSqsAccumulatorBatch<TEntry extends SqsBatchAccumulatorEntry> = (
	args: SendSqsAccumulatorBatchArgs<TEntry>,
) => Promise<{
	failures: Array<{ index: number; reason: string }>;
}>;

type PendingEntry<TEntry extends SqsBatchAccumulatorEntry> = {
	entry: TEntry;
	resolve: () => void;
	reject: (error: Error) => void;
};

export class SqsBatchAccumulator<TEntry extends SqsBatchAccumulatorEntry> {
	private pendingEntries: PendingEntry<TEntry>[] = [];
	private pendingMessageBodyBytes = 0;
	private flushTimer: NodeJS.Timeout | null = null;
	private readonly inFlightSends = new Set<Promise<void>>();
	private readonly batchWindowMs: number;
	private readonly maxBatchEntries: number;
	private readonly maxBatchBodyBytes: number;
	private readonly maxInFlightSends: number;
	private readonly sendBatch: SendSqsAccumulatorBatch<TEntry>;
	private acceptingEntries = true;

	constructor({
		batchWindowMs = DEFAULT_BATCH_WINDOW_MS,
		maxBatchEntries = DEFAULT_MAX_BATCH_ENTRIES,
		maxBatchBodyBytes = DEFAULT_MAX_BATCH_BODY_BYTES,
		maxInFlightSends = DEFAULT_MAX_IN_FLIGHT_SENDS,
		sendBatch,
	}: {
		batchWindowMs?: number;
		maxBatchEntries?: number;
		maxBatchBodyBytes?: number;
		maxInFlightSends?: number;
		sendBatch: SendSqsAccumulatorBatch<TEntry>;
	}) {
		this.batchWindowMs = batchWindowMs;
		this.maxBatchEntries = maxBatchEntries;
		this.maxBatchBodyBytes = maxBatchBodyBytes;
		this.maxInFlightSends = maxInFlightSends;
		this.sendBatch = sendBatch;
	}

	enqueue(entry: TEntry): Promise<void> {
		if (!this.acceptingEntries) {
			return Promise.reject(
				new Error("SQS batch accumulator is shutting down"),
			);
		}

		const messageBodyBytes = Buffer.byteLength(entry.messageBody, "utf8");
		const pendingQueueUrl = this.pendingEntries[0]?.entry.queueUrl;
		const mustStartNewBatch =
			this.pendingEntries.length > 0 &&
			(pendingQueueUrl !== entry.queueUrl ||
				this.pendingMessageBodyBytes + messageBodyBytes >
					this.maxBatchBodyBytes);

		if (mustStartNewBatch) {
			void this.startSend();
		}

		return new Promise<void>((resolve, reject) => {
			this.pendingEntries.push({ entry, resolve, reject });
			this.pendingMessageBodyBytes += messageBodyBytes;

			if (this.pendingEntries.length >= this.maxBatchEntries) {
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

		if (this.inFlightSends.size >= this.maxInFlightSends) {
			const saturationError = new Error("SQS batch accumulator is saturated");
			for (const pendingEntry of pendingEntries) {
				pendingEntry.reject(saturationError);
			}
			return Promise.resolve();
		}

		let sendPromise: Promise<void> | undefined;
		let sendSettled = false;
		const releaseSendSlot = () => {
			sendSettled = true;
			if (sendPromise) this.inFlightSends.delete(sendPromise);
		};
		sendPromise = this.sendEntries({ pendingEntries, releaseSendSlot });
		this.inFlightSends.add(sendPromise);
		if (sendSettled) this.inFlightSends.delete(sendPromise);
		return sendPromise;
	}

	private async sendEntries({
		pendingEntries,
		releaseSendSlot,
	}: {
		pendingEntries: PendingEntry<TEntry>[];
		releaseSendSlot: () => void;
	}): Promise<void> {
		let failures: Array<{ index: number; reason: string }>;
		try {
			const result = await this.sendBatch({
				queueUrl: pendingEntries[0].entry.queueUrl,
				entries: pendingEntries.map(({ entry }) => entry),
			});
			failures = result.failures;
		} catch (error) {
			const sendError =
				error instanceof Error ? error : new Error("Unknown SQS batch error");
			releaseSendSlot();
			for (const pendingEntry of pendingEntries) {
				pendingEntry.reject(sendError);
			}
			return;
		}

		releaseSendSlot();
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
