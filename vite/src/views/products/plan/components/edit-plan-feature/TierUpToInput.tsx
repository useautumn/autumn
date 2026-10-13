import { numberWithCommas } from "@autumn/shared";
import { Input } from "@autumn/ui";
import { useState } from "react";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	applyTierToDisplayValue,
	itemToIncludedUsage,
	tierToDisplay,
} from "../../utils/tierUtils";

export function TierUpToInput({ index }: { index: number }) {
	const { item, setItem } = useProductItemContext();
	const [editingValue, setEditingValue] = useState<string>();
	if (!item?.tiers) return null;

	const displayValue = tierToDisplay({
		tier: item.tiers[index],
		includedUsage: itemToIncludedUsage(item),
	});

	return (
		<Input
			aria-label="Up to"
			inputMode="decimal"
			placeholder="100"
			value={editingValue ?? numberWithCommas(Number(displayValue))}
			onFocus={() => setEditingValue(displayValue)}
			onBlur={() => setEditingValue(undefined)}
			onChange={(e) => {
				setEditingValue(e.target.value);
				setItem(
					applyTierToDisplayValue({
						item,
						index,
						displayValue: e.target.value,
					}),
				);
			}}
		/>
	);
}
