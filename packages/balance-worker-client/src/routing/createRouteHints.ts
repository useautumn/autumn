import type { PartitionOwner } from "./types/routing.js";

const DEFAULT_HINT_TTL_MS = 60_000;

/** Routes learned from a worker's own NOT_OWNER answer, ahead of the ownership topic. */
export type RouteHints = {
	/** Keeps `successor` when it is newer than the hint held and the ownership `known`; false otherwise. */
	adopt(params: { successor: PartitionOwner; known?: PartitionOwner }): boolean;
	find(params: { partition: number }): PartitionOwner | undefined;
	/** Forgets the hint for a partition when the endpoint it named is the one that declined. */
	drop(params: { partition: number; endpoint: string }): void;
};

/** A route epoch is the offset of the claim that set it, so a larger one is a later claim. */
export function isNewerRoute({
	candidate,
	than,
}: {
	candidate: PartitionOwner;
	than: PartitionOwner | undefined;
}): boolean {
	if (!than) return true;
	return BigInt(candidate.routeEpoch) > BigInt(than.routeEpoch);
}

/** Hints expire on their own so a worker that named a successor wrongly cannot misroute a partition for long:
 *  the ownership topic catches up within seconds, and a hint no newer than what it says is dropped on sight. */
export function createRouteHints({
	now = Date.now,
	ttlMs = DEFAULT_HINT_TTL_MS,
}: {
	now?: () => number;
	ttlMs?: number;
} = {}): RouteHints {
	const hints = new Map<number, { owner: PartitionOwner; expiresAt: number }>();

	function find({
		partition,
	}: {
		partition: number;
	}): PartitionOwner | undefined {
		const hint = hints.get(partition);
		if (!hint) return undefined;
		if (hint.expiresAt <= now()) {
			hints.delete(partition);
			return undefined;
		}
		return { ...hint.owner };
	}

	function adopt({
		successor,
		known,
	}: {
		successor: PartitionOwner;
		known?: PartitionOwner;
	}): boolean {
		const held = find({ partition: successor.partition });
		if (!isNewerRoute({ candidate: successor, than: known })) return false;
		if (held && !isNewerRoute({ candidate: successor, than: held }))
			return false;
		hints.set(successor.partition, {
			owner: { ...successor },
			expiresAt: now() + ttlMs,
		});
		return true;
	}

	function drop({
		partition,
		endpoint,
	}: {
		partition: number;
		endpoint: string;
	}): void {
		if (hints.get(partition)?.owner.endpoint === endpoint)
			hints.delete(partition);
	}

	return { adopt, find, drop };
}
