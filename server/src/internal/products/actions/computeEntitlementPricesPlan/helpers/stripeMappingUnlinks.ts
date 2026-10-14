import type {
	Price,
	StripePriceMappingSlot,
	UnlinkedStripeSlotsByPriceId,
} from "@autumn/shared";
import type { ClaimResult } from "../types/claimResult";

export type StripeMappingUnlinks = Map<string, StripePriceMappingSlot[]>;

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
