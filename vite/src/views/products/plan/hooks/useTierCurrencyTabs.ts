import type { ProductItem } from "@autumn/shared";
import { useState } from "react";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	addCurrencyToTiers,
	itemCurrencyCodes,
	removeCurrencyFromTiers,
	stampBaseCurrency,
} from "../utils/currencyUtils";

/** Which currency the tier table edits, and adding or removing a currency on every tier. */
export const useTierCurrencyTabs = ({
	baseCurrency,
}: {
	baseCurrency: string;
}) => {
	const { item, setItem } = useProductItemContext();
	const baseCode = baseCurrency.toLowerCase();
	const [selectedCurrency, setSelectedCurrency] = useState(baseCode);

	const additionalCodes = item ? itemCurrencyCodes(item) : [];
	const activeCurrency = additionalCodes.includes(selectedCurrency)
		? selectedCurrency
		: baseCode;

	const applyChange = (nextItem: ProductItem) =>
		setItem(stampBaseCurrency({ item: nextItem, orgCurrency: baseCurrency }));

	const addCurrency = (code: string) => {
		if (!item) return;
		const normalized = code.toLowerCase();
		applyChange(addCurrencyToTiers({ item, code: normalized }));
		setSelectedCurrency(normalized);
	};

	const removeActiveCurrency = () => {
		if (!item) return;
		applyChange(removeCurrencyFromTiers({ item, code: activeCurrency }));
	};

	return {
		currencies: [baseCode, ...additionalCodes],
		activeCurrency,
		isBaseCurrencyActive: activeCurrency === baseCode,
		selectCurrency: setSelectedCurrency,
		addCurrency,
		removeActiveCurrency,
	};
};
