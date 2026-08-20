import {
	ENTITLEMENT_PRICE_MATCH_PRECISIONS,
	type EntitlementPrice,
	entitlementPricesAreSame,
	type FullProductWithoutLicenses,
	findEntitlementPriceSuccessor,
	productToEntitlementPrices,
} from "@autumn/shared";

export type EntitlementPriceTransition = {
	fromEntitlementPrice: EntitlementPrice;
	toEntitlementPrice: EntitlementPrice;
};

export type ComputedEntitlementPriceTransitions = {
	transitions: EntitlementPriceTransition[];
	added: EntitlementPrice[];
	deleted: EntitlementPrice[];
};

export const computeEntitlementPriceTransitions = ({
	fromProduct,
	toProduct,
}: {
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
}): ComputedEntitlementPriceTransitions => {
	const fromEntitlementPrices = productToEntitlementPrices({
		product: fromProduct,
	});
	const toEntitlementPrices = productToEntitlementPrices({
		product: toProduct,
	});

	// Precision-major matching: every source gets a shot at the strongest rung
	// before any source falls to a weaker one, so an exact survivor claims its
	// own candidate before a sibling's feature-only match can steal it.
	const claimedToEntitlementIds = new Set<string>();
	const matchedByFromIndex = new Map<number, EntitlementPrice>();
	for (const matchPrecision of ENTITLEMENT_PRICE_MATCH_PRECISIONS) {
		fromEntitlementPrices.forEach((fromEntitlementPrice, fromIndex) => {
			if (matchedByFromIndex.has(fromIndex)) return;
			const toEntitlementPrice = findEntitlementPriceSuccessor({
				sourceEntitlementPrice: fromEntitlementPrice,
				candidateEntitlementPrices: toEntitlementPrices,
				excludedEntitlementIds: claimedToEntitlementIds,
				matchPrecisions: [matchPrecision],
			});
			if (!toEntitlementPrice) return;
			claimedToEntitlementIds.add(toEntitlementPrice.entitlement.id);
			matchedByFromIndex.set(fromIndex, toEntitlementPrice);
		});
	}

	const transitions: EntitlementPriceTransition[] = [];
	const deleted: EntitlementPrice[] = [];
	fromEntitlementPrices.forEach((fromEntitlementPrice, fromIndex) => {
		const toEntitlementPrice = matchedByFromIndex.get(fromIndex);
		if (!toEntitlementPrice) {
			deleted.push(fromEntitlementPrice);
			return;
		}

		const unchangedIds =
			fromEntitlementPrice.entitlement.id ===
				toEntitlementPrice.entitlement.id &&
			fromEntitlementPrice.price?.id === toEntitlementPrice.price?.id;
		if (
			!unchangedIds ||
			!entitlementPricesAreSame({
				entitlementPrice1: fromEntitlementPrice,
				entitlementPrice2: toEntitlementPrice,
			})
		) {
			transitions.push({ fromEntitlementPrice, toEntitlementPrice });
		}
	});

	const added = toEntitlementPrices.filter(
		(toEntitlementPrice) =>
			!claimedToEntitlementIds.has(toEntitlementPrice.entitlement.id),
	);

	return { transitions, added, deleted };
};
