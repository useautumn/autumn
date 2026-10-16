import type { FinalizeCommand } from "@autumn/balance-engine";
import type { ApiVersionClass, FinalizeLockParamsV1 } from "@autumn/shared";

/** A finalize as the caller sent it to Autumn's own API, read where it entered. */
export type FinalizeRequest = {
	requestId: string;
	occurredAt: number;
	/** At 2.6 on, so it names its lock's customer, which routes it. */
	params: FinalizeLockParamsV1;
	apiVersion: ApiVersionClass;
	/** The replica the lock's customer just moved from, when its handoff (the lock's row among it) may still be on the way. */
	movedFrom: string | null;
};

/** A finalize the Atom settles itself: of a lock on one customer, at the value its action names. */
export type AnswerableFinalize = {
	customerId: string;
	lockId: string;
	/** 0 releases the lock, null confirms it at what it took, any other value settles it there. */
	finalValue: number | null;
	properties: FinalizeCommand["properties"];
};

/**
 * A finalize journaled as the caller sent it, for Autumn to decide behind the lock it names: the Atom read neither the
 * lock nor the subject, so it names no entity or feature, and its view moves nothing until Autumn's push.
 */
export type UndecidedFinalizeCommand = AnswerableFinalize & {
	type: "undecidedFinalize";
	requestId: string;
	occurredAt: number;
};

/** What the API answers a finalize with. */
export type FinalizeResponse = { success: true };
