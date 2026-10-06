import type { Context, MiddlewareHandler, Next } from "hono";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** About one response in this many closes its connection once answered. */
const CLOSE_ONE_IN = 256;

/**
 * Processes share the port and the kernel picks one per connection, so a long-lived connection stays on
 * its process: a few busy callers can pin one process to its limit while the rest idle. Closing a
 * connection now and then makes the caller reconnect, and the kernel picks again.
 */
export function rebalanceConnectionsMiddleware({
	random = Math.random,
}: {
	random?: () => number;
} = {}): MiddlewareHandler<AtomHttpEnv> {
	async function rebalance(context: Context<AtomHttpEnv>, next: Next) {
		await next();
		if (random() * CLOSE_ONE_IN < 1) context.header("connection", "close");
	}
	return rebalance;
}
