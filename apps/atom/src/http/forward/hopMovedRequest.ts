import type { Context } from "hono";
import { CannotAnswerError } from "../../lib/forward/cannotAnswerError.js";
import { MOVED_FROM_HEADER } from "../../replicas/handover/handoffContract.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";
import { hopToPeer, PeerTimeout, peerTimeoutReply } from "./hopToPeer.js";

/**
 * A straggler whose customer moved on is hopped once more, to the owner the processor named, marked as from here so the
 * owner waits for this replica's handoff; one that arrived that way already goes to the API: the replicas disagree.
 */
export const hopMovedRequest = async ({
	ctx,
	context,
	owner,
}: {
	ctx: Pick<AtomHttpContext, "peer" | "counters">;
	context: Context<AtomHttpEnv>;
	owner: string;
}): Promise<Response> => {
	const unavailable = () => {
		ctx.counters.add("ownerUnavailable");
		throw new CannotAnswerError({ reason: "owner_unavailable" });
	};
	if (context.req.header(MOVED_FROM_HEADER)) return unavailable();
	let reply: Response | null;
	try {
		reply = await hopToPeer({
			ctx,
			context,
			hop: { to: owner, answeredBy: "owner", movedFrom: ctx.peer.ring.self },
		});
	} catch (error) {
		if (error instanceof PeerTimeout) return peerTimeoutReply(context);
		throw error;
	}
	if (!reply || reply.status === 503) return unavailable();
	ctx.counters.add("checksProxied");
	return reply;
};
