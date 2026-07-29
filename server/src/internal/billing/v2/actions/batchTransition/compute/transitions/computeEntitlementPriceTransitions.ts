import {
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
	const transitions: EntitlementPriceTransition[] = [];
	const added: EntitlementPrice[] = [];
	const deleted: EntitlementPrice[] = [];
	const claimedToEntitlementIds = new Set<string>();
	const fromEntitlementPrices = productToEntitlementPrices({
		product: fromProduct,
	});
	const toEntitlementPrices = productToEntitlementPrices({
		product: toProduct,
	});

	for (const fromEntitlementPrice of fromEntitlementPrices) {
		const toEntitlementPrice = findEntitlementPriceSuccessor({
			sourceEntitlementPrice: fromEntitlementPrice,
			candidateEntitlementPrices: toEntitlementPrices,
			excludedEntitlementIds: claimedToEntitlementIds,
		});
		if (!toEntitlementPrice) {
			deleted.push(fromEntitlementPrice);
			continue;
		}

		claimedToEntitlementIds.add(toEntitlementPrice.entitlement.id);
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
	}

	for (const toEntitlementPrice of toEntitlementPrices) {
		if (!claimedToEntitlementIds.has(toEntitlementPrice.entitlement.id)) {
			added.push(toEntitlementPrice);
		}
	}

	return { transitions, added, deleted };
};
