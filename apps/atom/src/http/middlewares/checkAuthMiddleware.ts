import type { Context, MiddlewareHandler, Next } from "hono";
import { hashToken } from "../../auth/hashToken.js";
import { forwardToAutumn } from "../forward/forwardToAutumn.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";
import {
	ATOM_TOKEN_HEADER,
	atomTokenMiddleware,
} from "./atomTokenMiddleware.js";

const BEARER = /^Bearer (.+)$/;

/** An org's own Atom opens a check to the org's secret key; a multi-tenant one, or a call sending the Atom token, goes by the token. */
export function checkAuthMiddleware({
	ctx,
}: {
	ctx: AtomHttpContext;
}): MiddlewareHandler<AtomHttpEnv> {
	const byAtomToken = atomTokenMiddleware({ ctx });
	const { secretKeys } = ctx;
	const slots = ctx.auth.slotsFor({ atomId: null });
	if (!secretKeys || !slots) return byAtomToken;

	/** A key not held yet is the API's to answer; one the API did not refuse is held until Autumn rules on it. */
	return async function authorizeSecretKey(
		context: Context<AtomHttpEnv>,
		next: Next,
	) {
		const secretKey = context.req.header("authorization")?.match(BEARER)?.[1];
		if (!secretKey || context.req.header(ATOM_TOKEN_HEADER))
			return byAtomToken(context, next);
		const keyHash = hashToken({ token: secretKey });
		if (secretKeys.isKnown({ keyHash })) {
			context.set("slots", slots);
			return next();
		}
		const reply = await forwardToAutumn({
			ctx,
			context,
			reason: "secret_key_not_known",
		});
		if (reply.status !== 401 && reply.status !== 403)
			secretKeys.learn({ keyHash });
		return reply;
	};
}
