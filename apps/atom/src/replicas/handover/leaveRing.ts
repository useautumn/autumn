import type { AutumnLogger } from "@autumn/logging";
import { peerRequestHeaders } from "../../replication/transport/peerSignature.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type { Membership } from "../membership/types/membership.js";
import type { ReplicaRing } from "../types/replicaRing.js";
import { handOffJournals } from "./handOffJournals.js";
import {
	type LeavingAnnouncement,
	PEER_LEAVING_PATH,
} from "./leavingContract.js";

/** A peer that has not taken the announcement by then is treated as unreachable: DNS tells it later, as today. */
const ANNOUNCE_TIMEOUT_MS = 1_000;

export type LeaveRingContext = {
	ring: ReplicaRing;
	membership: Membership;
	/** This thread's folders: whose journals it hands over. */
	folders: Pick<ReplicaFolders, "all">;
	/** The replica's threads, each of which leaves and hands off on its own; the peers wait for all of them. */
	threads: number;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
};

const announceTo = async ({
	ctx,
	peer,
	handedOff = false,
}: {
	ctx: LeaveRingContext;
	peer: string;
	handedOff?: boolean;
}): Promise<boolean> => {
	const body = JSON.stringify({
		address: ctx.ring.self,
		...(handedOff && { handedOff: { threads: ctx.threads } }),
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

/** The first step of a planned stop: this replica owns nothing from now on, every member is told, so they take its customers
 * at once, and what this thread's journals owe goes to the new owners. A peer the announcement misses learns from DNS, as today. */
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
	const { handed, kept } = await handOffJournals({ ctx });
	// Told once per thread: the peers release every moved customer's wait once all of this replica's threads have handed off.
	await Promise.all(
		peers
			.filter((_, index) => told[index])
			.map((peer) => announceTo({ ctx, peer, handedOff: true })),
	);
	ctx.logger.info(
		{
			type: "atom_leaving",
			data: { announced: peers.length - unreached.length, handed, kept },
		},
		"This replica left the ring: its customers are owned by its peers",
	);
};
