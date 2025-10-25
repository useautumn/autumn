import {
	BillingInterval,
	FeatureUsageType,
	getFeatureName,
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

	// Determine if we should preselect based on explicit configuration
	const hasExplicitConfig =
		isFeaturePrice || // Has tiers, so it's priced
		(item.included_usage !== undefined && item.included_usage !== null) || // Has explicit included usage
		item.usage_model !== undefined; // Has explicit usage model

	const shouldPreselect = hasExplicitConfig;

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
			// Only switch if not already included
			if (isFeaturePrice) {
				// Remove tiers to switch to included
				setItem({
					...item,
					tiers: null,
					billing_units: undefined,
					usage_model: undefined,
					interval: isContUseItem({ item, features }) ? null : item.interval,
				});
			}
		} else {
			// Only switch if not already priced
			if (!isFeaturePrice) {
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
		}
	};

	const feature = features.find((f) => f.id === item.feature_id);
	const featureName =
		getFeatureName({
			feature,
			plural: true,
		}) || "credits";
	const singleFeatureName =
		getFeatureName({
			feature,
			plural: false,
		}) || "credit";

	const usageType =
		feature?.config?.usage_type ||
		undefined; /* could be FeatureUsageType.Single or FeatureUsageType.Continuous */

	const isConsumable = usageType === FeatureUsageType.Single;
	const isAllocated = usageType === FeatureUsageType.Continuous;

	return (
		<div className="mt-3 space-y-4 billing-type-section">
			<div className="flex w-full items-center gap-4">
				<PanelButton
					isSelected={shouldPreselect && !isFeaturePrice}
					onClick={() => setBillingType("included")}
					icon={<IncludedUsageIcon size={18} color="currentColor" />}
				/>
				<div className="flex-1">
					<div className="text-body-highlight mb-1">Included</div>
					<div className="text-body-secondary leading-tight">
						{isConsumable
							? `Set a usage limit and reset interval for this feature (e.g. 100 ${featureName} per month).`
							: isAllocated
								? `Set a usage limit for this feature (e.g. 5 ${featureName}).`
								: "Set a usage limit for this feature."}
					</div>
				</div>
			</div>

			<div className="flex w-full items-center gap-4">
				<PanelButton
					isSelected={shouldPreselect && isFeaturePrice}
					onClick={() => setBillingType("priced")}
					icon={<CoinsIcon size={20} color="currentColor" />}
				/>
				<div className="flex-1">
					<div className="text-body-highlight mb-1">Priced</div>
					<div className="text-body-secondary leading-tight">
						{isConsumable
							? `Charge a price based on the usage or overage of this feature (e.g. $0.05 per ${singleFeatureName}).`
							: isAllocated
								? `Charge a price based on usage of this feature (e.g. $10 per ${singleFeatureName}).`
								: "Charge a price based on usage of this feature."}
					</div>
				</div>
			</div>
		</div>
	);
}
