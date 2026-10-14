import type { CheckCommand, CheckResult } from "@autumn/balance-engine";
import type {
	ApiVersionClass,
	CheckLockParams,
	CheckParams,
	CheckQuery,
	CheckResponseV3,
} from "@autumn/shared";

/** A check as the caller sent it to Autumn's own API, read where it entered. */
export type CheckRequest = {
	requestId: string;
	occurredAt: number;
	/** The caller's Idempotency-Key, read as the API reads it; null when it sent none. */
	idempotencyKey: string | null;
	params: CheckParams;
	query: CheckQuery;
	/** Null when the caller named no `x-api-version`. */
	apiVersion: ApiVersionClass | null;
};

/** A decided check: the API's response, and the engine's result it was rendered from. */
export type CheckDecided = { response: CheckResponseV3; result: CheckResult };

/** A check Atom decides itself: a feature check on one customer, at a version the caller named. */
export type AnswerableCheck = {
	requestId: string;
	occurredAt: number;
	customerId: string;
	/** Null for a check on the customer itself. */
	entityId: string | null;
	featureId: string;
	requiredBalance: number;
	properties: CheckCommand["properties"];
	/** A lock to hold what the check deducts until a finalize settles it; null for none. */
	lock: CheckLockParams | null;
	query: CheckQuery;
	apiVersion: ApiVersionClass;
};
