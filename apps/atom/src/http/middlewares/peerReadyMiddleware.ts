import type { Context, MiddlewareHandler, Next } from "hono";
import { isServing } from "../../init/atomHealth.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/**
 * On the peer port's check, track and finalize routes: a thread still catching up holds files behind its peers', so a check handed
 * to it is refused with a 503 the sender takes as unanswerable (and leaves to the API), never answered stale.
 */
export function peerReadyMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health">;
}): MiddlewareHandler<AtomHttpEnv> {
	async function refuseUntilServing(context: Context<AtomHttpEnv>, next: Next) {
		if (isServing(ctx.health)) return next();
		return context.json(
			{
				message: "This replica is still catching up; ask its owner again",
				code: "atom_not_ready",
			},
			503,
		);
	}
	return refuseUntilServing;
}
