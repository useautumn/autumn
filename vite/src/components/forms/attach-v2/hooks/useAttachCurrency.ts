import type { ProductItem } from "@autumn/shared";
import { useMemo } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { itemCurrencyCodes } from "@/views/products/plan/utils/currencyUtils";

// Options must survive the backend's every-charging-price-offers-currency
// guard, so only currencies present on all charging items are selectable.
const itemCharges = (item: ProductItem): boolean => {
	if (item.tiers?.length) {
		return item.tiers.some(
			(tier) => (tier.amount ?? 0) + (tier.flat_amount ?? 0) > 0,
		);
	}
	return (item.price ?? 0) > 0;
};

export interface UseAttachCurrencyReturn {
	orgDefaultCurrency: string;
	currencyOptions: string[];
	showCurrencySelector: boolean;
	displayCurrency: string;
	requestCurrency: string | null;
}

export function useAttachCurrency({
	items,
	customerCurrency,
	selectedCurrency,
}: {
	items: ProductItem[];
	customerCurrency: string | null | undefined;
	selectedCurrency: string | null;
}): UseAttachCurrencyReturn {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";

	const planCurrencyCodes = useMemo(() => {
		const chargingItems = items.filter(itemCharges);
		if (chargingItems.length === 0) return [];

		let codes: Set<string> | null = null;
		for (const item of chargingItems) {
			const itemCodes = new Set(itemCurrencyCodes(item));
			codes =
				codes === null
					? itemCodes
					: new Set([...codes].filter((code) => itemCodes.has(code)));
		}
		codes?.delete(orgDefaultCurrency.toLowerCase());
		return [...(codes ?? [])];
	}, [items, orgDefaultCurrency]);

	const showCurrencySelector =
		!!org?.config?.multi_currency &&
		!customerCurrency &&
		planCurrencyCodes.length > 0;

	const currencyOptions = useMemo(
		() => [orgDefaultCurrency.toLowerCase(), ...planCurrencyCodes],
		[orgDefaultCurrency, planCurrencyCodes],
	);

	const formCurrency =
		showCurrencySelector &&
		selectedCurrency &&
		currencyOptions.includes(selectedCurrency.toLowerCase())
			? selectedCurrency.toLowerCase()
			: null;

	const displayCurrency =
		formCurrency ?? customerCurrency ?? orgDefaultCurrency;

	const requestCurrency =
		formCurrency && formCurrency !== orgDefaultCurrency.toLowerCase()
			? formCurrency
			: null;

	return {
		orgDefaultCurrency,
		currencyOptions,
		showCurrencySelector,
		displayCurrency,
		requestCurrency,
	};
}
