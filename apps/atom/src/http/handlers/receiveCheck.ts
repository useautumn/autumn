import type { Context } from "hono";
import {
	checkBodyToRequest,
	checkReplyToBody,
} from "../../lib/contracts/checkContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export async function receiveCheck(context: Context<AtomHttpEnv>) {
	const request = checkBodyToRequest({
		body: await context.req.json(),
		requestId: `atom_req_${crypto.randomUUID()}`,
		occurredAt: Date.now(),
	});
	const processor = context
		.get("slots")
		.processorFor({ customerId: request.customerId });
	const reply = processor.check({ request });
	return context.json(checkReplyToBody({ reply }));
}
