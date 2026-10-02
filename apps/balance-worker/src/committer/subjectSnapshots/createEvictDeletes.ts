import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import type { SubjectSnapshotControl } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { Committer, PartitionPosition } from "../types/committer.js";
import type { SubjectSnapshots } from "./types/subjectSnapshots.js";

type PendingEvictDelete = {
	customer: SubjectSnapshotCustomer;
	settled: ReturnType<typeof Promise.withResolvers<void>>;
};

/** A partition's evict deletes not yet taken, and whether a lane DELETE is already queued to take them. */
type PartitionEvictDeletes = {
	pending: Map<string, PendingEvictDelete>;
	scheduled: boolean;
};

type SubjectSnapshotsContext = {
	committer: Pick<Committer, "apply">;
	snapshots: SubjectSnapshotControl;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/** Evicts collect per partition; each lane tick lands one DELETE, then settles the evicts it took. */
export const createEvictDeletes = ({
	ctx,
}: {
	ctx: SubjectSnapshotsContext;
}): SubjectSnapshots => {
	const byPartition = new Map<string, PartitionEvictDeletes>();

	function dropCustomer({
		topic,
		partition,
		customer,
	}: Parameters<SubjectSnapshots["dropCustomer"]>[0]): Promise<void> {
		const position = { topic, partition };
		const drops = partitionEvictDeletesOf({ byPartition, position });
		const existing = drops.pending.get(evictDeleteKeyOf({ customer }));
		if (existing) return existing.settled.promise;
		const drop = collectEvictDelete({ drops, customer });
		scheduleEvictDelete({ position, drops });
		return drop.settled.promise;
	}

	function scheduleEvictDelete({
		position,
		drops,
	}: {
		position: PartitionPosition;
		drops: PartitionEvictDeletes;
	}): void {
		if (drops.scheduled) return;
		drops.scheduled = true;
		void ctx.runInLane({ position, run: () => landEvictDelete({ position }) });
	}

	/** Never rejects: a failed DELETE rejects its evicts, not the lane. */
	async function landEvictDelete({
		position,
	}: {
		position: PartitionPosition;
	}): Promise<void> {
		const key = keyOf(position);
		const drops = byPartition.get(key);
		if (!drops) return;
		drops.scheduled = false;
		const { dropBatch } = ctx.snapshots.read();
		const taken = takeEvictDeletes({ drops, dropBatch });
		if (drops.pending.size > 0) scheduleEvictDelete({ position, drops });
		else byPartition.delete(key);
		try {
			// No claim: a DELETE is always safe to land, at worst it removes a row the new owner will write again.
			await ctx.committer.apply({
				...position,
				expectedOffset: 0n,
				records: [],
				snapshotDrops: taken.map((drop) => drop.customer),
			});
			for (const drop of taken) drop.settled.resolve();
		} catch (cause) {
			for (const drop of taken) drop.settled.reject(cause);
		}
	}

	function written(): boolean {
		return ctx.snapshots.read().mode === "write";
	}

	return { written, dropCustomer };
};

function keyOf(position: PartitionPosition): string {
	return `${position.topic}[${position.partition}]`;
}

function partitionEvictDeletesOf({
	byPartition,
	position,
}: {
	byPartition: Map<string, PartitionEvictDeletes>;
	position: PartitionPosition;
}): PartitionEvictDeletes {
	const key = keyOf(position);
	const drops = byPartition.get(key) ?? {
		pending: new Map(),
		scheduled: false,
	};
	byPartition.set(key, drops);
	return drops;
}

function evictDeleteKeyOf({
	customer,
}: {
	customer: SubjectSnapshotCustomer;
}): string {
	return JSON.stringify([customer.orgId, customer.env, customer.customerId]);
}

function collectEvictDelete({
	drops,
	customer,
}: {
	drops: PartitionEvictDeletes;
	customer: SubjectSnapshotCustomer;
}): PendingEvictDelete {
	const drop: PendingEvictDelete = {
		customer,
		settled: Promise.withResolvers<void>(),
	};
	drops.pending.set(evictDeleteKeyOf({ customer }), drop);
	return drop;
}

function takeEvictDeletes({
	drops,
	dropBatch,
}: {
	drops: PartitionEvictDeletes;
	dropBatch: number;
}): PendingEvictDelete[] {
	const taken: PendingEvictDelete[] = [];
	for (const [key, drop] of drops.pending) {
		if (taken.length >= dropBatch) break;
		drops.pending.delete(key);
		taken.push(drop);
	}
	return taken;
}
