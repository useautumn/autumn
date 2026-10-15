import type { Context } from "hono";
import { checkCallToRequest } from "../../lib/contracts/checkContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export const API_VERSION_HEADER = "x-api-version";
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
/** Set by the replica a check arrived at, read only on one handed on by a peer: its deduction keeps one idempotency key. */
export const REQUEST_ID_HEADER = "x-atom-request-id";
export const OCCURRED_AT_HEADER = "x-atom-occurred-at";

/** On a refused check, the engine's limit and reason, beside x-atom-forwarded, for the comparer against the API. */
const LIMIT_TYPE_HEADER = "x-atom-limit-type";
const DENY_REASON_HEADER = "x-atom-deny-reason";

export const newRequestId = () => `atom_req_${crypto.randomUUID()}`;

export const arrivalOf = (context: Context<AtomHttpEnv>) => {
	const relayedId = context.get("relayed")
		? context.req.header(REQUEST_ID_HEADER)
		: undefined;
	const requestId = relayedId ?? newRequestId();
	context.set("requestId", requestId);
	if (!relayedId) return { requestId, occurredAt: Date.now() };
	return {
		requestId,
		occurredAt: Number(context.req.header(OCCURRED_AT_HEADER) ?? Date.now()),
	};
};

export async function receiveCheck(context: Context<AtomHttpEnv>) {
	const request = checkCallToRequest({
		body: context.get("body"),
		query: context.req.query(),
		apiVersionHeader: context.req.header(API_VERSION_HEADER),
		idempotencyKey: context.req.header(IDEMPOTENCY_KEY_HEADER),
		...arrivalOf(context),
		movedFrom: context.get("movedFrom") ?? null,
	});
	context.set("idempotencyKey", request.idempotencyKey);
	const processor = context
		.get("slots")
		.processorFor({ customerId: request.params.customer_id });
	// Already the response's JSON, wherever the owner thread built it; the verdict is for the request line.
	const { json, allowed, denial } = await processor.check({ request });
	context.set("allowed", allowed);
	return context.body(json, 200, {
		"content-type": "application/json",
		...(denial?.limitType && { [LIMIT_TYPE_HEADER]: denial.limitType }),
		...(denial?.reason && { [DENY_REASON_HEADER]: denial.reason }),
	});
}
