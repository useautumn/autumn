import type { Context, MiddlewareHandler, Next } from "hono";
import { isServing } from "../../init/atomHealth.js";
import { CannotAnswerError } from "../../lib/forward/cannotAnswerError.js";
import {
	type Hop,
	hopToPeer,
	PeerTimeout,
	peerTimeoutReply,
} from "../forward/hopToPeer.js";
import { timeStage } from "../../threads/stats/stageClock.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

const customerIdOf = (body: unknown): string | null => {
	const customerId = (body as { customer_id?: unknown } | undefined)
		?.customer_id;
	return typeof customerId === "string" && customerId !== ""
		? customerId
		: null;
};

/**
 * One replica deducts for a customer at a time: a non-owner hands the request to the owner, one not ready or not yet
 * granted hands even its own customers' to a peer. Either way it crosses once, to the peer's signed route.
 */
export function checkHopMiddleware({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health" | "replication" | "peer" | "counters">;
}): MiddlewareHandler<AtomHttpEnv> {
	const { peer, counters } = ctx;
	const { ring, membership } = peer;

	/** The peer the customer came from: this replica when it is leaving, else who would own it without its owner. */
	const previousOwnerOf = async ({
		customerId,
		owner,
	}: {
		customerId: string;
		owner: string;
	}): Promise<string | null> =>
		membership?.isSelfLeaving()
			? ring.self
			: ring.ownerWithout({ customerId, member: owner });

	async function hopOf(context: Context<AtomHttpEnv>): Promise<Hop | null> {
		const customerId = customerIdOf(context.get("body"));
		const owner = customerId ? await ring.ownerOf({ customerId }) : ring.self;
		if (owner !== ring.self)
			return {
				to: owner,
				answeredBy: "owner",
				movedFrom: customerId && (await previousOwnerOf({ customerId, owner })),
			};
		// Leaving with nobody left to own the customer: the API answers, as it did a stopping replica's 503.
		if (membership?.isSelfLeaving())
			throw new CannotAnswerError({ reason: "owner_unavailable" });
		if (customerId && membership) {
			const previous = await ring.ownerWithout({
				customerId,
				member: ring.self,
			});
			// Owned here by this replica's own count only: the peer it came from answers until it has said otherwise.
			if (previous !== null && !membership.isGrantedBy(previous))
				return { to: previous, answeredBy: "owner" };
			// Just moved here: the previous owner's entries for it are on their way, and its answer waits for them.
			const from = await ring.movedFrom({ customerId });
			if (from !== null) context.set("movedFrom", from);
		}
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
		membership?.markLeaving(left.to);
		const hop = await hopOf(context);
		if (!hop) return next();
		const reply = await hopToPeer({ ctx, context, hop });
		if (!reply || reply.status === 503) return unavailable(hop, next);
		counters.add("checksProxied");
		return reply;
	}

	/** A peer that never got the request, or shed it: a starting replica answers itself, a non-owner leaves it to the API. */
	function unavailable(hop: Hop, next: Next) {
		if (hop.answeredBy === "starting") return next();
		counters.add("ownerUnavailable");
		throw new CannotAnswerError({ reason: "owner_unavailable" });
	}

	async function hopCheck(context: Context<AtomHttpEnv>, next: Next) {
		const hop = await hopOf(context);
		if (!hop) return next();
		let reply: Response | null;
		try {
			reply = await timeStage("hopForward", () =>
				hopToPeer({ ctx, context, hop }),
			);
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
			if (error instanceof PeerTimeout) return peerTimeoutReply(context);
			throw error;
		}
	}
	return hopCheck;
}

/** What a leaving replica's peer port answers a hop with (peerReadyMiddleware). */
const LEAVING_CODE = "atom_leaving";
