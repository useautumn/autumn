import type { SnapshotIntent } from "../../state/types/snapshotIntent.js";
import type { Committer, PartitionPosition } from "../types/committer.js";
import type { EvictDeletes } from "./types/evictDeletes.js";

type Settled = ReturnType<typeof Promise.withResolvers<void>>;

/** A partition's customers waiting to be deleted, and whether a lane DELETE is already queued to take them. */
type PartitionDeletes = {
	pending: Map<string, Settled>;
	scheduled: boolean;
};

type EvictDeletesContext = {
	committer: Pick<Committer, "apply">;
	/** Customers one DELETE carries; a storm of evicts lands as this many per statement. */
	batch: number;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/** Evicts collect per partition; each lane tick lands one DELETE, then settles the evicts it took. */
export const createEvictDeletes = ({
	ctx,
}: {
	ctx: EvictDeletesContext;
}): EvictDeletes => {
	const byPartition = new Map<string, PartitionDeletes>();

	function deleteCustomer({
		topic,
		partition,
		customerKey,
	}: Parameters<EvictDeletes["deleteCustomer"]>[0]): Promise<void> {
		const position = { topic, partition };
		const deletes = partitionDeletesOf({ byPartition, position });
		const existing = deletes.pending.get(customerKey);
		if (existing) return existing.promise;
		const settled = Promise.withResolvers<void>();
		deletes.pending.set(customerKey, settled);
		scheduleDelete({ position, deletes });
		return settled.promise;
	}

	function scheduleDelete({
		position,
		deletes,
	}: {
		position: PartitionPosition;
		deletes: PartitionDeletes;
	}): void {
		if (deletes.scheduled) return;
		deletes.scheduled = true;
		void ctx.runInLane({ position, run: () => landDelete({ position }) });
	}

	/** Never rejects: a failed DELETE rejects its evicts, not the lane. */
	async function landDelete({
		position,
	}: {
		position: PartitionPosition;
	}): Promise<void> {
		const key = keyOf(position);
		const deletes = byPartition.get(key);
		if (!deletes) return;
		deletes.scheduled = false;
		const taken = takeDeletes({ deletes, batch: ctx.batch });
		if (deletes.pending.size > 0) scheduleDelete({ position, deletes });
		else byPartition.delete(key);
		const snapshotIntent: SnapshotIntent = new Map(
			[...taken.keys()].map((customerKey) => [customerKey, "delete"]),
		);
		try {
			await ctx.committer.apply({
				...position,
				expectedOffset: 0n,
				records: [],
				snapshotIntent,
			});
			for (const settled of taken.values()) settled.resolve();
		} catch (cause) {
			for (const settled of taken.values()) settled.reject(cause);
		}
	}

	return { deleteCustomer };
};

function keyOf(position: PartitionPosition): string {
	return `${position.topic}[${position.partition}]`;
}

function partitionDeletesOf({
	byPartition,
	position,
}: {
	byPartition: Map<string, PartitionDeletes>;
	position: PartitionPosition;
}): PartitionDeletes {
	const key = keyOf(position);
	const deletes = byPartition.get(key) ?? {
		pending: new Map(),
		scheduled: false,
	};
	byPartition.set(key, deletes);
	return deletes;
}

function takeDeletes({
	deletes,
	batch,
}: {
	deletes: PartitionDeletes;
	batch: number;
}): Map<string, Settled> {
	const taken = new Map<string, Settled>();
	for (const [customerKey, settled] of deletes.pending) {
		if (taken.size >= batch) break;
		deletes.pending.delete(customerKey);
		taken.set(customerKey, settled);
	}
	return taken;
}
