import type { Context, Next } from "hono";
import { PEER_KEY_HANDOFF_PATH } from "../../replicas/handover/handoffContract.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** A subject push is passed on as text, to be parsed on its customer's owner thread. */
const SUBJECT_PUSH_PATH = "/v1/subjects.set";

/** Reads the body once for every layer after it. Text, not JSON: the raw text stays cached for a forward. */
export async function requestBodyMiddleware(
	context: Context<AtomHttpEnv>,
	next: Next,
): Promise<void> {
	// Binary: read as bytes by the peer signature and its route, never decoded as text.
	if (context.req.path === PEER_KEY_HANDOFF_PATH) return next();
	const text = await context.req.text();
	if (context.req.path === SUBJECT_PUSH_PATH) return next();
	context.set("body", parseJson(text));
	await next();
}

/** A body that is not JSON is read as none; whichever route it came to decides what that means. */
const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};
