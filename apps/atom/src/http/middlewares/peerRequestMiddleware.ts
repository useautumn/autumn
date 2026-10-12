import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context, MiddlewareHandler, Next } from "hono";
import {
	PEER_SIGNATURE_HEADER,
	peerSignatureMatches,
} from "../../replication/transport/peerSignature.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/**
 * Every request on the peer port is from another replica, signed with the deployment's own secret over its method,
 * path, routed customer and body. It opens the one data folder and is marked relayed, so what it carries is applied
 * here and passed no further.
 */
export function peerRequestMiddleware({
	ctx,
	secret,
}: {
	ctx: Pick<AtomHttpContext, "auth">;
	secret: string;
}): MiddlewareHandler<AtomHttpEnv> {
	async function authorizePeer(context: Context<AtomHttpEnv>, next: Next) {
		const signature = context.req.header(PEER_SIGNATURE_HEADER) ?? "";
		const slots = ctx.auth.slotsFor({ atomId: null });
		const verified =
			slots !== null &&
			peerSignatureMatches({
				secret,
				signature,
				method: context.req.method,
				path: context.req.path,
				customerId: context.req.header(ATOM_CUSTOMER_ID_HEADER),
				body: await context.req.text(),
			});
		if (!verified)
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
