import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import type { AutumnLogger } from "@autumn/logging";

/** A subject's rows read whole, and when: what a refresh writes back as its snapshot row. */
export type SubjectRefreshRead = {
	baseline: SubjectState;
	baselineAt: number;
};

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
	/** The subject's rows as Postgres holds them now; null when the subject is gone. */
	read(params: {
		identity: MeteringIdentity;
	}): Promise<SubjectRefreshRead | null>;
	/** Synchronous: the read becomes the subject's snapshot row. */
	write(params: { identity: MeteringIdentity; read: SubjectRefreshRead }): void;
	logger?: Partial<Pick<AutumnLogger, "warn">>;
};

/**
 * One partition's subjects whose snapshot rows an evict removed, rebuilt in the background: FIFO, each waiting once,
 * two reading at a time. A customer's evicts all reach its owner partition, so a read one overtakes is seen here.
 */
export type SnapshotRefreshQueue = {
	/** Synchronous: the customer was evicted; its own subject and the entities named wait for a refresh. */
	enqueue(params: {
		identity: MeteringIdentity;
		entityIds: readonly string[];
	}): void;
	/** Subjects waiting or reading. */
	depth(): number;
	counts(): SnapshotRefreshCounts;
	/** Resolves once nothing waits or reads. */
	settled(): Promise<void>;
	/** Drops what waits; a read in flight writes nothing. */
	dispose(): void;
};
