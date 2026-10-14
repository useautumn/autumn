import type { Context } from "hono";
import { finalizeCallToRequest } from "../../lib/contracts/finalizeContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";
import { API_VERSION_HEADER, arrivalOf } from "./receiveCheck.js";

/** A finalize of a lock this Atom took is settled and journaled here; any other is left to the API. */
export async function receiveFinalize(context: Context<AtomHttpEnv>) {
	const request = finalizeCallToRequest({
		body: context.get("body"),
		apiVersionHeader: context.req.header(API_VERSION_HEADER),
		...arrivalOf(context),
	});
	const answer = await context
		.get("slots")
		.processorFor({ customerId: request.params.customer_id })
		.finalize({ request });
	return context.json(answer, 200);
}
