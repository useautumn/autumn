import type { Context } from "hono";
import type { ForwardReason } from "../../lib/forward/cannotAnswerError.js";
import { ATOM_TOKEN_HEADER } from "../middlewares/atomTokenMiddleware.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";
import { forwardRequest } from "./forwardRequest.js";

const FORWARD_TIMEOUT_MS = 30_000;

const FORWARDED_HEADER = "x-atom-forwarded";

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
