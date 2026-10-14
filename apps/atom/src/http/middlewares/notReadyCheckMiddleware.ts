import type { Context, MiddlewareHandler, Next } from "hono";
import { isServing } from "../../init/atomHealth.js";
import { forwardRequest } from "../forward/forwardRequest.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

const PROXIED_HEADER = "x-atom-proxied";
const PROXY_TIMEOUT_MS = 2_000;

const NEVER_REACHED_PEER = new Set([
	"ECONNREFUSED",
	"ConnectionRefused",
	"ENOTFOUND",
	"DNSNotFound",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"FailedToOpenSocket",
]);

const neverReachedPeer = (error: unknown): boolean =>
	NEVER_REACHED_PEER.has(String((error as { code?: unknown })?.code));

export function notReadyCheckMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health" | "replication" | "peer">;
}): MiddlewareHandler<AtomHttpEnv> {
	const { replication, peer } = ctx;
	async function proxyWhileStarting(context: Context<AtomHttpEnv>, next: Next) {
		if (isServing(ctx.health) || context.req.header(PROXIED_HEADER))
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
			if (neverReachedPeer(error)) return next();
			context.set("failure", {
				code: "atom_peer_timeout",
				error: error as Error,
				target: address,
			});
			return context.json(
				{
					message: "The replica answering for this one did not answer",
					code: "atom_peer_timeout",
				},
				504,
			);
		}
	}
	return proxyWhileStarting;
}
