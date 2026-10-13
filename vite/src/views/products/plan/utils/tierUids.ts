import type { PriceTier, ProductItem } from "@autumn/shared";

/** A tier with an editor-only id, so table rows keep their input state across inserts and deletes. */
export type EditorTier = PriceTier & { _uid?: string };

const indexRowKey = (index: number) => `tier-${index}`;

export const tierRowKey = ({
	tier,
	index,
}: {
	tier: EditorTier;
	index: number;
}) => tier._uid ?? indexRowKey(index);

/** Pins each untagged tier to the key it already renders with; run before reordering tiers. */
export const withTierUids = (item: ProductItem): ProductItem => ({
	...item,
	tiers: item.tiers?.map((tier: EditorTier, index) =>
		tier._uid ? tier : { ...tier, _uid: indexRowKey(index) },
	),
});

export const newTierUid = () => crypto.randomUUID();

export const stripTierUids = (tiers: EditorTier[]): PriceTier[] =>
	tiers.map(({ _uid, ...tier }) => tier);
