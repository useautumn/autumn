import {
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
} from "@autumn/shared";
import { cusEntToCusPrice } from "@shared/utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";

const customerPricesForCustomerEntitlements = ({
	customerProduct,
	customerEntitlements,
}: {
	customerProduct: FullCusProduct;
	customerEntitlements: FullCustomerEntitlement[];
}): FullCustomerPrice[] => {
	const customerPricesById = new Map<string, FullCustomerPrice>();

	for (const customerEntitlement of customerEntitlements) {
		const customerPrice = cusEntToCusPrice({
			cusEnt: {
				...customerEntitlement,
				customer_product: customerProduct,
			} satisfies FullCusEntWithFullCusProduct,
		});
		if (!customerPrice) continue;

		customerPricesById.set(customerPrice.id, customerPrice);
	}

	return Array.from(customerPricesById.values());
};

export const customerProductWithOnlyEntitlements = ({
	customerProduct,
	customerEntitlements,
}: {
	customerProduct: FullCusProduct;
	customerEntitlements: FullCustomerEntitlement[];
}): FullCusProduct => ({
	...customerProduct,
	customer_prices: customerPricesForCustomerEntitlements({
		customerProduct,
		customerEntitlements,
	}),
	customer_entitlements: customerEntitlements,
});
