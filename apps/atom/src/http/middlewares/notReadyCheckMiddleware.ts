import type { Context, MiddlewareHandler, Next } from "hono";
import { isAtomReady } from "../../init/atomHealth.js";
import { forwardRequest } from "../forward/forwardRequest.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A check that already crossed from a starting replica is answered where it lands: one hop, never a loop. */
const PROXIED_HEADER = "x-atom-proxied";
/** A ready peer answers in a few ms; one that takes longer may still be acting on the check, so it is not run again here. */
const PROXY_TIMEOUT_MS = 2_000;

const isTimeout = (error: unknown): boolean =>
	error instanceof Error && error.name === "TimeoutError";

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
				send: peer.fetch,
			});
		} catch (error) {
			// Nothing reached the peer: this replica answers from what it holds. Past the timeout the peer may have
			// answered Autumn already, and a check that sends an event must never run twice.
			if (!isTimeout(error)) return next();
			context.set("failure", {
				code: "atom_peer_timeout",
				error: error as Error,
				target: address,
			});
			return context.json(
				{
					message: "The replica answering for this one timed out",
					code: "atom_peer_timeout",
				},
				504,
			);
		}
	}
	return proxyWhileStarting;
}
