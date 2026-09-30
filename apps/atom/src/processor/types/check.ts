import type { CheckCommand } from "@autumn/balance-engine";
import type { ApiVersionClass, CheckParams, CheckQuery } from "@autumn/shared";

/** A check as the caller sent it to Autumn's own API, read where it entered. */
export type CheckRequest = {
	requestId: string;
	occurredAt: number;
	params: CheckParams;
	query: CheckQuery;
	/** Null when the caller named no `x-api-version`. */
	apiVersion: ApiVersionClass | null;
};

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
	query: CheckQuery;
	apiVersion: ApiVersionClass;
};
