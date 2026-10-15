import { readyBootOf } from "../membership/readyBootOf.js";
import { announceTo } from "./announceTo.js";
import { handOverOnce } from "./handOverOnce.js";
import type { HandoverContext } from "./types/handoverContext.js";

/**
 * The first step of a planned stop: this replica owns nothing from now on, every ready listed peer is told and handed
 * what this thread owes its customers. A peer the announcement misses learns from DNS, as today.
 */
export const leaveRing = async ({
	ctx,
}: {
	ctx: HandoverContext;
}): Promise<void> => {
	ctx.membership.leaveSelf();
	// A ready peer this replica never got to count takes its customers too, so the leave never depends on the prober.
	for (const peer of await ctx.replication.peers().catch(() => [])) {
		if (peer === ctx.ring.self || ctx.membership.isMember(peer)) continue;
		const boot = await readyBootOf({ ctx, peer });
		if (boot !== null) ctx.membership.markJoined({ address: peer, boot });
	}
	const peers = await ctx.ring.members();
	const told = await Promise.all(
		peers.map((peer) =>
			announceTo({
				ctx,
				peer,
				announcement: { kind: "leaving", address: ctx.ring.self },
			}),
		),
	);
	const reached = peers.filter((_, index) => told[index]);
	if (reached.length < peers.length)
		ctx.logger.warn(
			{
				type: "atom_leave_unannounced",
				data: { peers: peers.filter((_, index) => !told[index]) },
			},
			"Some peers did not take this replica's leaving; they learn it from the service name",
		);
	const { handed, kept } = await handOverOnce({ ctx, peers: reached });
	ctx.logger.info(
		{
			type: "atom_leaving",
			data: { announced: reached.length, handed, kept },
		},
		"This replica left the ring: its customers are owned by its peers",
	);
};
