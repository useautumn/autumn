import type { PartitionOwner } from "./types/routing.js";

const DEFAULT_HINT_TTL_MS = 60_000;

export type RouteHints = {
	adopt(params: { successor: PartitionOwner; known?: PartitionOwner }): boolean;
	find(params: { partition: number }): PartitionOwner | undefined;
	drop(params: { partition: number; endpoint: string }): void;
};

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
