import {
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { writesSubjectSnapshots } from "@autumn/edge-config";
import type { DeletedSubjectSnapshot } from "@autumn/postgres";
import type { SnapshotIntent } from "../../state/types/snapshotIntent.js";
import type {
	Committer,
	CommitterContext,
	PartitionPosition,
} from "../types/committer.js";
import type { SnapshotQueues } from "./types/snapshotQueues.js";

export const SNAPSHOT_LANE_MAX_PENDING = 10_000;

type PendingRefreshes = {
	states: Map<string, { state: SubjectState; logOffset: bigint }>;
	baselineAt: number;
};

type Landing = ReturnType<
	typeof Promise.withResolvers<DeletedSubjectSnapshot[]>
>;

type PartitionWrites = {
	deletes: Map<string, Landing>;
	deleting: Map<string, Landing>;
	refreshes: Map<string, PendingRefreshes>;
	pendingCount: number;
	scheduled: boolean;
	warned: boolean;
};

type SnapshotQueuesContext = {
	committer: Pick<Committer, "apply">;
	logger?: Pick<NonNullable<CommitterContext["logger"]>, "warn">;
	subjectSnapshotsConfig: NonNullable<
		CommitterContext["subjectSnapshotsConfig"]
	>;
	readNextOffset(position: PartitionPosition): bigint | null;
	claimTokenOf(position: PartitionPosition): string | undefined;
	runInLane(params: {
		position: PartitionPosition;
		run(): Promise<void>;
	}): Promise<void>;
};

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
		writes.deletes.set(
			customerKey,
			Promise.withResolvers<DeletedSubjectSnapshot[]>(),
		);
		writes.pendingCount += 1;
		scheduleTick({ position: { topic, partition }, writes });
	}

	function deleteLanded({
		topic,
		partition,
		customerKey,
	}: {
		topic: string;
		partition: number;
		customerKey: string;
	}): Promise<DeletedSubjectSnapshot[]> {
		const writes = byPartition.get(keyOf({ topic, partition }));
		const landing =
			writes?.deletes.get(customerKey) ?? writes?.deleting.get(customerKey);
		return landing?.promise ?? Promise.resolve([]);
	}

	function enqueueRefresh({
		topic,
		partition,
		state,
		baselineAt,
		logOffset,
	}: {
		topic: string;
		partition: number;
		state: SubjectState;
		baselineAt: number;
		logOffset: bigint;
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
		if (!alreadyPending && !hasRoom({ writes, position: { topic, partition } }))
			return;
		if (!alreadyPending) writes.pendingCount += 1;
		const refreshes = pending ?? { states: new Map(), baselineAt };
		refreshes.states.set(subjectKey, { state, logOffset });
		refreshes.baselineAt = Math.min(refreshes.baselineAt, baselineAt);
		writes.refreshes.set(customerKey, refreshes);
		scheduleTick({ position: { topic, partition }, writes });
	}

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
				`[snapshot lane] ${keyOf(position)} has ${writes.pendingCount} customers pending; further refreshes leave their rows to the next cold load`,
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
		if (!writesSubjectSnapshots(settings)) {
			for (const landing of writes.deletes.values()) landing.resolve([]);
			byPartition.delete(key);
			return;
		}
		const snapshotIntent = takeWrites({ writes, batch: settings.dropBatch });
		if (writes.pendingCount > 0) scheduleTick({ position, writes });
		let deleted: readonly DeletedSubjectSnapshot[] = [];
		try {
			const outcome = await ctx.committer.apply({
				...position,
				expectedOffset: ctx.readNextOffset(position) ?? 0n,
				claimToken: ctx.claimTokenOf(position),
				records: [],
				snapshotIntent,
			});
			deleted = outcome.deletedSnapshots ?? [];
		} catch (cause) {
			ctx.logger?.warn(
				`[snapshot lane] ${key} could not write ${snapshotIntent.size} customers' rows: ${cause instanceof Error ? cause.message : String(cause)}`,
			);
		} finally {
			const deletedByCustomer = groupByCustomer({ deleted });
			for (const [customerKey, landing] of writes.deleting)
				landing.resolve(deletedByCustomer.get(customerKey) ?? []);
			writes.deleting.clear();
			if (writes.pendingCount === 0 && !writes.scheduled)
				byPartition.delete(key);
		}
	}

	return { enqueueDelete, enqueueRefresh, deleteLanded };
};

function groupByCustomer({
	deleted,
}: {
	deleted: readonly DeletedSubjectSnapshot[];
}): Map<string, DeletedSubjectSnapshot[]> {
	const byCustomer = new Map<string, DeletedSubjectSnapshot[]>();
	for (const row of deleted) {
		const customerKey = meteringIdentityToPartitionKey({
			identity: { ...row, entityId: null },
		});
		const rows = byCustomer.get(customerKey) ?? [];
		rows.push(row);
		byCustomer.set(customerKey, rows);
	}
	return byCustomer;
}

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
		deletes: new Map(),
		deleting: new Map(),
		refreshes: new Map(),
		pendingCount: 0,
		scheduled: false,
		warned: false,
	};
	byPartition.set(key, writes);
	return writes;
}

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

function takeWrites({
	writes,
	batch,
}: {
	writes: PartitionWrites;
	batch: number;
}): SnapshotIntent {
	const taken: SnapshotIntent = new Map();
	if (writes.deletes.size > 0) {
		for (const [customerKey, landing] of writes.deletes) {
			if (taken.size >= batch) break;
			writes.deletes.delete(customerKey);
			writes.deleting.set(customerKey, landing);
			taken.set(customerKey, "delete");
		}
		writes.pendingCount -= taken.size;
		return taken;
	}
	let room = batch;
	for (const [customerKey, pending] of writes.refreshes) {
		if (room === 0) break;
		const states: SubjectState[] = [];
		const logOffsets = new Map<string, bigint>();
		for (const [subjectKey, refresh] of pending.states) {
			if (states.length === room) break;
			pending.states.delete(subjectKey);
			states.push(refresh.state);
			logOffsets.set(subjectKey, refresh.logOffset);
		}
		if (pending.states.size === 0) writes.refreshes.delete(customerKey);
		room -= states.length;
		taken.set(customerKey, {
			states,
			baselineAt: pending.baselineAt,
			logOffsets,
		});
	}
	writes.pendingCount -= batch - room;
	return taken;
}
