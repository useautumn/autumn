import type { AutumnLogger } from "@autumn/logging";
import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type { Membership } from "../membership/types/membership.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import {
	type LeavingAnnouncement,
	PEER_LEAVING_PATH,
} from "./leavingContract.js";

/** A peer that has not taken the announcement by then is treated as unreachable: DNS tells it later, as today. */
const ANNOUNCE_TIMEOUT_MS = 1_000;

export type LeaveRingContext = {
	ring: ReplicaRing;
	membership: Membership;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
};

const announceTo = async ({
	ctx,
	peer,
}: {
	ctx: LeaveRingContext;
	peer: string;
}): Promise<boolean> => {
	const body = JSON.stringify({
		address: ctx.ring.self,
	} satisfies LeavingAnnouncement);
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${peer}:${ctx.peer.port}${PEER_LEAVING_PATH}`,
			{
				method: "POST",
				headers: peerRequestHeaders({
					secret: ctx.peer.secret,
					method: "POST",
					path: PEER_LEAVING_PATH,
					body,
				}),
				body,
				signal: AbortSignal.timeout(ANNOUNCE_TIMEOUT_MS),
			},
		);
		await reply.arrayBuffer();
		return reply.ok;
	} catch {
		return false;
	}
};

/** The first step of a planned stop: this replica owns nothing from now on and every member is told, so they take its
 * customers at once instead of when the service name drops it. A peer the announcement misses learns from DNS, as today. */
export const leaveRing = async ({
	ctx,
}: {
	ctx: LeaveRingContext;
}): Promise<void> => {
	ctx.membership.leaveSelf();
	const peers = await ctx.ring.members();
	const told = await Promise.all(
		peers.map((peer) => announceTo({ ctx, peer })),
	);
	const unreached = peers.filter((_, index) => !told[index]);
	if (unreached.length > 0)
		ctx.logger.warn(
			{ type: "atom_leave_unannounced", data: { peers: unreached } },
			"Some peers did not take this replica's leaving; they learn it from the service name",
		);
	ctx.logger.info(
		{
			type: "atom_leaving",
			data: { announced: peers.length - unreached.length },
		},
		"This replica left the ring: its customers are owned by its peers",
	);
};
