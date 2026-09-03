import type {
	Price,
	StripePriceMappingSlot,
	UnlinkedStripeSlotsByPriceId,
} from "@autumn/shared";
import type { ClaimResult } from "../types/claimResult";

/** Slots to clear, keyed by the id of the row the plan writes. */
export type StripeMappingUnlinks = Map<string, StripePriceMappingSlot[]>;

/**
 * An unlink is stated on a desired row but has to land on the current row the
 * claim paired it with — that is the row holding the mapping, and the one the
 * plan writes. An unclaimed desired row has nothing to unlink: it is minted
 * with no mapping either way.
 */
export const stripeMappingUnlinks = ({
	claims,
	unlinkedStripeSlots,
}: {
	claims: ClaimResult;
	unlinkedStripeSlots: UnlinkedStripeSlotsByPriceId;
}): StripeMappingUnlinks => {
	const unlinks: StripeMappingUnlinks = new Map();

	const record = ({
		desired,
		current,
	}: {
		desired?: Price;
		current?: Price;
	}) => {
		if (!desired || !current) return;
		const slots = unlinkedStripeSlots[desired.id];
		if (slots?.length) unlinks.set(current.id, slots);
	};

	for (const claim of claims.entitlementPriceClaims) {
		record({ desired: claim.desired.price, current: claim.current.price });
	}

	if (claims.basePriceClaim) {
		record({
			desired: claims.basePriceClaim.desired,
			current: claims.basePriceClaim.current,
		});
	}

	return unlinks;
};
