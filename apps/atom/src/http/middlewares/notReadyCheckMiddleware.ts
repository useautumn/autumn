import type { Context, MiddlewareHandler, Next } from "hono";
import { isAtomReady } from "../../init/atomHealth.js";
import { forwardRequest } from "../forward/forwardRequest.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A check that already crossed from a starting replica is answered where it lands: one hop, never a loop. */
const PROXIED_HEADER = "x-atom-proxied";
/** A ready peer answers in a few ms; past this the check is answered here from what is held. */
const PROXY_TIMEOUT_MS = 2_000;

/**
 * The load balancer sends checks to a replica as soon as it listens, before /health says ready. Until then this
 * replica may not hold every push yet, so it hands each check to another replica and only answers itself when none can.
 */
export function notReadyCheckMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health" | "replication" | "peer">;
}): MiddlewareHandler<AtomHttpEnv> {
	const { replication, peer } = ctx;
	async function proxyWhileStarting(context: Context<AtomHttpEnv>, next: Next) {
		if (
			!replication ||
			!peer ||
			isAtomReady(ctx.health) ||
			context.req.header(PROXIED_HEADER)
		)
			return next();
		const [address] = await replication.peers();
		if (!address) return next();
		const { pathname, search } = new URL(context.req.url);
		try {
			return await forwardRequest({
				context,
				target: `http://${address}:${peer.port}${pathname}${search}`,
				headers: { [PROXIED_HEADER]: "1" },
				replyHeaders: { [PROXIED_HEADER]: "starting" },
				timeoutMs: PROXY_TIMEOUT_MS,
			});
		} catch {
			return next();
		}
	}
	return proxyWhileStarting;
}
