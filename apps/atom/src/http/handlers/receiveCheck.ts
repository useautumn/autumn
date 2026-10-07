import type { Context } from "hono";
import { checkCallToRequest } from "../../lib/contracts/checkContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const API_VERSION_HEADER = "x-api-version";

export async function receiveCheck(context: Context<AtomHttpEnv>) {
	const request = checkCallToRequest({
		body: context.get("body"),
		query: context.req.query(),
		apiVersionHeader: context.req.header(API_VERSION_HEADER),
		requestId: `atom_req_${crypto.randomUUID()}`,
		occurredAt: Date.now(),
	});
	const processor = context
		.get("slots")
		.processorFor({ customerId: request.params.customer_id });
	// Already the response's JSON, wherever the owner thread built it; the verdict is for the request line and counts.
	const { json, ...verdict } = await processor.check({ request });
	context.set("verdict", verdict);
	return context.body(json, 200, { "content-type": "application/json" });
}
