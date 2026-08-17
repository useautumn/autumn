const DEFAULT_BATCH_WINDOW_MS = 10;
const DEFAULT_MAX_BATCH_ENTRIES = 10;
const DEFAULT_MAX_BATCH_BODY_BYTES = 1024 * 1024;

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
	private readonly sendBatch: SendSqsAccumulatorBatch<TEntry>;
	private acceptingEntries = true;

	constructor({
		batchWindowMs = DEFAULT_BATCH_WINDOW_MS,
		maxBatchEntries = DEFAULT_MAX_BATCH_ENTRIES,
		maxBatchBodyBytes = DEFAULT_MAX_BATCH_BODY_BYTES,
		sendBatch,
	}: {
		batchWindowMs?: number;
		maxBatchEntries?: number;
		maxBatchBodyBytes?: number;
		sendBatch: SendSqsAccumulatorBatch<TEntry>;
	}) {
		this.batchWindowMs = batchWindowMs;
		this.maxBatchEntries = maxBatchEntries;
		this.maxBatchBodyBytes = maxBatchBodyBytes;
		this.sendBatch = sendBatch;
	}

	private rejectedDuringShutdown = 0;

	enqueue(entry: TEntry): Promise<void> {
		if (!this.acceptingEntries) {
			// Every rejection here is a dropped send from a request that outlived
			// teardown — must stay visible and countable.
			this.rejectedDuringShutdown++;
			console.warn(
				`[SqsBatch] enqueue rejected during shutdown (#${this.rejectedDuringShutdown}, queue=${entry.queueUrl.split("/").pop()})`,
			);
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
		pendingEntries: PendingEntry<TEntry>[];
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
