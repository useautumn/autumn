import type { Context } from "hono";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** Tells a caller, and a test, that the API answered and why. */
export const FORWARDED_HEADER = "x-atom-forwarded";
/** What a reply keeps through a relay: the SDK reads whether the API answered to decide whether to ask it itself. */
const RELAYED_REPLY_HEADERS = ["content-type", FORWARDED_HEADER];

/** Headers that belong to this hop and never travel on. */
const HOP_HEADERS = ["host", "connection", "content-length"];

/**
 * Sends the caller's request on as it arrived, with `headers` over its own, and hands back the reply unchanged apart
 * from `replyHeaders`: status, body and errors alike. Throws only when the target could not be reached.
 */
export const forwardRequest = async ({
	context,
	target,
	headers = {},
	heldBack = [],
	replyHeaders,
	timeoutMs,
	send = fetch,
}: {
	context: Context<AtomHttpEnv>;
	target: string;
	headers?: Record<string, string>;
	heldBack?: string[];
	replyHeaders: Record<string, string>;
	timeoutMs: number;
	send?: typeof fetch;
}): Promise<Response> => {
	const sent = new Headers(context.req.raw.headers);
	for (const name of [...HOP_HEADERS, ...heldBack]) sent.delete(name);
	for (const [name, value] of Object.entries(headers)) sent.set(name, value);
	// The route already read the body; the request keeps it, so it is sent as it arrived.
	const reply = await send(target, {
		method: context.req.method,
		headers: sent,
		body: await context.req.text(),
		// A caller that gave up (the SDK's edge waits 1 s) has gone to the API itself: its forward ends with it.
		signal: AbortSignal.any([
			context.req.raw.signal,
			AbortSignal.timeout(timeoutMs),
		]),
	});
	const replied = new Headers(replyHeaders);
	for (const name of RELAYED_REPLY_HEADERS) {
		const value = reply.headers.get(name);
		if (value) replied.set(name, value);
	}
	return new Response(reply.body, { status: reply.status, headers: replied });
};
