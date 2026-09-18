import type { SubjectState } from "@autumn/balance-engine";

/** What a retry must match; the record itself lives only on the log. */
export type RememberedCommand = { fingerprint: string; expiresAt: number };

/**
 * The writer's one map: each subject's freshest rows, projected or committed, plus the
 * customer's recent command ids. Bounded by bytes; a pinned subject is never evicted.
 */
export type SubjectMap = {
	readState(params: { subjectKey: string }): SubjectState | null;
	setState(params: { subjectKey: string; state: SubjectState }): void;
	/** Held while a mutation is pending for the subject; released after commit. */
	pin(params: { subjectKey: string }): void;
	unpin(params: { subjectKey: string }): void;
	rememberCommand(
		params: { customerKey: string; commandId: string } & RememberedCommand,
	): void;
	readCommand(params: {
		customerKey: string;
		commandId: string;
		now: number;
	}): RememberedCommand | null;
	clear(): void;
	/** Bytes held by resident states, for tests and health. */
	sizeBytes(): number;
};
