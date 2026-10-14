import type { FinalizeCommand } from "@autumn/balance-engine";
import type { ApiVersionClass, FinalizeLockParamsV1 } from "@autumn/shared";

/** A finalize as the caller sent it to Autumn's own API, read where it entered. */
export type FinalizeRequest = {
	requestId: string;
	occurredAt: number;
	/** At 2.6 on, so it names its lock's customer, which routes it. */
	params: FinalizeLockParamsV1;
	apiVersion: ApiVersionClass;
};

/** A finalize the Atom settles itself: of a lock on one customer, at the value its action names. */
export type AnswerableFinalize = {
	customerId: string;
	lockId: string;
	/** 0 releases the lock, null confirms it at what it took, any other value settles it there. */
	finalValue: number | null;
	properties: FinalizeCommand["properties"];
};

/** What the API answers a finalize with. */
export type FinalizeResponse = { success: true };
