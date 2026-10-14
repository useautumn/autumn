import { formatAmount, numberWithCommas } from "@autumn/shared";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@autumn/ui";
import { useState } from "react";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { itemToIncludedUsage, tierToDisplay } from "../../utils/tierUtils";
import {
	billedTierLabel,
	itemToVolumeExampleBill,
} from "../../utils/volumeExampleBill";
import { BillCell } from "./BillCell";

export function VolumeExampleBill({
	currency,
	baseCurrency,
	unitName,
}: {
	currency: string;
	baseCurrency: string;
	unitName: string;
}) {
	const { item } = useProductItemContext();
	const [usageInput, setUsageInput] = useState(() =>
		item
			? tierToDisplay({
					tier: item.tiers?.[0],
					includedUsage: itemToIncludedUsage(item),
				})
			: "",
	);
	if (!item) return null;

	const bill = itemToVolumeExampleBill({
		item,
		usage: Number(usageInput.replace(/,/g, "")) || 0,
		currency,
		baseCurrency,
	});
	const format = (amount: number) =>
		formatAmount({
			amount,
			currency,
			minFractionDigits: Number.isInteger(amount) ? 0 : 2,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});
	const flatFee = bill.billedTier?.flat_amount ?? 0;

	return (
		<div className="flex flex-col gap-3 rounded-xl border p-3 tabular-nums">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-sm">Example bill</span>
				<div className="flex items-center gap-2">
					<span className="text-tertiary-foreground text-xs">Usage</span>
					<InputGroup className="w-36">
						<InputGroupInput
							aria-label="Example usage"
							inputMode="decimal"
							value={usageInput}
							onChange={(e) => setUsageInput(e.target.value)}
						/>
						<InputGroupAddon align="inline-end">
							<span className="max-w-16 truncate text-tertiary-foreground text-xs">
								{unitName}
							</span>
						</InputGroupAddon>
					</InputGroup>
				</div>
			</div>
			<div className="flex flex-wrap items-end gap-x-2 gap-y-1 text-sm">
				<BillCell label="Tier" value={billedTierLabel(bill)} />
				<span className="text-tertiary-foreground">·</span>
				<BillCell
					label="Billed"
					value={`${numberWithCommas(bill.billedUsage)} × ${format(bill.unitRate)}`}
				/>
				{flatFee > 0 && (
					<>
						<span className="text-tertiary-foreground">+</span>
						<BillCell label="Flat fee" value={format(flatFee)} />
					</>
				)}
			</div>
			<div className="flex items-baseline justify-between gap-3 border-t pt-2">
				<span className="text-tertiary-foreground text-xs">Total</span>
				<span className="min-w-0 break-all text-right font-semibold text-lg">
					{format(bill.total)}
				</span>
			</div>
		</div>
	);
}
