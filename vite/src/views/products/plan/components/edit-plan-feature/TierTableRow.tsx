import { IconButton } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { TrashIcon } from "@phosphor-icons/react";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { tierPriceInCurrency } from "../../utils/currencyUtils";
import { removeTier, updateTierPrice } from "../../utils/tierUtils";
import {
	amountDisplayValue,
	CurrencyAmountInput,
} from "../shared/CurrencyAmountInput";
import { TierUpToInput } from "./TierUpToInput";
import { tierTableRowClassName } from "./tierTableRowClassName";

export function TierTableRow({
	index,
	currency,
	baseCurrency,
	showsFlatFee,
	blocksFlatFee,
}: {
	index: number;
	currency: string;
	baseCurrency: string;
	showsFlatFee: boolean;
	blocksFlatFee: boolean;
}) {
	const { item, setItem } = useProductItemContext();
	const tier = item?.tiers?.[index];
	if (!item || !tier) return null;

	const price = tierPriceInCurrency({ tier, code: currency, baseCurrency });
	const isLastTier = index === (item.tiers?.length ?? 0) - 1;
	const setPrice = (field: "amount" | "flat_amount") => (value: string) =>
		setItem(
			updateTierPrice({ item, index, currency, baseCurrency, field, value }),
		);

	return (
		<div className={cn(tierTableRowClassName({ showsFlatFee }), "h-11")}>
			{isLastTier ? (
				<span className="px-2 text-sm text-tertiary-foreground">Unlimited</span>
			) : (
				<TierUpToInput index={index} />
			)}
			<CurrencyAmountInput
				currencyCode={currency}
				displayValue={amountDisplayValue(price.amount ?? 0)}
				onRawChange={setPrice("amount")}
			/>
			{showsFlatFee && blocksFlatFee && (
				<span
					className="px-2 text-sm text-tertiary-foreground"
					title="Allocated items can't charge a flat fee on the first tier"
				>
					—
				</span>
			)}
			{showsFlatFee && !blocksFlatFee && (
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
