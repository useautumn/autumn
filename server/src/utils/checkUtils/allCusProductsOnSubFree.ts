import {
	cusProductToPrices,
	type FullCustomer,
	isFreeProduct,
} from "@autumn/shared";

export const allCusProductsOnSubFree = ({
	fullCus,
	subId,
}: {
	fullCus: FullCustomer;
	subId: string;
}) => {
	const isFree = fullCus.customer_products.every((cp) => {
		const hasSubId = cp.subscription_ids?.includes(subId);
		if (!hasSubId) return true;
		const prices = cusProductToPrices({ cusProduct: cp });
		if (isFreeProduct({ prices })) {
			return true;
		}
		return false;
	});

	if (isFree) {
		return true;
	}
	return false;
};
