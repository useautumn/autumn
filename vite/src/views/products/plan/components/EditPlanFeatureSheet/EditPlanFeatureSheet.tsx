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

	return (
		<>
			{!isOnboarding && (
				<SheetHeader
					title={`Configure ${feature?.name}`}
					description="Configure how this feature is used in your app"
				/>
			)}

			{feature?.type !== FeatureType.Boolean && (
				<>
					<SheetSection title="Billing Type">
						<BillingType />
					</SheetSection>

					<SheetSection title="Included usage (optional)">
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
		</>
	);
}
