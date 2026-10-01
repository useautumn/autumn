import { stripInternalFields } from "@autumn/shared";
import type { Context } from "hono";
import { checkCallToRequest } from "../../lib/contracts/checkContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const API_VERSION_HEADER = "x-api-version";

export function receiveCheck(context: Context<AtomHttpEnv>) {
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
	const response = processor.check({ request });
	// The API drops fields it keeps for itself before a response leaves; so does Atom, by the same list.
	return context.json(stripInternalFields({ data: response }));
}
