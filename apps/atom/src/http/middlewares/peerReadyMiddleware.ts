import type { Context, MiddlewareHandler, Next } from "hono";
import { isServing } from "../../init/atomHealth.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** On the peer port's handed-on routes: a thread still catching up holds files behind its peers', and a leaving replica
 * owns nothing any more, so a request handed to either is refused with a 503 the sender acts on, never answered stale. */
export function peerReadyMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health" | "peer">;
}): MiddlewareHandler<AtomHttpEnv> {
	async function refuseUnlessOwning(context: Context<AtomHttpEnv>, next: Next) {
		if (ctx.peer.membership?.isSelfLeaving())
			return context.json(
				{
					message:
						"This replica is leaving the ring; its customers have a new owner",
					code: "atom_leaving",
				},
				503,
			);
		if (isServing(ctx.health)) return next();
		return context.json(
			{
				message: "This replica is still catching up; ask its owner again",
				code: "atom_not_ready",
			},
			503,
		);
	}
	return refuseUnlessOwning;
}
