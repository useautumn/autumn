import type { EdgeConfigStore } from "@autumn/edge-config";
import type { SubjectSnapshotsEdgeConfig } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { SnapshotIntent } from "../../state/types/snapshotIntent.js";
import type {
	Committer,
	CommitterContext,
	PartitionPosition,
} from "../types/committer.js";
import type { EvictDeletes } from "./types/evictDeletes.js";

/**
 * Past this many pending customers a partition stops enqueuing: 20 statements of 500 drain in well under a
 * second, so a backlog beyond it means Postgres is the slow part, and a row left behind only costs its next flush.
 */
export const EVICT_DELETES_MAX_PENDING = 10_000;

/** A partition's customers waiting to be deleted, and whether a lane DELETE is already queued to take them. */
type PartitionDeletes = {
	pending: Set<string>;
	scheduled: boolean;
	warned: boolean;
};

type EvictDeletesContext = {
	committer: Pick<Committer, "apply">;
	logger?: Pick<NonNullable<CommitterContext["logger"]>, "warn">;
	/** Read at each tick: `dropBatch` sizes the DELETE, and off means no statement at all. */
	subjectSnapshotsConfig: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/** Evicts collect per partition; each lane tick lands one DELETE of at most `dropBatch` customers, one in flight per partition. */
export const createEvictDeletes = ({
	ctx,
}: {
	ctx: EvictDeletesContext;
}): EvictDeletes => {
	const byPartition = new Map<string, PartitionDeletes>();

	function enqueue({
		topic,
		partition,
		customerKey,
	}: Parameters<EvictDeletes["enqueue"]>[0]): void {
		// Off keeps Postgres untouched: nothing was written, so nothing is owed.
		if (ctx.subjectSnapshotsConfig.get().mode !== "write") return;
		const position = { topic, partition };
		const deletes = partitionDeletesOf({ byPartition, position });
		if (deletes.pending.size >= EVICT_DELETES_MAX_PENDING) {
			if (!deletes.warned)
				ctx.logger?.warn(
					`[evict deletes] ${keyOf(position)} has ${deletes.pending.size} customers pending; further evicts leave their rows to the next flush`,
				);
			deletes.warned = true;
			return;
		}
		deletes.pending.add(customerKey);
		scheduleDelete({ position, deletes });
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

	/** Never rejects: a DELETE that cannot land is logged, and the lane carries on. */
	async function landDelete({
		position,
	}: {
		position: PartitionPosition;
	}): Promise<void> {
		const key = keyOf(position);
		const deletes = byPartition.get(key);
		if (!deletes) return;
		deletes.scheduled = false;
		const { mode, dropBatch } = ctx.subjectSnapshotsConfig.get();
		// Flipped off since these were enqueued: what they would delete is no longer served by anyone.
		if (mode !== "write") {
			byPartition.delete(key);
			return;
		}
		const taken = takeDeletes({ deletes, batch: dropBatch });
		if (deletes.pending.size > 0) scheduleDelete({ position, deletes });
		else byPartition.delete(key);
		const snapshotIntent: SnapshotIntent = new Map(
			taken.map((customerKey) => [customerKey, "delete"]),
		);
		try {
			await ctx.committer.apply({
				...position,
				expectedOffset: 0n,
				records: [],
				snapshotIntent,
			});
		} catch (cause) {
			ctx.logger?.warn(
				`[evict deletes] ${key} could not delete ${taken.length} customers' rows: ${cause instanceof Error ? cause.message : String(cause)}`,
			);
		}
	}

	return { enqueue };
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
		pending: new Set(),
		scheduled: false,
		warned: false,
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
}): string[] {
	const taken: string[] = [];
	for (const customerKey of deletes.pending) {
		if (taken.length >= batch) break;
		deletes.pending.delete(customerKey);
		taken.push(customerKey);
	}
	return taken;
}
