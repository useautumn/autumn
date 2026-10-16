import type {
	PartitionEntry,
	PartitionsState,
} from "../types/partitionState.js";

/** A successor that stopped waiting claims for itself, and the predecessor's claim for it can land after; the later one is the route callers hold. */
export function followOwnClaims({
	state,
	entry,
}: {
	state: PartitionsState;
	entry: PartitionEntry;
}): void {
	function onClaim({ routeEpoch }: { routeEpoch: string }): void {
		entry.newestOwnClaim = newerRouteEpoch({
			routeEpoch,
			than: entry.newestOwnClaim,
		});
		state.directory.adoptNewerRoute({
			partition: entry.partition,
			routeEpoch,
			runtime: entry.runtime,
		});
	}
	entry.claimFollow?.abort();
	const claimFollow = new AbortController();
	entry.claimFollow = claimFollow;
	entry.publication.followClaims?.({
		signal: AbortSignal.any([entry.handoffAbort.signal, claimFollow.signal]),
		onClaim,
	});
}

export function newerRouteEpoch({
	routeEpoch,
	than,
}: {
	routeEpoch: string;
	than: string | null;
}): string {
	return than !== null && BigInt(than) > BigInt(routeEpoch) ? than : routeEpoch;
}
