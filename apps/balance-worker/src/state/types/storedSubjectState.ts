import type { SubjectState } from "@autumn/balance-engine";

/** One subject state as stored: the customer's own rows, or one entity's rows. */
export type StoredSubjectState = {
	topic: string;
	partition: number;
	state: SubjectState;
};

/** The states a command's identity reads: the customer's, plus the named entity's when it has one. */
export type StoredSubjectStates = {
	topic: string;
	partition: number;
	customer: SubjectState;
	entity: SubjectState | null;
};
