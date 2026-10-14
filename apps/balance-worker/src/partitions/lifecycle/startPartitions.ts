import { BALANCE_WORKER_PARTITION_STARTUP_CONCURRENCY } from "@autumn/env/balanceWorkerConstants";
import { isCurrentAllocation } from "../allocation/partitionAllocation.js";
import type {
	AllocationScope,
	PartitionEntry,
} from "../types/partitionState.js";
import {
	createPartitionEntries,
	reportPartitionStartupFailure,
	startPartition,
} from "./partitionStartup.js";

type StartOneEntry = (params: { entry: PartitionEntry }) => Promise<void>;

/** Named indirectly because this package's TypeScript configuration does not expose
 *  PromiseWithResolvers as a global type, even though the call itself resolves. */
function createStartupSettlement() {
	return Promise.withResolvers<void>();
}
type StartupSettlement = ReturnType<typeof createStartupSettlement>;

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

export async function runBoundedStartups({
	entries,
	width,
	start,
}: {
	entries: PartitionEntry[];
	width: number;
	start: StartOneEntry;
}): Promise<PromiseSettledResult<void>[]> {
	const settlements: StartupSettlement[] = [];
	const startups: Promise<void>[] = [];
	for (const entry of entries) {
		const settlement = createStartupSettlement();
		entry.startup = settlement.promise;
		settlements.push(settlement);
		startups.push(settlement.promise);
	}

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
		try {
			await startPartition({ ctx, state, entry, allocationGeneration });
		} catch (cause) {
			reportPartitionStartupFailure({
				ctx,
				state,
				entry,
				cause,
				allocationGeneration,
			});
			throw cause;
		}
	}

	await runBoundedStartups({
		entries,
		width: BALANCE_WORKER_PARTITION_STARTUP_CONCURRENCY,
		start: startOne,
	});
}
