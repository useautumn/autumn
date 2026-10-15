import { ATOM_FORWARDED_REQUEST_HEADER } from "@autumn/byoc";
import type { Context } from "hono";
import type { ForwardReason } from "../../lib/forward/cannotAnswerError.js";
import { ATOM_TOKEN_HEADER } from "../middlewares/atomTokenMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";
import { FORWARDED_HEADER, forwardRequest } from "./forwardRequest.js";

/** Long enough for the API's own slowest check; past it the caller gets an error, not a hung request. */
const FORWARD_TIMEOUT_MS = 30_000;

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
	// The API can only refuse a keyless request: the server's shadow checks send none, by design.
	if (!context.req.header("authorization"))
		return context.json(
			{
				message: "Atom forwards nothing without a secret key",
				code: "atom_not_forwarded",
			},
			401,
			{ [FORWARDED_HEADER]: reason },
		);
	try {
		return await forwardRequest({
			context,
			target,
			// Named to the API, which then holds the caller's key for the Atom's TTL rather than the org's.
			headers: { [ATOM_FORWARDED_REQUEST_HEADER]: reason },
			// The Atom token is Atom's alone and never travels on.
			heldBack: [ATOM_TOKEN_HEADER],
			replyHeaders: { [FORWARDED_HEADER]: reason },
			timeoutMs: FORWARD_TIMEOUT_MS,
		});
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
