import type { Context } from "hono";
import type { ForwardReason } from "../../lib/forward/cannotAnswerError.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** Long enough for the API's own slowest check; past it the caller gets an error, not a hung request. */
const FORWARD_TIMEOUT_MS = 30_000;

/** Tells a caller, and a test, that the API answered and why. */
const FORWARDED_HEADER = "x-atom-forwarded";

/** Headers that belong to this hop, or to Atom alone, and never travel on. */
const HELD_BACK_HEADERS = [
	"host",
	"connection",
	"content-length",
	"x-atom-token",
];

const headersToForward = ({
	context,
}: {
	context: Context<AtomHttpEnv>;
}): Headers => {
	const headers = new Headers(context.req.raw.headers);
	for (const name of HELD_BACK_HEADERS) headers.delete(name);
	return headers;
};

/**
 * Sends the caller's request to the Autumn API as it arrived and hands back the API's reply unchanged:
 * status, body and errors alike. Only an API that cannot be reached is answered by Atom.
 */
export const forwardToAutumn = async ({
	ctx,
	context,
	reason,
}: {
	ctx: AtomHttpContext;
	context: Context<AtomHttpEnv>;
	reason: ForwardReason;
}): Promise<Response> => {
	const { pathname, search } = new URL(context.req.url);
	const target = `${ctx.autumnApiUrl}${pathname}${search}`;
	try {
		// The route already read the body; the request keeps it, so it is sent as it arrived.
		const body = await context.req.text();
		const reply = await fetch(target, {
			method: context.req.method,
			headers: headersToForward({ context }),
			body,
			signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
		});
		const headers = new Headers({ [FORWARDED_HEADER]: reason });
		const contentType = reply.headers.get("content-type");
		if (contentType) headers.set("content-type", contentType);
		return new Response(reply.body, { status: reply.status, headers });
	} catch (cause) {
		const error = cause instanceof Error ? cause : new Error(String(cause));
		const code = "atom_upstream_unreachable";
		context.set("failure", { code, error, target });
		return context.json(
			{ message: "Atom could not reach the Autumn API", code },
			502,
			{ [FORWARDED_HEADER]: reason },
		);
	}
};
