import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import type { SubjectSnapshotControl } from "../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { Committer, PartitionPosition } from "../types/committer.js";
import type { SubjectSnapshots } from "./types/subjectSnapshots.js";

/** The claim is the one held when the drop was asked: a partition claimed again since lands it as nothing. */
type PendingDrop = {
	customer: SubjectSnapshotCustomer;
	claimToken: string | undefined;
	settled: ReturnType<typeof Promise.withResolvers<void>>;
};

/** A partition's drops not yet taken, and whether a lane DELETE is already queued to take them. */
type PartitionDrops = { pending: Map<string, PendingDrop>; scheduled: boolean };

type SubjectSnapshotsContext = {
	committer: Pick<Committer, "apply">;
	snapshots: SubjectSnapshotControl;
	claimTokenOf(position: PartitionPosition): string | undefined;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

/** Evicts collect per partition; each lane tick lands one DELETE under one claim, then settles the callers it took. */
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
		const claimToken = ctx.claimTokenOf(position);
		const existing = drops.pending.get(dropKeyOf({ customer, claimToken }));
		if (existing) return existing.settled.promise;
		const drop = collectDrop({ drops, customer, claimToken });
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
		const taken = takeDropsUnderOneClaim({ drops, dropBatch });
		if (drops.pending.size > 0) scheduleDelete({ position, drops });
		else byPartition.delete(key);
		try {
			await ctx.committer.apply({
				...position,
				expectedOffset: 0n,
				claimToken: taken[0]?.claimToken,
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

/** The same customer asked under a different claim is a different drop: the earlier one may land as nothing. */
function dropKeyOf({
	customer,
	claimToken,
}: {
	customer: SubjectSnapshotCustomer;
	claimToken: string | undefined;
}): string {
	return JSON.stringify([
		customer.orgId,
		customer.env,
		customer.customerId,
		claimToken ?? null,
	]);
}

function collectDrop({
	drops,
	customer,
	claimToken,
}: {
	drops: PartitionDrops;
	customer: SubjectSnapshotCustomer;
	claimToken: string | undefined;
}): PendingDrop {
	const drop: PendingDrop = {
		customer,
		claimToken,
		settled: Promise.withResolvers<void>(),
	};
	drops.pending.set(dropKeyOf({ customer, claimToken }), drop);
	return drop;
}

/** One claim per DELETE: drops asked under a later claim wait for the next lane tick. */
function takeDropsUnderOneClaim({
	drops,
	dropBatch,
}: {
	drops: PartitionDrops;
	dropBatch: number;
}): PendingDrop[] {
	const taken: PendingDrop[] = [];
	for (const [key, drop] of drops.pending) {
		if (taken.length >= dropBatch) break;
		if (taken[0] && taken[0].claimToken !== drop.claimToken) continue;
		drops.pending.delete(key);
		taken.push(drop);
	}
	return taken;
}
