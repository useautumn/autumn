import { FeatureType } from "@autumn/shared";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { AdvancedSettings } from "./AdvancedSettings";
import { BillingType } from "./BillingType";
import { IncludedUsage } from "./IncludedUsage";
import { PricedFeatureSettings } from "./PricedFeatureSettings";
import { PriceTiers } from "./PriceTiers";
import { UsageReset } from "./UsageReset";

export function EditPlanFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const { item } = useProductItemContext();
	const { features } = useFeaturesQuery();

	if (!item) {
		return null;
	}

	const feature = getFeature(item?.feature_id ?? "", features);
	const isFeaturePrice = isFeaturePriceItem(item);

	// Check if user has explicitly chosen a billing type
	const hasChosenBillingType =
		isFeaturePrice || // Has tiers (priced)
		(item.included_usage !== undefined && item.included_usage !== null); // Has included usage set

	return (
		<div
			className={
				feature?.type === FeatureType.Boolean
					? "overflow-y-hidden min-h-full"
					: ""
			}
		>
			{!isOnboarding && (
				<SheetHeader
					title={`Configure ${feature?.name}`}
					description="How users access this feature when they're on this plan"
				/>
			)}

			{feature?.type !== FeatureType.Boolean && (
				<>
					<SheetSection title="Feature Type">
						<BillingType />
					</SheetSection>

					<SheetSection
						title={`Grant Amount ${isFeaturePrice ? "(optional)" : ""}`}
					>
						<IncludedUsage />
					</SheetSection>

					{isFeaturePrice && (
						<SheetSection title="Price">
							<PriceTiers />
							<UsageReset showBillingLabel={true} />
							<PricedFeatureSettings />
						</SheetSection>
					)}

					<AdvancedSettings />
				</>
			)}

			{feature?.type === FeatureType.Boolean && (
				<div className="p-4 flex flex-col gap-2 h-full items-center justify-center">
					<h1 className="text-sub">Nothing to do here...</h1>
					<p className="text-body-secondary max-w-[75%]">
						Boolean features are simply included in the
						<br /> product without any further configuration.
					</p>
				</div>
			)}
		</div>
	);
}
