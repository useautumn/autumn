import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context } from "hono";
import { applySubjectPush } from "../../pushes/applyPushes.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** The body is handed on as the text it arrived as: the customer's owner thread parses it, once. */
export async function receiveSetSubject(context: Context<AtomHttpEnv>) {
	const stored = await applySubjectPush({
		slots: context.get("slots"),
		customerId: context.req.header(ATOM_CUSTOMER_ID_HEADER) ?? null,
		body: await context.req.text(),
	});
	return context.json({ stored });
}
