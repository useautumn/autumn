import type { ProductItem } from "@autumn/shared";
import { useCallback } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { productItemsForCurrency } from "@/views/products/plan/utils/currencyUtils";

export const useCustomerDisplayCurrency = (): {
	displayCurrency: string;
	orgDefaultCurrency: string;
	itemsForDisplay: (items: ProductItem[]) => ProductItem[];
	productForDisplay: <T extends { items: ProductItem[] }>(product: T) => T;
} => {
	const { org } = useOrg();
	const { customer } = useCusQuery();
	const orgDefaultCurrency = org?.default_currency ?? "USD";
	const displayCurrency = customer?.currency ?? orgDefaultCurrency;

	const itemsForDisplay = useCallback(
		(items: ProductItem[]) =>
			productItemsForCurrency({
				items,
				currency: displayCurrency,
				orgDefaultCurrency,
			}),
		[displayCurrency, orgDefaultCurrency],
	);

	const productForDisplay = useCallback(
		<T extends { items: ProductItem[] }>(product: T): T => ({
			...product,
			items: itemsForDisplay(product.items),
		}),
		[itemsForDisplay],
	);

	return {
		displayCurrency,
		orgDefaultCurrency,
		itemsForDisplay,
		productForDisplay,
	};
};
