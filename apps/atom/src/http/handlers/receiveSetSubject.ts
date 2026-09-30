import type { Context } from "hono";
import { subjectBodyToStoredSubject } from "../../lib/contracts/subjectContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export async function receiveSetSubject(context: Context<AtomHttpEnv>) {
	const subject = subjectBodyToStoredSubject({
		body: await context.req.json(),
	});
	const { customerId } = subject.state.identity;
	const stored = context
		.get("slots")
		.processorFor({ customerId })
		.setSubject({ subject });
	return context.json({ stored });
}
