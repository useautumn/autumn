import type { CustomerState } from "@autumn/balance-engine";

export type StoredSubjectState = {
	topic: string;
	partition: number;
	state: CustomerState;
};
