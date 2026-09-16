import type { CustomerMeteringState } from "@autumn/balance-engine";

export type StoredMeteringState = {
	topic: string;
	partition: number;
	initializationId: string;
	initializationFingerprint: string;
	state: CustomerMeteringState;
};
