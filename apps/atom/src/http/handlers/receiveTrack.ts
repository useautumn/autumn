import type { TrackResponseV3 } from "@autumn/shared";
import type { Context } from "hono";
import { trackCallToRequest } from "../../lib/contracts/trackContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";
import { API_VERSION_HEADER, arrivalOf } from "./receiveCheck.js";

/** A track the balance covers is deducted and journaled here, and answered as the API answers a queued track. */
export async function receiveTrack(context: Context<AtomHttpEnv>) {
	const request = trackCallToRequest({
		body: context.get("body"),
		query: context.req.query(),
		apiVersionHeader: context.req.header(API_VERSION_HEADER),
		...arrivalOf(context),
	});
	context.set("idempotencyKey", request.idempotencyKey);
	// A track the balance does not cover rejects here, and is left to the API.
	await context
		.get("slots")
		.processorFor({ customerId: request.params.customer_id })
		.check({ request });
	const response: TrackResponseV3 = {
		customer_id: request.params.customer_id,
		value: request.params.required_balance ?? 1,
		balance: null,
	};
	return context.json(response, 202);
}
