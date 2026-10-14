import { featureUtils, UsageModel } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { TrashIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	tierPriceInCurrency,
	updateTierCurrencyAmount,
} from "../../utils/currencyUtils";
import { removeTier, updateTier } from "../../utils/tierUtils";
import {
	amountDisplayValue,
	CurrencyAmountInput,
} from "../shared/CurrencyAmountInput";

/** One tier's cells in the active currency; `children` is the "Up to" cell. */
export function TierTableRow({
	index,
	currency,
	baseCurrency,
	className,
	showsFlatFee,
	children,
}: {
	index: number;
	currency: string;
	baseCurrency: string;
	className: string;
	showsFlatFee: boolean;
	children: ReactNode;
}) {
	const { item, setItem } = useProductItemContext();
	const { features } = useFeaturesQuery();
	const tier = item?.tiers?.[index];
	if (!item || !tier) return null;

	const price = tierPriceInCurrency({ tier, code: currency, baseCurrency });
	const isBase = currency === baseCurrency.toLowerCase();
	const feature = features.find((feature) => feature.id === item.feature_id);
	// The API rejects an allocated tier-1 flat fee; one already set stays editable so it can be cleared.
	const locksFlatFee =
		index === 0 &&
		![tier, ...(tier.additional_currencies ?? [])].some(
			(entry) => entry.flat_amount,
		) &&
		item.usage_model === UsageModel.PayPerUse &&
		feature !== undefined &&
		featureUtils.isAllocated(feature);
	const setPrice = (field: "amount" | "flat_amount") => (value: string) =>
		isBase
			? updateTier({ item, setItem, index, field, value })
			: setItem(
					updateTierCurrencyAmount({
						item,
						tierIndex: index,
						code: currency,
						field,
						value,
					}),
				);

	return (
		<div className={cn(className, "h-11")}>
			{children}
			<CurrencyAmountInput
				currencyCode={currency}
				displayValue={amountDisplayValue(price.amount ?? 0)}
				onRawChange={setPrice("amount")}
			/>
			{showsFlatFee && locksFlatFee && (
				<span className="px-2 text-sm text-tertiary-foreground">—</span>
			)}
			{showsFlatFee && !locksFlatFee && (
				<CurrencyAmountInput
					currencyCode={currency}
					displayValue={amountDisplayValue(price.flat_amount ?? 0)}
					onRawChange={setPrice("flat_amount")}
					placeholder="—"
				/>
			)}
			<IconButton
				aria-label="Remove tier"
				variant="muted"
				onClick={() => removeTier({ item, setItem, index })}
				icon={<TrashIcon size={12} />}
				className="p-1 text-tertiary-foreground hover:text-red-500"
			/>
		</div>
	);
}
