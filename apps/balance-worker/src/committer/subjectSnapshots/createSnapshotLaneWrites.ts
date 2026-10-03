import { writesSubjectSnapshots } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type {
	SnapshotIntent,
	SnapshotIntentEntry,
} from "../../state/types/snapshotIntent.js";
import type {
	Committer,
	CommitterContext,
	PartitionPosition,
} from "../types/committer.js";
import type { SnapshotLaneWrites } from "./types/snapshotLaneWrites.js";

/**
 * Past this many pending customers a partition stops enqueuing: 20 statements of 500 drain in well under a
 * second, so a backlog beyond it means Postgres is the slow part, and a row left behind only costs its next flush.
 */
export const SNAPSHOT_LANE_MAX_PENDING = 10_000;

/** A partition's customers waiting for the lane, the latest word on each, and whether a tick is already queued. */
type PartitionWrites = {
	pending: SnapshotIntent;
	scheduled: boolean;
	warned: boolean;
};

type SnapshotLaneWritesContext = {
	committer: Pick<Committer, "apply">;
	logger?: Pick<NonNullable<CommitterContext["logger"]>, "warn">;
	/** Read at each tick: `dropBatch` sizes the statement, and off means no statement at all. */
	subjectSnapshotsConfig: NonNullable<
		CommitterContext["subjectSnapshotsConfig"]
	>;
	/** The partition's bookmark and claim as the store holds them: a backfill lands under both, so a stale owner's rolls back. */
	readNextOffset(position: PartitionPosition): bigint | null;
	claimTokenOf(position: PartitionPosition): string | undefined;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/**
 * Writes collect per partition, the latest per customer; each lane tick lands one statement of at most `dropBatch`,
 * one in flight per partition. A tick takes deletes or backfills, never both: only a backfill carries the bookmark
 * a stale owner rolls back on, and a DELETE must never roll back with it.
 */
export const createSnapshotLaneWrites = ({
	ctx,
}: {
	ctx: SnapshotLaneWritesContext;
}): SnapshotLaneWrites => {
	const byPartition = new Map<string, PartitionWrites>();

	function enqueue({
		topic,
		partition,
		customerKey,
		entry,
	}: {
		topic: string;
		partition: number;
		customerKey: string;
		entry: SnapshotIntentEntry;
	}): void {
		// Off keeps Postgres untouched: nothing was written, so nothing is owed.
		if (!writesSubjectSnapshots(ctx.subjectSnapshotsConfig.get())) return;
		const position = { topic, partition };
		const writes = partitionWritesOf({ byPartition, position });
		// A customer already pending always takes the latest word; the ceiling is on new customers.
		if (
			!writes.pending.has(customerKey) &&
			writes.pending.size >= SNAPSHOT_LANE_MAX_PENDING
		) {
			if (!writes.warned)
				ctx.logger?.warn(
					`[snapshot lane] ${keyOf(position)} has ${writes.pending.size} customers pending; further writes leave their rows to the next flush`,
				);
			writes.warned = true;
			return;
		}
		writes.pending.set(customerKey, entry);
		scheduleTick({ position, writes });
	}

	function scheduleTick({
		position,
		writes,
	}: {
		position: PartitionPosition;
		writes: PartitionWrites;
	}): void {
		if (writes.scheduled) return;
		writes.scheduled = true;
		void ctx.runInLane({ position, run: () => landTick({ position }) });
	}

	/** Never rejects: a statement that cannot land is logged, and the lane carries on. */
	async function landTick({
		position,
	}: {
		position: PartitionPosition;
	}): Promise<void> {
		const key = keyOf(position);
		const writes = byPartition.get(key);
		if (!writes) return;
		writes.scheduled = false;
		const settings = ctx.subjectSnapshotsConfig.get();
		// Flipped off since these were enqueued: what they would write is no longer served by anyone.
		if (!writesSubjectSnapshots(settings)) {
			byPartition.delete(key);
			return;
		}
		const snapshotIntent = takeWrites({ writes, batch: settings.dropBatch });
		if (writes.pending.size > 0) scheduleTick({ position, writes });
		else byPartition.delete(key);
		try {
			await ctx.committer.apply({
				...position,
				expectedOffset: ctx.readNextOffset(position) ?? 0n,
				claimToken: ctx.claimTokenOf(position),
				records: [],
				snapshotIntent,
			});
		} catch (cause) {
			ctx.logger?.warn(
				`[snapshot lane] ${key} could not write ${snapshotIntent.size} customers' rows: ${cause instanceof Error ? cause.message : String(cause)}`,
			);
		}
	}

	return {
		enqueueDelete: (params) => enqueue({ ...params, entry: "delete" }),
		enqueueBackfill: ({ states, baselineAt, ...params }) =>
			enqueue({ ...params, entry: { states, baselineAt } }),
	};
};

function keyOf(position: PartitionPosition): string {
	return `${position.topic}[${position.partition}]`;
}

function partitionWritesOf({
	byPartition,
	position,
}: {
	byPartition: Map<string, PartitionWrites>;
	position: PartitionPosition;
}): PartitionWrites {
	const key = keyOf(position);
	const writes = byPartition.get(key) ?? {
		pending: new Map(),
		scheduled: false,
		warned: false,
	};
	byPartition.set(key, writes);
	return writes;
}

/** The oldest pending customer decides the kind the tick takes; the other kind waits for the next. */
function takeWrites({
	writes,
	batch,
}: {
	writes: PartitionWrites;
	batch: number;
}): SnapshotIntent {
	const taken: SnapshotIntent = new Map();
	const kindOf = (entry: SnapshotIntentEntry) =>
		entry === "delete" ? "delete" : "backfill";
	let kind: "delete" | "backfill" | null = null;
	for (const [customerKey, entry] of writes.pending) {
		if (taken.size >= batch) break;
		kind ??= kindOf(entry);
		if (kindOf(entry) !== kind) continue;
		writes.pending.delete(customerKey);
		taken.set(customerKey, entry);
	}
	return taken;
}
