import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import type { SubjectSnapshotControl } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { Committer, PartitionPosition } from "../types/committer.js";
import type { SubjectSnapshots } from "./types/subjectSnapshots.js";

type PendingDrop = {
	customer: SubjectSnapshotCustomer;
	settled: ReturnType<typeof Promise.withResolvers<void>>;
};

/** A partition's drops not yet taken, and whether a lane DELETE is already queued to take them. */
type PartitionDrops = { pending: Map<string, PendingDrop>; scheduled: boolean };

type SubjectSnapshotsContext = {
	committer: Pick<Committer, "apply">;
	snapshots: SubjectSnapshotControl;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/** Evicts collect per partition; each lane tick lands one DELETE, then settles the callers it took. */
export const createSubjectSnapshots = ({
	ctx,
}: {
	ctx: SubjectSnapshotsContext;
}): SubjectSnapshots => {
	const byPartition = new Map<string, PartitionDrops>();

	function dropCustomer({
		topic,
		partition,
		customer,
	}: Parameters<SubjectSnapshots["dropCustomer"]>[0]): Promise<void> {
		const position = { topic, partition };
		const drops = partitionDropsOf({ byPartition, position });
		const existing = drops.pending.get(dropKeyOf({ customer }));
		if (existing) return existing.settled.promise;
		const drop = collectDrop({ drops, customer });
		scheduleDelete({ position, drops });
		return drop.settled.promise;
	}

	function scheduleDelete({
		position,
		drops,
	}: {
		position: PartitionPosition;
		drops: PartitionDrops;
	}): void {
		if (drops.scheduled) return;
		drops.scheduled = true;
		void ctx.runInLane({ position, run: () => landDelete({ position }) });
	}

	/** Never rejects: a failed DELETE rejects its callers, not the lane. */
	async function landDelete({
		position,
	}: {
		position: PartitionPosition;
	}): Promise<void> {
		const key = keyOf(position);
		const drops = byPartition.get(key);
		if (!drops) return;
		drops.scheduled = false;
		const { dropBatch } = ctx.snapshots.read();
		const taken = takeDrops({ drops, dropBatch });
		if (drops.pending.size > 0) scheduleDelete({ position, drops });
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

function partitionDropsOf({
	byPartition,
	position,
}: {
	byPartition: Map<string, PartitionDrops>;
	position: PartitionPosition;
}): PartitionDrops {
	const key = keyOf(position);
	const drops = byPartition.get(key) ?? {
		pending: new Map(),
		scheduled: false,
	};
	byPartition.set(key, drops);
	return drops;
}

function dropKeyOf({
	customer,
}: {
	customer: SubjectSnapshotCustomer;
}): string {
	return JSON.stringify([customer.orgId, customer.env, customer.customerId]);
}

function collectDrop({
	drops,
	customer,
}: {
	drops: PartitionDrops;
	customer: SubjectSnapshotCustomer;
}): PendingDrop {
	const drop: PendingDrop = {
		customer,
		settled: Promise.withResolvers<void>(),
	};
	drops.pending.set(dropKeyOf({ customer }), drop);
	return drop;
}

function takeDrops({
	drops,
	dropBatch,
}: {
	drops: PartitionDrops;
	dropBatch: number;
}): PendingDrop[] {
	const taken: PendingDrop[] = [];
	for (const [key, drop] of drops.pending) {
		if (taken.length >= dropBatch) break;
		drops.pending.delete(key);
		taken.push(drop);
	}
	return taken;
}
