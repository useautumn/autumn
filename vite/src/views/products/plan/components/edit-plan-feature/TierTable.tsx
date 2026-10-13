import {
	featureUtils,
	numberWithCommas,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { cn } from "@autumn/ui/lib/utils";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { featureUnitName } from "../../utils/billingUnitsUtils";
import { tierRowKey } from "../../utils/tierUids";
import { itemToIncludedUsage } from "../../utils/tierUtils";
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
	const { features } = useFeaturesQuery();
	if (!item?.tiers) return null;

	const feature = features.find((feature) => feature.id === item.feature_id);
	const showsFlatFee = item.tier_behavior === TierBehavior.VolumeBased;
	const rowClassName = tierTableRowClassName({ showsFlatFee });
	const includedUsage = itemToIncludedUsage(item);
	// Stripe would bill an allocated tier-1 flat fee with no seats over included, so the API rejects it.
	const isAllocated =
		item.usage_model === UsageModel.PayPerUse &&
		feature !== undefined &&
		featureUtils.isAllocated(feature);

	return (
		<div className="flex flex-col gap-2">
			{includedUsage > 0 && (
				<p className="text-tertiary-foreground text-xs tabular-nums">
					First {numberWithCommas(includedUsage)}{" "}
					{featureUnitName({ feature, plural: true })} included free. Tiers
					start after.
				</p>
			)}
			<div className="flex flex-col rounded-xl border border-table-tray-border bg-table-tray p-1 tabular-nums">
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
					{item.tiers.map((tier, index) => (
						<TierTableRow
							key={tierRowKey({ tier, index })}
							index={index}
							currency={currency}
							baseCurrency={baseCurrency}
							showsFlatFee={showsFlatFee}
							blocksFlatFee={isAllocated && index === 0}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
