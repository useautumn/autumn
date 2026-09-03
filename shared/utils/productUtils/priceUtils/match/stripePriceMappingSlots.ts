/** Fixed prices bill from the v1 slot, prepaid from the v2 slot. */
export const STRIPE_PRICE_MAPPING_SLOTS = [
	"stripe_price_id",
	"stripe_prepaid_price_v2_id",
] as const;

export type StripePriceMappingSlot =
	(typeof STRIPE_PRICE_MAPPING_SLOTS)[number];

/**
 * `itemToPriceAndEnt` writes a nullish slot both when the request said nothing
 * and when it stated an unlink, so the price alone cannot tell them apart.
 * The unlink therefore travels beside the desired rows, keyed by desired price
 * id — the claim pairs that to the current row actually holding the mapping.
 */
export type UnlinkedStripeSlotsByPriceId = Record<
	string,
	StripePriceMappingSlot[]
>;

/** The slots this item's request stated as `null`, meaning "unlink". */
export const unlinkedStripeSlotsForItem = ({
	item,
}: {
	item: Partial<Record<StripePriceMappingSlot, string | null | undefined>>;
}): StripePriceMappingSlot[] =>
	STRIPE_PRICE_MAPPING_SLOTS.filter((slot) => item[slot] === null);
