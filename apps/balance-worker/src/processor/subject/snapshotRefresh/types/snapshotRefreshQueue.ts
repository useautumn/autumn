import type { MeteringIdentity } from "@autumn/balance-engine";
import type { EdgeConfigStore } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { SubjectSnapshotsEdgeConfig } from "../../../../edgeConfig/subjectSnapshotsEdgeConfig.js";
import type { SubjectRead } from "../../types/subjectRead.js";

/** A refresh's read, with the partition's bookmark as it began, less one: the last log offset the rows include. */
export type SnapshotRefreshRead = SubjectRead & { logOffset: bigint };

export type SnapshotRefreshCounts = {
	/** Subjects taken into the queue; a subject already waiting is not counted twice. */
	queued: number;
	/** Rows written back. */
	refreshed: number;
	/** Reads superseded by a later evict of the customer, or with nothing left to write. */
	skipped: number;
	/** Reads that threw; each is logged. */
	failed: number;
};

export type SnapshotRefreshQueueContext = {
	/** The subject's rows as Postgres holds them now; null when there is nothing to write back. */
	read(params: {
		identity: MeteringIdentity;
	}): Promise<SnapshotRefreshRead | null>;
	/** Synchronous, never a Promise: the queue does not await it. An enqueue onto the lane, which is sync. */
	write(params: {
		identity: MeteringIdentity;
		read: SnapshotRefreshRead;
	}): void;
	/** Read at each decision: `refreshConcurrency` as a read is started, `refreshMaxPending` as a subject is queued. */
	subjectSnapshotsConfig: Pick<
		EdgeConfigStore<SubjectSnapshotsEdgeConfig>,
		"get"
	>;
	/** Each count as it happens, for the worker's database line. */
	recordCounts?(counts: Partial<SnapshotRefreshCounts>): void;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

/**
 * One partition's subjects whose snapshot rows an evict removed, rebuilt in the background: FIFO, each waiting once,
 * `refreshConcurrency` reading at a time. A customer's evicts all reach its owner partition, so a read one overtakes is seen here.
 */
export type SnapshotRefreshQueue = {
	/** Synchronous: a customer was evicted; the subjects named, every one of that customer, wait for a refresh. */
	enqueue(params: {
		customer: MeteringIdentity;
		subjects: readonly MeteringIdentity[];
	}): void;
	/** Subjects waiting or reading. */
	depth(): number;
	counts(): SnapshotRefreshCounts;
	/** Resolves once nothing waits or reads. */
	settled(): Promise<void>;
	/** Drops what waits; a read in flight writes nothing. */
	dispose(): void;
};
