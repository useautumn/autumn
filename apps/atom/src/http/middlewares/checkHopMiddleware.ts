import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context, MiddlewareHandler, Next } from "hono";
import { isServing } from "../../init/atomHealth.js";
import { CannotAnswerError } from "../../lib/forward/cannotAnswerError.js";
import {
	PEER_FOLDER_HEADER,
	peerRequestHeaders,
} from "../../replication/transport/peerSignature.js";
import { forwardRequest } from "../forward/forwardRequest.js";
import {
	newRequestId,
	OCCURRED_AT_HEADER,
	REQUEST_ID_HEADER,
} from "../handlers/receiveCheck.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** Tells a caller, and a test, whose view answered: the customer's owner, or a ready peer while this replica starts. */
const PROXIED_HEADER = "x-atom-proxied";
/** A ready peer answers in a few ms, or forwards to the API itself; past this it may still be acting on the check, so it is not run again here. */
const PROXY_TIMEOUT_MS = 2_000;

/** Failures that prove the peer never got the request; any other may have, and a check that sends an event must never run twice. */
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

type Hop = { to: string; answeredBy: "owner" | "starting" };

const customerIdOf = (body: unknown): string | null => {
	const customerId = (body as { customer_id?: unknown } | undefined)
		?.customer_id;
	return typeof customerId === "string" && customerId !== ""
		? customerId
		: null;
};

/**
 * A check is answered by the replica that owns its customer, so one replica deducts for it at a time; one not ready
 * yet hands even its own customers' checks to a ready peer. Either way it crosses once, to the peer's signed check route.
 */
export function checkHopMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health" | "replication" | "peer" | "counters">;
}): MiddlewareHandler<AtomHttpEnv> {
	const { peer, counters } = ctx;

	async function hopOf(context: Context<AtomHttpEnv>): Promise<Hop | null> {
		const customerId = customerIdOf(context.get("body"));
		const owner = customerId
			? await peer.ring.ownerOf({ customerId })
			: peer.ring.self;
		if (owner !== peer.ring.self) return { to: owner, answeredBy: "owner" };
		if (isServing(ctx.health)) return null;
		const [ready] = await ctx.replication.peers();
		return ready ? { to: ready, answeredBy: "starting" } : null;
	}

	/** A peer that never got the check, or shed it: a starting replica answers itself, a non-owner leaves it to the API. */
	function unavailable(hop: Hop, next: Next) {
		if (hop.answeredBy === "starting") return next();
		counters.add("ownerUnavailable");
		throw new CannotAnswerError({ reason: "owner_unavailable" });
	}

	async function hopCheck(context: Context<AtomHttpEnv>, next: Next) {
		const hop = await hopOf(context);
		if (!hop) return next();
		const { pathname, search } = new URL(context.req.url);
		let reply: Response;
		try {
			reply = await forwardRequest({
				context,
				target: `http://${hop.to}:${peer.port}${pathname}${search}`,
				// Only a replica names a routed customer or folder; a client's would break the signature.
				heldBack: [ATOM_CUSTOMER_ID_HEADER, PEER_FOLDER_HEADER],
				headers: peerRequestHeaders({
					secret: peer.secret,
					method: context.req.method,
					path: pathname,
					body: await context.req.text(),
					headers: {
						[REQUEST_ID_HEADER]: newRequestId(),
						[OCCURRED_AT_HEADER]: String(Date.now()),
					},
				}),
				replyHeaders: { [PROXIED_HEADER]: hop.answeredBy },
				timeoutMs: PROXY_TIMEOUT_MS,
				send: peer.fetch,
			});
		} catch (error) {
			if (neverReachedPeer(error)) return unavailable(hop, next);
			// The peer may have answered Autumn already, so the check is not run again here or by the API.
			context.set("failure", {
				code: "atom_peer_timeout",
				error: error as Error,
				target: hop.to,
			});
			return context.json(
				{
					message: "The replica answering for this one did not answer",
					code: "atom_peer_timeout",
				},
				504,
			);
		}
		// A 503 sends the SDK to the API; it means the same from a peer.
		if (reply.status === 503) {
			await reply.body?.cancel();
			return unavailable(hop, next);
		}
		counters.add("checksProxied");
		return reply;
	}
	return hopCheck;
}
