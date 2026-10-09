import type { SubjectState } from "@autumn/balance-engine";

/** `kept`: resident subjects `drops` spared. `resident`: picked but pinned by a write that landed meanwhile. */
export type ResidentDrop = { evicted: number; kept: number; resident: number };

/** Synchronous, called once an evict has left nothing of the customer resident. */
export type OnSubjectEvicted = (params: { customerKey: string }) => void;

/**
 * The writer's one map: each subject's freshest rows, projected or committed.
 * Bounded by bytes; a pinned subject is never evicted.
 */
export type SubjectMap = {
	readState(params: { subjectKey: string }): SubjectState | null;
	/** `customerKey` is the subject's customer, so an evict of the customer finds its entities without a walk.
	 *  `baselineAt` is when the rows were read whole; a projection carries the one its subject already has. */
	setState(params: {
		subjectKey: string;
		customerKey: string;
		state: SubjectState;
		baselineAt?: number;
	}): void;
	/** Null until the subject's rows were read whole from Postgres. */
	readBaselineAt(params: { subjectKey: string }): number | null;
	/** The resident state's serialised size as the map already weighed it; 0 when nothing is resident. */
	readBytes(params: { subjectKey: string }): number;
	/** Held while a mutation is pending for the subject; released once the store holds it. */
	pin(params: { subjectKey: string }): void;
	unpin(params: { subjectKey: string }): void;
	/** Drops the customer's resident rows, entities included. A pinned subject goes when its last pin is released. */
	evictCustomer(params: { customerKey: string }): void;
	/** Drops each resident subject `drops` picks and no write pins; nothing reaches `onEvicted`, since Postgres holds them true. */
	dropResident(params: {
		drops: (subject: { customerKey: string; idleMs: number }) => boolean;
	}): ResidentDrop;
	clear(): void;
	/** Bytes held by resident states, for tests and health. */
	sizeBytes(): number;
	bytesOf(params: { subjectKey: string }): number | null;
};
