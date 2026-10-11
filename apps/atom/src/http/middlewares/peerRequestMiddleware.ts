import type { Context, MiddlewareHandler, Next } from "hono";
import {
	PEER_RELAYED_HEADER,
	PEER_SIGNATURE_HEADER,
	peerSignatureMatches,
} from "../../replication/transport/peerSignature.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/**
 * A request another replica signed with the token hash every replica holds opens the one data folder without the
 * token itself. It is marked relayed, so what it carries is applied here and passed no further. Anything else goes to `orElse`.
 */
export function peerRequestMiddleware({
	ctx,
	tokenHash,
	orElse,
}: {
	ctx: AtomHttpContext;
	tokenHash: string;
	orElse: MiddlewareHandler<AtomHttpEnv>;
}): MiddlewareHandler<AtomHttpEnv> {
	async function authorizePeer(context: Context<AtomHttpEnv>, next: Next) {
		const signature = context.req.header(PEER_SIGNATURE_HEADER);
		if (!signature || context.req.header(PEER_RELAYED_HEADER) !== "1")
			return orElse(context, next);
		const slots = ctx.auth.slotsFor({ atomId: null });
		const body = await context.req.text();
		if (!slots || !peerSignatureMatches({ tokenHash, body, signature }))
			return context.json(
				{ message: "Peer signature rejected", code: "atom_peer_rejected" },
				401,
			);
		context.set("slots", slots);
		context.set("relayed", true);
		await next();
	}
	return authorizePeer;
}
