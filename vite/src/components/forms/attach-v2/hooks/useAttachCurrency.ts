import type { ProductItem } from "@autumn/shared";
import { useMemo } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { itemCurrencyCodes } from "@/views/products/plan/utils/currencyUtils";

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
		const codes = new Set<string>();
		for (const item of items) {
			for (const code of itemCurrencyCodes(item)) {
				codes.add(code);
			}
		}
		codes.delete(orgDefaultCurrency.toLowerCase());
		return [...codes];
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
