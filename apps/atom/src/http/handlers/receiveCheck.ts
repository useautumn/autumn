import { stripInternalFields } from "@autumn/shared";
import type { Context } from "hono";
import { checkCallToRequest } from "../../lib/contracts/checkContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const API_VERSION_HEADER = "x-api-version";

/** A body that is not JSON is read as none, so the API is the one to refuse it. */
const parseJson = ({ text }: { text: string }): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};

export async function receiveCheck(context: Context<AtomHttpEnv>) {
	const request = checkCallToRequest({
		body: parseJson({ text: await context.req.text() }),
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
