import type {
	CustomizePlanV1,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomerEntitlement,
	FullCustomerPrice,
} from "@autumn/shared";
import { planItemFilterMatchesCustomerPair } from "@shared/api/products/items/utils/match";
import { cusEntToCusPrice } from "@shared/utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { customerPriceToCustomerEntitlement } from "@shared/utils/cusPriceUtils/convertCustomerPrice/customerPriceToCustomerEntitlement";

type CustomerProductItemPair = {
	customerPrice?: FullCustomerPrice;
	customerEntitlement?: FullCustomerEntitlement;
};

const getCustomerProductItemPairs = ({
	targetCustomerProduct,
}: {
	targetCustomerProduct: FullCusProduct;
}): CustomerProductItemPair[] => {
	const pairs: CustomerProductItemPair[] =
		targetCustomerProduct.customer_prices.map((customerPrice) => ({
			customerPrice,
			customerEntitlement: customerPriceToCustomerEntitlement({
				customerPrice,
				customerEntitlements: targetCustomerProduct.customer_entitlements,
			}),
		}));

	for (const customerEntitlement of targetCustomerProduct.customer_entitlements) {
		const customerPrice = cusEntToCusPrice({
			cusEnt: {
				...customerEntitlement,
				customer_product: targetCustomerProduct,
			} satisfies FullCusEntWithFullCusProduct,
		});

		if (!customerPrice) {
			pairs.push({ customerEntitlement });
		}
	}

	return pairs;
};

const getCustomerProductItemsToDelete = ({
	pairsToDelete,
	targetCustomerProduct,
}: {
	pairsToDelete: CustomerProductItemPair[];
	targetCustomerProduct: FullCusProduct;
}): {
	customerPrices: FullCustomerPrice[];
	customerEntitlements: FullCustomerEntitlement[];
} => {
	const customerPrices = new Map<string, FullCustomerPrice>();
	const customerEntitlements = new Map<string, FullCustomerEntitlement>();
	const entitlementIdsToDelete = new Set<string>();

	for (const pair of pairsToDelete) {
		if (pair.customerPrice) {
			customerPrices.set(pair.customerPrice.id, pair.customerPrice);
		}

		if (pair.customerEntitlement) {
			customerEntitlements.set(
				pair.customerEntitlement.id,
				pair.customerEntitlement,
			);
			entitlementIdsToDelete.add(pair.customerEntitlement.entitlement.id);
		}
	}

	for (const customerPrice of targetCustomerProduct.customer_prices) {
		if (
			customerPrice.price.entitlement_id &&
			entitlementIdsToDelete.has(customerPrice.price.entitlement_id)
		) {
			customerPrices.set(customerPrice.id, customerPrice);
		}
	}

	return {
		customerPrices: Array.from(customerPrices.values()),
		customerEntitlements: Array.from(customerEntitlements.values()),
	};
};

const deleteCustomerProductItems = ({
	pairsToDelete,
	targetCustomerProduct,
}: {
	pairsToDelete: CustomerProductItemPair[];
	targetCustomerProduct: FullCusProduct;
}): {
	customerPrices: FullCustomerPrice[];
	customerEntitlements: FullCustomerEntitlement[];
} => {
	const { customerPrices, customerEntitlements } =
		getCustomerProductItemsToDelete({
			pairsToDelete,
			targetCustomerProduct,
		});

	const customerPriceIdsToDelete = new Set(
		customerPrices.map((customerPrice) => customerPrice.id),
	);
	const customerEntitlementIdsToDelete = new Set(
		customerEntitlements.map((customerEntitlement) => customerEntitlement.id),
	);

	targetCustomerProduct.customer_prices =
		targetCustomerProduct.customer_prices.filter(
			(customerPrice) => !customerPriceIdsToDelete.has(customerPrice.id),
		);
	targetCustomerProduct.customer_entitlements =
		targetCustomerProduct.customer_entitlements.filter(
			(customerEntitlement) =>
				!customerEntitlementIdsToDelete.has(customerEntitlement.id),
		);

	return { customerPrices, customerEntitlements };
};

export const handleCustomizeDeleteItems = ({
	customize,
	targetCustomerProduct,
}: {
	customize: CustomizePlanV1;
	targetCustomerProduct: FullCusProduct;
}): {
	customerPrices: FullCustomerPrice[];
	customerEntitlements: FullCustomerEntitlement[];
} => {
	const pairsToDelete = getCustomerProductItemPairs({
		targetCustomerProduct,
	}).filter((pair) =>
		(customize.remove_items ?? []).some((filter) =>
			planItemFilterMatchesCustomerPair({
				filter,
				customerPrice: pair.customerPrice,
				customerEntitlement: pair.customerEntitlement,
			}),
		),
	);

	return deleteCustomerProductItems({
		pairsToDelete,
		targetCustomerProduct,
	});
};
