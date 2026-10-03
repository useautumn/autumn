import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";

/** One subject waiting on the partition's next SELECT, and whom to answer with it. */
export type SnapshotWaiting = {
	identity: MeteringIdentity;
	subjectKey: string;
	asOf: number;
	/** True once an evict landed during this load: what it read must not be written back. */
	overtaken: () => boolean;
	settle: ReturnType<typeof Promise.withResolvers<SubjectState>>;
};

/** A subject the full query answers: with the row it had, when verifying, else without one. */
export type SnapshotFullRead = {
	waiting: SnapshotWaiting;
	snapshot: SubjectState | null;
};

export type SnapshotLoader = {
	/** The subject's baseline as the snapshot holds it, else as the full query answers; rejects NOT_READY when nothing may be asked. */
	load(params: {
		identity: MeteringIdentity;
		asOf: number;
		overtaken: () => boolean;
	}): Promise<SubjectState>;
	queueDepth(): number;
};
