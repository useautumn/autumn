import { BALANCE_WORKER_PARTITION_STARTUP_CONCURRENCY } from "@autumn/env/balanceWorkerConstants";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import type {
	AllocationScope,
	PartitionEntry,
} from "../types/partitionState.js";
import {
	createPartitionEntries,
	reportPartitionStartupFailures,
	startPartition,
} from "./partitionStartup.js";

/** Settles one entry's startup, whatever the outcome, so the promise its caller
 *  already holds always resolves or rejects exactly once. */
type StartOneEntry = (params: { entry: PartitionEntry }) => Promise<void>;

/** Named indirectly because this package's TypeScript configuration does not expose
 *  PromiseWithResolvers as a global type, even though the call itself resolves. */
function createStartupSettlement() {
	return Promise.withResolvers<void>();
}
type StartupSettlement = ReturnType<typeof createStartupSettlement>;

/** Works through the queue a few entries at a time. Several of these run side by
 *  side and share the cursor, so the number in flight never exceeds the number
 *  of runners regardless of how many partitions were assigned. */
async function drainStartupQueue({
	entries,
	settlements,
	cursor,
	start,
}: {
	entries: PartitionEntry[];
	settlements: StartupSettlement[];
	cursor: { next: number };
	start: StartOneEntry;
}): Promise<void> {
	while (cursor.next < entries.length) {
		const index = cursor.next;
		cursor.next = index + 1;
		const entry = entries[index];
		const settlement = settlements[index];
		if (!entry || !settlement) continue;
		try {
			await start({ entry });
			settlement.resolve();
		} catch (cause) {
			settlement.reject(cause);
		}
	}
}

/** Gives every entry the promise its caller will await, then starts them under a
 *  fixed ceiling. Exported for the test that holds the ceiling to account. */
export async function runBoundedStartups({
	entries,
	width,
	start,
}: {
	entries: PartitionEntry[];
	width: number;
	start: StartOneEntry;
}): Promise<PromiseSettledResult<void>[]> {
	// Every entry gets its promise before any of them begins. Retirement awaits
	// entry.startup, so a partition retired while still queued must already have
	// something to wait on rather than a null it would skip straight past.
	const settlements: StartupSettlement[] = [];
	const startups: Promise<void>[] = [];
	for (const entry of entries) {
		const settlement = createStartupSettlement();
		entry.startup = settlement.promise;
		settlements.push(settlement);
		startups.push(settlement.promise);
	}

	// Collect before starting anything. A startup that fails while the queue is
	// still draining would otherwise sit rejected with nothing watching it, which
	// the runtime reports as an unhandled rejection.
	const settled = Promise.allSettled(startups);

	const cursor = { next: 0 };
	const runners: Promise<void>[] = [];
	const runnerCount = Math.max(1, Math.min(width, entries.length));
	for (let runner = 0; runner < runnerCount; runner++) {
		runners.push(drainStartupQueue({ entries, settlements, cursor, start }));
	}
	await Promise.all(runners);
	return settled;
}

export async function startPartitions({
	ctx,
	state,
	allocationGeneration,
	partitions,
}: AllocationScope & {
	partitions: number[];
}): Promise<void> {
	if (!isCurrentAllocation({ state, allocationGeneration })) return;
	const entries = createPartitionEntries({
		ctx,
		state,
		allocationGeneration,
		partitions,
	});

	async function startOne({ entry }: { entry: PartitionEntry }): Promise<void> {
		await startPartition({ state, entry, allocationGeneration });
	}

	const results = await runBoundedStartups({
		entries,
		width: BALANCE_WORKER_PARTITION_STARTUP_CONCURRENCY,
		start: startOne,
	});
	reportPartitionStartupFailures({
		ctx,
		state,
		entries,
		results,
		allocationGeneration,
	});
}
