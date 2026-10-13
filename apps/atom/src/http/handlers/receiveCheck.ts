import type { Context } from "hono";
import { checkCallToRequest } from "../../lib/contracts/checkContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const API_VERSION_HEADER = "x-api-version";
/** Set by the replica a check arrived at, read only on one handed on by a peer: its deduction keeps one idempotency key. */
export const REQUEST_ID_HEADER = "x-atom-request-id";
export const OCCURRED_AT_HEADER = "x-atom-occurred-at";

export const newRequestId = () => `atom_req_${crypto.randomUUID()}`;

const arrivalOf = (context: Context<AtomHttpEnv>) => {
	const requestId = context.get("relayed")
		? context.req.header(REQUEST_ID_HEADER)
		: undefined;
	if (!requestId) return { requestId: newRequestId(), occurredAt: Date.now() };
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
		...arrivalOf(context),
	});
	const processor = context
		.get("slots")
		.processorFor({ customerId: request.params.customer_id });
	// Already the response's JSON, wherever the owner thread built it; the verdict is for the request line.
	const { json, allowed } = await processor.check({ request });
	context.set("allowed", allowed);
	return context.body(json, 200, { "content-type": "application/json" });
}
