import {
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { writesSubjectSnapshots } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { SnapshotIntent } from "../../state/types/snapshotIntent.js";
import type {
	Committer,
	CommitterContext,
	PartitionPosition,
} from "../types/committer.js";
import type { SnapshotQueues } from "./types/snapshotQueues.js";

/**
 * Past this many pending entries a partition stops enqueuing: 20 statements of 500 drain in well under a
 * second, so a backlog beyond it means Postgres is the slow part, and a row left behind only costs its next flush.
 */
export const SNAPSHOT_LANE_MAX_PENDING = 10_000;

/** One customer's refreshed subjects waiting for a tick; `baselineAt` is the earliest read among them. */
type PendingRefreshes = {
	states: Map<string, SubjectState>;
	baselineAt: number;
};

/** A partition's writes waiting for the lane: customers to delete, subjects to refresh by customer, and whether a tick is queued. */
type PartitionWrites = {
	deletes: Set<string>;
	refreshes: Map<string, PendingRefreshes>;
	pendingCount: number;
	scheduled: boolean;
	warned: boolean;
};

type SnapshotQueuesContext = {
	committer: Pick<Committer, "apply">;
	logger?: Pick<NonNullable<CommitterContext["logger"]>, "warn">;
	/** Read at each tick: `dropBatch` sizes the statement, and off means no statement at all. */
	subjectSnapshotsConfig: NonNullable<
		CommitterContext["subjectSnapshotsConfig"]
	>;
	/** The partition's bookmark and claim as the store holds them: a refresh lands under both, so a stale owner's rolls back. */
	readNextOffset(position: PartitionPosition): bigint | null;
	claimTokenOf(position: PartitionPosition): string | undefined;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/**
 * Writes collect per partition; each lane tick lands one statement of at most `dropBatch`, one in flight per partition.
 * A tick takes deletes while any wait, else refreshes, never both: only a refresh carries the bookmark a stale owner
 * rolls back on, and a DELETE must never roll back with it. Deletes first also keeps an evict ahead of its refreshes.
 */
export const createSnapshotQueues = ({
	ctx,
}: {
	ctx: SnapshotQueuesContext;
}): SnapshotQueues => {
	const byPartition = new Map<string, PartitionWrites>();

	function enqueueDelete({
		topic,
		partition,
		customerKey,
	}: {
		topic: string;
		partition: number;
		customerKey: string;
	}): void {
		const writes = writesWhenOn({ position: { topic, partition } });
		if (!writes) return;
		dropRefreshes({ writes, customerKey });
		if (writes.deletes.has(customerKey)) return;
		if (!hasRoom({ writes, position: { topic, partition } })) return;
		writes.deletes.add(customerKey);
		writes.pendingCount += 1;
		scheduleTick({ position: { topic, partition }, writes });
	}

	function enqueueRefresh({
		topic,
		partition,
		state,
		baselineAt,
	}: {
		topic: string;
		partition: number;
		state: SubjectState;
		baselineAt: number;
	}): void {
		const writes = writesWhenOn({ position: { topic, partition } });
		if (!writes) return;
		const customerKey = meteringIdentityToPartitionKey({
			identity: state.identity,
		});
		const subjectKey = meteringIdentityToSubjectKey({
			identity: state.identity,
		});
		const pending = writes.refreshes.get(customerKey);
		const alreadyPending = pending?.states.has(subjectKey) ?? false;
		// A subject already pending always takes the latest word; the ceiling is on new subjects.
		if (!alreadyPending && !hasRoom({ writes, position: { topic, partition } }))
			return;
		if (!alreadyPending) writes.pendingCount += 1;
		const refreshes = pending ?? { states: new Map(), baselineAt };
		refreshes.states.set(subjectKey, state);
		refreshes.baselineAt = Math.min(refreshes.baselineAt, baselineAt);
		writes.refreshes.set(customerKey, refreshes);
		scheduleTick({ position: { topic, partition }, writes });
	}

	/** The partition's pending writes, or nothing when the mode is off: nothing was written, so nothing is owed. */
	function writesWhenOn({
		position,
	}: {
		position: PartitionPosition;
	}): PartitionWrites | undefined {
		if (!writesSubjectSnapshots(ctx.subjectSnapshotsConfig.get()))
			return undefined;
		return partitionWritesOf({ byPartition, position });
	}

	function hasRoom({
		writes,
		position,
	}: {
		writes: PartitionWrites;
		position: PartitionPosition;
	}): boolean {
		if (writes.pendingCount < SNAPSHOT_LANE_MAX_PENDING) return true;
		if (!writes.warned)
			ctx.logger?.warn(
				`[snapshot lane] ${keyOf(position)} has ${writes.pendingCount} customers pending; further writes leave their rows to the next flush`,
			);
		writes.warned = true;
		return false;
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
		if (writes.pendingCount > 0) scheduleTick({ position, writes });
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

	return { enqueueDelete, enqueueRefresh };
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
		deletes: new Set(),
		refreshes: new Map(),
		pendingCount: 0,
		scheduled: false,
		warned: false,
	};
	byPartition.set(key, writes);
	return writes;
}

/** A refresh still pending when the customer is evicted again predates that evict: it goes, and the evict queues a fresh one. */
function dropRefreshes({
	writes,
	customerKey,
}: {
	writes: PartitionWrites;
	customerKey: string;
}): void {
	const pending = writes.refreshes.get(customerKey);
	if (!pending) return;
	writes.refreshes.delete(customerKey);
	writes.pendingCount -= pending.states.size;
}

/** Deletes while any wait, else refreshes, up to `batch` entries; a customer's refreshes beyond the batch wait for the next. */
function takeWrites({
	writes,
	batch,
}: {
	writes: PartitionWrites;
	batch: number;
}): SnapshotIntent {
	const taken: SnapshotIntent = new Map();
	if (writes.deletes.size > 0) {
		for (const customerKey of writes.deletes) {
			if (taken.size >= batch) break;
			writes.deletes.delete(customerKey);
			taken.set(customerKey, "delete");
		}
		writes.pendingCount -= taken.size;
		return taken;
	}
	let room = batch;
	for (const [customerKey, pending] of writes.refreshes) {
		if (room === 0) break;
		const states: SubjectState[] = [];
		for (const [subjectKey, state] of pending.states) {
			if (states.length === room) break;
			pending.states.delete(subjectKey);
			states.push(state);
		}
		if (pending.states.size === 0) writes.refreshes.delete(customerKey);
		room -= states.length;
		taken.set(customerKey, { states, baselineAt: pending.baselineAt });
	}
	writes.pendingCount -= batch - room;
	return taken;
}
