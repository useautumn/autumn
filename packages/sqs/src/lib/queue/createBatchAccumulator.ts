import type {
	EntryFailure,
	QueueBatchConfig,
	QueueEntry,
} from "./types/queue.js";

type PendingEntry = {
	entry: QueueEntry;
	resolve: () => void;
	reject: (error: Error) => void;
};

export type BatchAccumulator = {
	/** Resolves when this entry's batch reports it sent; rejects with the entry's own failure. */
	enqueue(entry: QueueEntry): Promise<void>;
	flush(): Promise<void>;
	shutdown(): Promise<void>;
};

type AccumulatorScope = {
	config: QueueBatchConfig;
	sendBatch: (entries: QueueEntry[]) => Promise<EntryFailure[]>;
	onRejectedDuringShutdown: (count: number) => void;
	state: {
		pending: PendingEntry[];
		pendingBodyBytes: number;
		flushTimer: ReturnType<typeof setTimeout> | null;
		inFlight: Set<Promise<void>>;
		accepting: boolean;
		rejectedDuringShutdown: number;
	};
};

const settleBatch = async ({
	scope,
	pending,
}: {
	scope: AccumulatorScope;
	pending: PendingEntry[];
}): Promise<void> => {
	let failures: EntryFailure[];
	try {
		failures = await scope.sendBatch(pending.map(({ entry }) => entry));
	} catch (error) {
		const sendError =
			error instanceof Error ? error : new Error("Unknown SQS batch error");
		for (const entry of pending) entry.reject(sendError);
		return;
	}
	const reasonByIndex = new Map(
		failures.map(({ index, reason }) => [index, reason]),
	);
	for (const [index, entry] of pending.entries()) {
		const reason = reasonByIndex.get(index);
		if (reason === undefined) entry.resolve();
		else entry.reject(new Error(reason));
	}
};

const startSend = ({ scope }: { scope: AccumulatorScope }): Promise<void> => {
	const { state } = scope;
	if (state.pending.length === 0) return Promise.resolve();
	const pending = state.pending;
	state.pending = [];
	state.pendingBodyBytes = 0;
	if (state.flushTimer) {
		clearTimeout(state.flushTimer);
		state.flushTimer = null;
	}
	const send = settleBatch({ scope, pending });
	state.inFlight.add(send);
	void send.then(() => state.inFlight.delete(send));
	return send;
};

const scheduleSend = ({ scope }: { scope: AccumulatorScope }): void => {
	const { state } = scope;
	if (state.flushTimer) return;
	state.flushTimer = setTimeout(() => {
		state.flushTimer = null;
		void startSend({ scope });
	}, scope.config.windowMs);
};

const enqueue = ({
	scope,
	entry,
}: {
	scope: AccumulatorScope;
	entry: QueueEntry;
}): Promise<void> => {
	const { state, config } = scope;
	if (!state.accepting) {
		// A send from a request that outlived teardown: dropped, but counted.
		state.rejectedDuringShutdown += 1;
		scope.onRejectedDuringShutdown(state.rejectedDuringShutdown);
		return Promise.reject(new Error("SQS batch accumulator is shutting down"));
	}
	const bodyBytes = Buffer.byteLength(entry.body, "utf8");
	if (
		state.pending.length > 0 &&
		state.pendingBodyBytes + bodyBytes > config.maxBodyBytes
	) {
		void startSend({ scope });
	}
	return new Promise<void>((resolve, reject) => {
		state.pending.push({ entry, resolve, reject });
		state.pendingBodyBytes += bodyBytes;
		if (state.pending.length >= config.maxEntries) void startSend({ scope });
		else scheduleSend({ scope });
	});
};

const flush = async ({ scope }: { scope: AccumulatorScope }): Promise<void> => {
	await startSend({ scope });
	while (scope.state.inFlight.size > 0) {
		await Promise.all([...scope.state.inFlight]);
	}
};

/** Holds sends for a short window and ships them as one SendMessageBatch; each caller still learns its own fate. */
export const createBatchAccumulator = ({
	config,
	sendBatch,
	onRejectedDuringShutdown,
}: {
	config: QueueBatchConfig;
	sendBatch: AccumulatorScope["sendBatch"];
	onRejectedDuringShutdown: AccumulatorScope["onRejectedDuringShutdown"];
}): BatchAccumulator => {
	const scope: AccumulatorScope = {
		config,
		sendBatch,
		onRejectedDuringShutdown,
		state: {
			pending: [],
			pendingBodyBytes: 0,
			flushTimer: null,
			inFlight: new Set(),
			accepting: true,
			rejectedDuringShutdown: 0,
		},
	};
	return {
		enqueue: (entry) => enqueue({ scope, entry }),
		flush: () => flush({ scope }),
		shutdown: async () => {
			scope.state.accepting = false;
			await flush({ scope });
		},
	};
};
