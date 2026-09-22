import type { SubjectState } from "@autumn/balance-engine";

/**
 * The writer's one map: each subject's freshest rows, projected or committed.
 * Bounded by bytes; a pinned subject is never evicted.
 */
export type SubjectMap = {
	readState(params: { subjectKey: string }): SubjectState | null;
	setState(params: { subjectKey: string; state: SubjectState }): void;
	/** Held while a mutation is pending for the subject; released after commit. */
	pin(params: { subjectKey: string }): void;
	unpin(params: { subjectKey: string }): void;
	/** Drops the customer's resident rows, entities included. A pinned subject goes when its last pin is released. */
	evictCustomer(params: { customerKey: string }): void;
	clear(): void;
	/** Bytes held by resident states, for tests and health. */
	sizeBytes(): number;
};
