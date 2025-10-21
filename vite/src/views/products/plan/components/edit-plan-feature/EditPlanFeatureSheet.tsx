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
					description="Configure how this feature is used in your app"
				/>
			)}

			{feature?.type !== FeatureType.Boolean && (
				<>
					<SheetSection title="Configuration">
						<BillingType />
					</SheetSection>

					<SheetSection
						title={`Allowance ${isFeaturePrice ? "(optional)" : ""}`}
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
				<div className="p-4 flex flex-col gap-2 min-h-full items-center justify-center overflow-y-hidden">
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
