import { type ProductItem, ProductItemFeatureType } from "@autumn/shared";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { BillingType } from "./BillingType";
import { ExtraSettings } from "./ExtraSettings";
import { IncludedUsage } from "./IncludedUsage";
import { PriceTiers } from "./PriceTiers";

export function EditPlanFeatureSheet() {
	const {
		item,
	}: {
		item: ProductItem;
	} = useProductItemContext();
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
					<SheetSection title="Billing Type">
						<BillingType />
					</SheetSection>

					<SheetSection title="Included usage (optional)">
						<IncludedUsage />
					</SheetSection>

					{isPricedFeature && (
						<SheetSection title="Price">
							<PriceTiers />
							<ExtraSettings />
						</SheetSection>
					)}
				</>
			)}
		</>
	);
}
