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
		// Leaving with nobody left to own the customer: the API answers, as it did a stopping replica's 503.
		if (peer.membership?.isSelfLeaving())
			throw new CannotAnswerError({ reason: "owner_unavailable" });
		if (isServing(ctx.health)) return null;
		const [ready] = await ctx.replication.peers();
		return ready ? { to: ready, answeredBy: "starting" } : null;
	}

	/** The owner said it is leaving: this replica may own the customer now, or another peer does; one more hop at most. */
	async function afterLeaving(
		context: Context<AtomHttpEnv>,
		left: Hop,
		next: Next,
	) {
		peer.membership?.markLeaving(left.to);
		const hop = await hopOf(context);
		if (!hop) return next();
		const reply = await forwardHop(context, hop);
		if (!reply || reply.status === 503) return unavailable(hop, next);
		counters.add("checksProxied");
		return reply;
	}

	/** A peer that never got the check, or shed it: a starting replica answers itself, a non-owner leaves it to the API. */
	function unavailable(hop: Hop, next: Next) {
		if (hop.answeredBy === "starting") return next();
		counters.add("ownerUnavailable");
		throw new CannotAnswerError({ reason: "owner_unavailable" });
	}

	/** The peer's reply, or null when it was never reached; throws the 504 for a peer that may have acted on the check. */
	async function forwardHop(
		context: Context<AtomHttpEnv>,
		hop: Hop,
	): Promise<Response | null> {
		const { pathname, search } = new URL(context.req.url);
		const body = await context.req.text();
		try {
			return await forwardRequest({
				context,
				target: `http://${hop.to}:${peer.port}${pathname}${search}`,
				// Only a replica names a routed customer or folder; a client's would break the signature.
				heldBack: [ATOM_CUSTOMER_ID_HEADER, PEER_FOLDER_HEADER],
				headers: peerRequestHeaders({
					secret: peer.secret,
					method: context.req.method,
					path: pathname,
					body,
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
			if (neverReachedPeer(error)) return null;
			// The peer may have answered Autumn already, so the check is not run again here or by the API.
			context.set("failure", {
				code: "atom_peer_timeout",
				error: error as Error,
				target: hop.to,
			});
			throw new PeerTimeout();
		}
	}

	const peerTimeout = (context: Context<AtomHttpEnv>) =>
		context.json(
			{
				message: "The replica answering for this one did not answer",
				code: "atom_peer_timeout",
			},
			504,
		);

	async function hopCheck(context: Context<AtomHttpEnv>, next: Next) {
		const hop = await hopOf(context);
		if (!hop) return next();
		let reply: Response | null;
		try {
			reply = await forwardHop(context, hop);
			if (!reply) return unavailable(hop, next);
			if (reply.status !== 503) {
				counters.add("checksProxied");
				return reply;
			}
			// A 503 sends the SDK to the API; from a peer it means the same, unless the peer is leaving the ring.
			const refusal = (await reply.json().catch(() => null)) as {
				code?: string;
			} | null;
			if (refusal?.code !== LEAVING_CODE) return unavailable(hop, next);
			return afterLeaving(context, hop, next);
		} catch (error) {
			if (error instanceof PeerTimeout) return peerTimeout(context);
			throw error;
		}
	}
	return hopCheck;
}

/** What a leaving replica's peer port answers a hop with (peerReadyMiddleware). */
const LEAVING_CODE = "atom_leaving";

class PeerTimeout extends Error {}
