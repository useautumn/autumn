import {
	BillingInterval,
	Infinite,
	isContUseItem,
	isFeaturePriceItem,
	ProductItemInterval,
} from "@autumn/shared";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import {
	CoinsIcon,
	IncludedUsageIcon,
} from "@/components/v2/icons/AutumnIcons";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function BillingType() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	// Derive billing type from item state
	const isFeaturePrice = isFeaturePriceItem(item);

	const setBillingType = (type: "included" | "priced") => {
		const getPricedInterval = () => {
			if (
				!Object.values(BillingInterval).includes(
					item.interval as unknown as BillingInterval,
				)
			) {
				return ProductItemInterval.Month;
			}
			return item.interval;
		};

		if (type === "included") {
			// Remove tiers to switch to included
			setItem({
				...item,
				tiers: null,
				billing_units: undefined,
				usage_model: undefined,
				interval: isContUseItem({ item, features }) ? null : item.interval,
			});
		} else {
			// Add initial tier to switch to priced
			setItem({
				...item,
				tiers: [{ to: Infinite, amount: 0 }],
				billing_units: 1,
				included_usage:
					item.included_usage === Infinite ? 0 : item.included_usage || 0,
				interval: getPricedInterval(),
			});
		}
	};

	return (
		<div className="mt-3 space-y-4 billing-type-section">
			<div className="flex w-full items-center gap-4">
				<PanelButton
					isSelected={!isFeaturePrice}
					onClick={() => setBillingType("included")}
					icon={<IncludedUsageIcon size={18} color="none" />}
				/>
				<div className="flex-1">
					<div className="text-body-highlight mb-1">Included</div>
					<div className="text-body-secondary leading-tight">
						Set included usage limits with reset intervals (e.g. 100
						credits/month)
					</div>
				</div>
			</div>

			<div className="flex w-full items-center gap-4">
				<PanelButton
					isSelected={isFeaturePrice}
					onClick={() => setBillingType("priced")}
					icon={<CoinsIcon size={20} color="currentColor" />}
				/>
				<div className="flex-1">
					<div className="text-body-highlight mb-1">Priced</div>
					<div className="text-body-secondary leading-tight">
						Set usage and overage pricing (e.g. 100 credits/month, $1 extra)
					</div>
				</div>
			</div>
		</div>
	);
}
