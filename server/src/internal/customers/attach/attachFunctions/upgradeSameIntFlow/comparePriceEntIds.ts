import type { EntitlementWithFeature, Price } from "@autumn/shared";

export const hasPriceIdsChanged = ({
	oldPrices,
	newPrices,
}: {
	oldPrices: Price[];
	newPrices: Price[];
}) => {
	for (const price of oldPrices) {
		if (!newPrices.some((p) => p.id === price.id)) {
			return true;
		}
	}

	for (const price of newPrices) {
		if (!oldPrices.some((p) => p.id === price.id)) {
			return true;
		}
	}

	return false;
};

export const hasEntIdsChanged = ({
	oldEntitlements,
	newEntitlements,
}: {
	oldEntitlements: EntitlementWithFeature[];
	newEntitlements: EntitlementWithFeature[];
}) => {
	for (const entitlement of oldEntitlements) {
		if (!newEntitlements.some((e) => e.id === entitlement.id)) {
			return true;
		}
	}

	for (const entitlement of newEntitlements) {
		if (!oldEntitlements.some((e) => e.id === entitlement.id)) {
			return true;
		}
	}

	return false;
};
