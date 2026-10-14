export const STRIPE_PRICE_MAPPING_SLOTS = [
	"stripe_price_id",
	"stripe_prepaid_price_v2_id",
] as const;

export type StripePriceMappingSlot =
	(typeof STRIPE_PRICE_MAPPING_SLOTS)[number];

export type UnlinkedStripeSlotsByPriceId = Record<
	string,
	StripePriceMappingSlot[]
>;

export const unlinkedStripeSlotsForItem = ({
	item,
}: {
	item: Partial<Record<StripePriceMappingSlot, string | null | undefined>>;
}): StripePriceMappingSlot[] =>
	STRIPE_PRICE_MAPPING_SLOTS.filter((slot) => item[slot] === null);
