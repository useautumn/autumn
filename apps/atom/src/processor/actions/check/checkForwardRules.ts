import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import type { AnswerableCheck, CheckRequest } from "../../types/check.js";

const DEFAULT_REQUIRED_BALANCE = 1;

/** Whether the deployment lets this Atom deduct: its writes flag, off by default. */
type Deployment = { writes: boolean };

/** Every kind of check Atom leaves to the API, told from the request and its deployment. The first rule that applies names the reason. */
const FORWARD_RULES: {
	reason: ForwardReason;
	applies: (request: CheckRequest, deployment: Deployment) => boolean;
}[] = [
	// The API derives a version from the org's creation date, which Atom does not hold.
	{
		reason: "no_api_version",
		applies: ({ apiVersion }) => apiVersion === null,
	},
	// Plans, not balances, answer a product check.
	{
		reason: "product_check",
		applies: ({ params }) => !params.feature_id || Boolean(params.product_id),
	},
	// Atom deducts a customer's own send_event only where its deployment writes; an entity's stays the API's.
	{
		reason: "send_event",
		applies: ({ params }, { writes }) =>
			params.send_event === true && (!writes || Boolean(params.entity_id)),
	},
	// A reservation is the API's.
	{ reason: "lock", applies: ({ params }) => params.lock !== undefined },
	// A preview reads the org's plans from Postgres.
	{
		reason: "with_preview",
		applies: ({ params }) => params.with_preview === true,
	},
	// These can create the customer or the entity.
	{
		reason: "customer_data",
		applies: ({ params }) =>
			params.customer_data !== undefined || params.entity_data !== undefined,
	},
	// The caller asked for the database, not a copy.
	{ reason: "skip_cache", applies: ({ query }) => query.skip_cache === true },
];

/** Why this check goes to the API; null when nothing in it rules Atom out. */
export const checkForwardReason = ({
	request,
	writes = false,
}: {
	request: CheckRequest;
	writes?: boolean;
}): ForwardReason | null =>
	FORWARD_RULES.find(({ applies }) => applies(request, { writes }))?.reason ??
	null;

/** The request reduced to what Atom decides on; a request a rule applies to is left to the API. */
export const checkRequestToAnswerableCheck = ({
	request,
	writes = false,
}: {
	request: CheckRequest;
	writes?: boolean;
}): AnswerableCheck => {
	const reason = checkForwardReason({ request, writes });
	if (reason) throw new CannotAnswerError({ reason });

	const { params, apiVersion } = request;
	// No rule applied, so both are present; these only tell the compiler.
	if (!params.feature_id)
		throw new CannotAnswerError({ reason: "product_check" });
	if (!apiVersion) throw new CannotAnswerError({ reason: "no_api_version" });

	return {
		requestId: request.requestId,
		occurredAt: request.occurredAt,
		customerId: params.customer_id,
		entityId: params.entity_id ?? null,
		featureId: params.feature_id,
		requiredBalance:
			params.required_balance ??
			params.required_quantity ??
			DEFAULT_REQUIRED_BALANCE,
		properties: params.properties ?? null,
		query: request.query,
		apiVersion,
	};
};
