import { renameSync, writeFileSync } from "node:fs";
import type { Replica, ReplicaSetContext } from "./types/replicaSet.js";

/** A replica re-reads its peers at most every 5 s, so a changed view holds everywhere this long after it is written. */
export const PEER_VIEW_REREAD_MS = 6_000;

export const cutKey = ({ left, right }: { left: number; right: number }) =>
	`${Math.min(left, right)}:${Math.max(left, right)}`;

const isListed = (replica: Replica): boolean =>
	replica.process !== null && !replica.stopping;

/** The running replicas this one can see: what `atom.svc` would resolve to on its side of any cut. */
const peersOf = ({
	ctx,
	replica,
}: {
	ctx: ReplicaSetContext;
	replica: Replica;
}): string[] =>
	ctx.replicas
		.filter(isListed)
		.filter((peer) => peer.index !== replica.index)
		.filter(
			(peer) =>
				!ctx.cuts.has(cutKey({ left: replica.index, right: peer.index })),
		)
		.map((peer) => peer.hostname);

/** Rewrites every replica's peers file whole, so a replica never reads half of one. */
export const writePeerViews = ({ ctx }: { ctx: ReplicaSetContext }): void => {
	for (const replica of ctx.replicas) {
		const draft = `${replica.peersFile}.next`;
		writeFileSync(draft, peersOf({ ctx, replica }).join("\n"));
		renameSync(draft, replica.peersFile);
	}
};
