import { Decimal } from "decimal.js";

export type AllocationUsage = { requested: number; usage: number };

const claimedOf = ({ requested, usage }: AllocationUsage) =>
	Decimal.min(usage, requested);

/** Largest scale ≤ 1 at which every entity's unused share still fits in what's left of the pot. */
export const solveAllocationScale = ({
	sharedRemaining,
	entries,
}: {
	sharedRemaining: number;
	entries: AllocationUsage[];
}): number => {
	const live = entries.filter((entry) => entry.requested > 0);
	const remaining = Decimal.max(0, sharedRemaining);
	const unusedAtFullScale = live.reduce(
		(sum, entry) => sum.plus(new Decimal(entry.requested).minus(claimedOf(entry))),
		new Decimal(0),
	);
	if (unusedAtFullScale.lte(remaining)) return 1;

	// Each entity starts holding unused credits once scale passes claimed / requested.
	const byThreshold = live
		.map((entry) => ({
			requested: new Decimal(entry.requested),
			claimed: claimedOf(entry),
			threshold: claimedOf(entry).div(entry.requested),
		}))
		.sort((a, b) => a.threshold.comparedTo(b.threshold));

	let activeRequested = new Decimal(0);
	let activeClaimed = new Decimal(0);
	for (const [index, entry] of byThreshold.entries()) {
		activeRequested = activeRequested.plus(entry.requested);
		activeClaimed = activeClaimed.plus(entry.claimed);
		const nextThreshold = byThreshold[index + 1]?.threshold ?? new Decimal(1);
		const scale = remaining.plus(activeClaimed).div(activeRequested);
		if (scale.lte(nextThreshold)) return Decimal.max(scale, entry.threshold).toNumber();
	}
	return 1;
};

/** The share an entity holds right now: its request scaled down, rounded to whole credits, never below usage. */
export const allocationGranted = ({
	requested,
	usage,
	scale,
}: AllocationUsage & { scale: number }): number => {
	if (scale >= 1) return requested;
	const scaled = new Decimal(requested).times(scale).floor();
	return Decimal.max(claimedOf({ requested, usage }), scaled).toNumber();
};

/** What a deduction may take from shared rows: the entity's own unused share, then credits nobody holds. */
export const allocationGate = ({
	own,
	scale,
	heldUnused,
	sharedRemaining,
}: {
	own: AllocationUsage | null;
	scale: number;
	heldUnused: number;
	sharedRemaining: number;
}): { ownUnused: number; unallocated: number } => {
	const ownUnused = own
		? Decimal.max(0, new Decimal(allocationGranted({ ...own, scale })).minus(own.usage))
		: new Decimal(0);
	if (scale < 1) return { ownUnused: ownUnused.toNumber(), unallocated: 0 };
	const unallocated = Decimal.max(
		0,
		new Decimal(sharedRemaining).minus(heldUnused),
	);
	return { ownUnused: ownUnused.toNumber(), unallocated: unallocated.toNumber() };
};

/** First-call usage nobody was counting: absorbed from the end of the list so the first entries stay whole. */
export const packAllocationGap = ({
	gap,
	entries,
}: {
	gap: number;
	entries: { entityId: string; amount: number }[];
}): Record<string, number> => {
	let left = Decimal.max(0, gap);
	const usage: Record<string, number> = {};
	for (const entry of [...entries].reverse()) {
		const absorbed = Decimal.min(left, entry.amount);
		usage[entry.entityId] = absorbed.toNumber();
		left = left.minus(absorbed);
	}
	return Object.fromEntries(
		entries.map((entry) => [entry.entityId, usage[entry.entityId] ?? 0]),
	);
};
