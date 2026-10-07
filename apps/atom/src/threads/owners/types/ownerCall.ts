import type { CatalogRow } from "@autumn/balance-engine";
import type { ApiVersion } from "@autumn/shared";
import type { ForwardReason } from "../../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../../processor/types/check.js";
import type { CheckAnswer } from "../../../processor/types/slotProcessor.js";

/** A check as it crosses threads: plain data, with the API version by name. */
export type CheckRequestOnWire = Omit<CheckRequest, "apiVersion"> & {
	apiVersion: ApiVersion | null;
};

/** The whole shared catalog, as Autumn sent it. */
export type CatalogUpdate = { rows: CatalogRow[]; readAt: number };

/** A call to the thread that owns a customer's slot, in the folder `atomId` names (null: a deployment's one folder). */
export type OwnerCallBody = { atomId: string | null } & (
	| { type: "check"; request: CheckRequestOnWire }
	| { type: "setSubject"; customerId: string; body: string }
	| { type: "setCatalog"; catalog: CatalogUpdate }
	| { type: "installCatalog"; catalog: CatalogUpdate }
);

/**
 * Numbered by the caller, which matches the reply to it. Crosses as JSON text, since a structured clone of parsed data costs
 * about 3× as much; a subject push crosses as an object, whose one large field is already text and so clones as a copy.
 */
export type OwnerCall = OwnerCallBody & { id: number; sentAt?: number };

/** The owner's answer (a check's is its JSON and verdict); one it cannot answer carries the reason, so the caller's thread forwards it. */
export type OwnerReply =
	| { id: number; ok: true; value: CheckAnswer | boolean }
	| {
			id: number;
			ok: false;
			cannotAnswer: ForwardReason | null;
			/** The push can never apply: thrown again on the caller's thread as InvalidPushError. */
			invalid: boolean;
			message: string;
	  };
