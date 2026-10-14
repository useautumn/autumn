import type { SubjectState } from "@autumn/balance-engine";

export type StoredSubjectState = {
	topic: string;
	partition: number;
	state: SubjectState;
};

export type StoredSubjectStates = {
	topic: string;
	partition: number;
	customer: SubjectState;
	entity: SubjectState | null;
};
