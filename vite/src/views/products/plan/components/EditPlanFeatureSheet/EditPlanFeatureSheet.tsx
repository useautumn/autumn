import { ProductItemFeatureType } from "@autumn/shared";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { AdvancedSettings } from "./AdvancedSettings";
import { BillingType } from "./BillingType";
import { IncludedUsage } from "./IncludedUsage";
import { PricedFeatureSettings } from "./PricedFeatureSettings";
import { PriceTiers } from "./PriceTiers";
import { UsageReset } from "./UsageReset";

export function EditPlanFeatureSheet() {
	const { item } = useProductItemContext();
	const { features } = useFeaturesQuery();

	// Early return if no item
	if (!item) {
		return null;
	}

	const feature = getFeature(item?.feature_id ?? "", features);

	// Derive billing type from item state - no local state needed
	const isPricedFeature = !!(item.tiers && item.tiers.length > 0);

	return (
		<>
			<SheetHeader
				title={`Configure ${feature?.name}`}
				description="Configure how this feature is used in your app"
			/>

			{item.feature_type !== ProductItemFeatureType.Static && (
				<>
					<SheetSection title="Billing type">
						<BillingType />
					</SheetSection>

					<SheetSection title="Included usage (optional)">
						<IncludedUsage />
					</SheetSection>

					{isPricedFeature && (
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
