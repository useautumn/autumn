import type { Context } from "hono";
import { trackCallToRequest } from "../../lib/contracts/trackContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";
import { API_VERSION_HEADER, arrivalOf } from "./receiveCheck.js";

/** A track the balance covers is deducted and journaled here; one it does not cover is left to the API. */
export async function receiveTrack(context: Context<AtomHttpEnv>) {
	const request = trackCallToRequest({
		body: context.get("body"),
		apiVersionHeader: context.req.header(API_VERSION_HEADER),
		...arrivalOf(context),
		movedFrom: context.get("movedFrom") ?? null,
	});
	context.set("idempotencyKey", request.idempotencyKey);
	const answer = await context
		.get("slots")
		.processorFor({ customerId: request.params.customer_id })
		.track({ request });
	return context.json(answer, 202);
}
