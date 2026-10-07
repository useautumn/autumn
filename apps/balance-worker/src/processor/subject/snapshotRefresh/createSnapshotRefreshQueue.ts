import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import type {
	SnapshotRefreshCounts,
	SnapshotRefreshQueue,
	SnapshotRefreshQueueContext,
} from "./types/snapshotRefreshQueue.js";

/** One read in flight; `superseded` once the customer was evicted again behind it. */
type Refresh = {
	identity: MeteringIdentity;
	customerKey: string;
	superseded: boolean;
};

type Queue = {
	ctx: SnapshotRefreshQueueContext;
	/** Insertion order is FIFO; the subject key dedupes. */
	waiting: Map<string, MeteringIdentity>;
	reading: Set<Refresh>;
	counts: SnapshotRefreshCounts;
	warned: boolean;
	disposed: boolean;
	settledWaiters: (() => void)[];
};

const enqueue = ({
	queue,
	customer,
	subjects,
}: {
	queue: Queue;
	customer: MeteringIdentity;
	subjects: readonly MeteringIdentity[];
}): void => {
	if (queue.disposed) return;
	supersedeReadsOf({ queue, identity: customer });
	for (const identity of subjects) admit({ queue, identity });
	startReads({ queue });
};

const count = ({
	queue,
	field,
}: {
	queue: Queue;
	field: keyof SnapshotRefreshCounts;
}): void => {
	queue.counts[field] += 1;
	queue.ctx.recordCounts?.({ [field]: 1 });
};

/** A read the evict overtook may predate the write behind it; it will write nothing and wait again. */
const supersedeReadsOf = ({
	queue,
	identity,
}: {
	queue: Queue;
	identity: MeteringIdentity;
}): void => {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	for (const refresh of queue.reading)
		if (refresh.customerKey === customerKey) refresh.superseded = true;
};

const admit = ({
	queue,
	identity,
}: {
	queue: Queue;
	identity: MeteringIdentity;
}): void => {
	const subjectKey = meteringIdentityToSubjectKey({ identity });
	if (queue.waiting.has(subjectKey)) return;
	if (
		queue.waiting.size >=
		queue.ctx.subjectSnapshotsConfig.get().refreshMaxPending
	) {
		warnCapped({ queue });
		return;
	}
	queue.waiting.set(subjectKey, identity);
	count({ queue, field: "queued" });
};

const warnCapped = ({ queue }: { queue: Queue }): void => {
	if (queue.warned) return;
	queue.warned = true;
	queue.ctx.logger?.warn?.(
		{
			event: "balance_worker.snapshot_refresh_capped",
			data: { waiting: queue.waiting.size },
		},
		`Balance worker has ${queue.waiting.size} snapshot refreshes waiting; further subjects miss once on their next cold load`,
	);
};

/** Takes waiting subjects into reads until `refreshConcurrency` are in flight or nothing waits. */
const startReads = ({ queue }: { queue: Queue }): void => {
	const { refreshConcurrency } = queue.ctx.subjectSnapshotsConfig.get();
	while (queue.reading.size < refreshConcurrency && queue.waiting.size > 0) {
		const next = queue.waiting.entries().next().value;
		if (!next) break;
		const [subjectKey, identity] = next;
		queue.waiting.delete(subjectKey);
		const refresh: Refresh = {
			identity,
			customerKey: meteringIdentityToPartitionKey({ identity }),
			superseded: false,
		};
		queue.reading.add(refresh);
		void refreshOne({ queue, refresh }).finally(() =>
			finishRefresh({ queue, refresh }),
		);
	}
	if (queue.waiting.size === 0) queue.warned = false;
};

/** Never rejects: a read that throws is counted and logged, and the queue carries on. */
const refreshOne = async ({
	queue,
	refresh,
}: {
	queue: Queue;
	refresh: Refresh;
}): Promise<void> => {
	const { identity } = refresh;
	try {
		const read = await queue.ctx.read({ identity });
		if (refresh.superseded) {
			count({ queue, field: "skipped" });
			if (!queue.disposed) admit({ queue, identity });
			return;
		}
		if (
			read === null ||
			read.bytes === undefined ||
			read.bytes > queue.ctx.subjectSnapshotsConfig.get().maxBytes
		) {
			count({ queue, field: "skipped" });
			return;
		}
		queue.ctx.write({ identity, read });
		count({ queue, field: "refreshed" });
	} catch (cause) {
		count({ queue, field: "failed" });
		queue.ctx.logger?.warn?.(
			{
				event: "balance_worker.snapshot_refresh_failed",
				data: { identity },
			},
			`Balance worker could not refresh ${identity.customerId}'s snapshot: ${cause instanceof Error ? cause.message : String(cause)}`,
		);
	}
};

const finishRefresh = ({
	queue,
	refresh,
}: {
	queue: Queue;
	refresh: Refresh;
}): void => {
	queue.reading.delete(refresh);
	startReads({ queue });
	if (isIdle({ queue })) {
		for (const resolve of queue.settledWaiters.splice(0)) resolve();
	}
};

const isIdle = ({ queue }: { queue: Queue }): boolean =>
	queue.waiting.size === 0 && queue.reading.size === 0;

const settled = ({ queue }: { queue: Queue }): Promise<void> =>
	isIdle({ queue })
		? Promise.resolve()
		: new Promise((resolve) => queue.settledWaiters.push(resolve));

const dispose = ({ queue }: { queue: Queue }): void => {
	queue.disposed = true;
	queue.waiting.clear();
	for (const refresh of queue.reading) refresh.superseded = true;
};

export const createSnapshotRefreshQueue = ({
	ctx,
}: {
	ctx: SnapshotRefreshQueueContext;
}): SnapshotRefreshQueue => {
	const queue: Queue = {
		ctx,
		waiting: new Map(),
		reading: new Set(),
		counts: { queued: 0, refreshed: 0, skipped: 0, failed: 0 },
		warned: false,
		disposed: false,
		settledWaiters: [],
	};
	return {
		enqueue: ({ customer, subjects }) => enqueue({ queue, customer, subjects }),
		depth: () => queue.waiting.size + queue.reading.size,
		counts: () => ({ ...queue.counts }),
		settled: () => settled({ queue }),
		dispose: () => dispose({ queue }),
	};
};
