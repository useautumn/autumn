import { TierBehavior } from "@autumn/shared";
import { cn } from "@autumn/ui/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { tierRowKey } from "../../utils/tierUids";
import { itemToIncludedUsage, itemToTierRows } from "../../utils/tierUtils";
import { BillingUnits } from "./BillingUnits";
import { TierTableRow } from "./TierTableRow";
import { tierTableRowClassName } from "./tierTableRowClassName";

export function TierTable({
	currency,
	baseCurrency,
}: {
	currency: string;
	baseCurrency: string;
}) {
	const { item } = useProductItemContext();
	if (!item?.tiers) return null;

	const showsFlatFee = item.tier_behavior === TierBehavior.VolumeBased;
	const rowClassName = tierTableRowClassName({ showsFlatFee });
	const includedRow =
		itemToIncludedUsage(item) > 0
			? itemToTierRows({ item, currency })[0]
			: undefined;

	return (
		<div className="flex flex-col rounded-xl border border-table-tray-border bg-table-tray p-1">
			<div
				className={cn(
					rowClassName,
					"h-7 border border-transparent text-tertiary-foreground text-xs",
				)}
			>
				<span>Up to</span>
				<BillingUnits asColumnHeader />
				{showsFlatFee && <span>Flat fee</span>}
			</div>
			<div className="flex flex-col divide-y divide-table-surface-border overflow-hidden rounded-lg border border-table-surface-border bg-table-surface">
				{includedRow && (
					<div
						className={cn(
							rowClassName,
							"h-11 text-sm text-tertiary-foreground",
						)}
					>
						<span className="px-2">{includedRow.range}</span>
						<span className="col-span-2">{includedRow.value}</span>
					</div>
				)}
				{item.tiers.map((tier, index) => (
					<TierTableRow
						key={tierRowKey({ tier, index })}
						index={index}
						currency={currency}
						baseCurrency={baseCurrency}
						showsFlatFee={showsFlatFee}
					/>
				))}
			</div>
		</div>
	);
}
