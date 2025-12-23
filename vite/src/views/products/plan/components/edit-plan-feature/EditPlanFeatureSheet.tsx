import { FeatureType } from "@autumn/shared";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	useHasItemChanges,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { getFeature } from "@/utils/product/entitlementUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { AdvancedSettings } from "./AdvancedSettings";
import { BillingType } from "./BillingType";
import { IncludedUsage } from "./IncludedUsage";
import { PricedFeatureSettings } from "./PricedFeatureSettings";
import { PriceTiers } from "./PriceTiers";
import { SheetFooterActions } from "./SheetFooterActions";
import { UsageReset } from "./UsageReset";

export function EditPlanFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const { item } = useProductItemContext();
	const { features } = useFeaturesQuery();
	const product = useProductStore((s) => s.product);
	const hasItemChanges = useHasItemChanges();

	const emptyPriceItem =
		item?.usage_model &&
		item.tiers?.length === 1 &&
		item.tiers[0].amount === 0 &&
		!item.included_usage;

	const showFooter = hasItemChanges && !emptyPriceItem;

	if (!item) {
		return null;
	}

	const feature = getFeature(item?.feature_id ?? "", features);
	const isFeaturePrice = isFeaturePriceItem(item);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Scrollable content area */}
			<div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
				{!isOnboarding && (
					<SheetHeader
						title={`Configure ${feature?.name}`}
						description={
							<p>
								Define how customers on plan{" "}
								<span className="font-medium text-t1">{product.name}</span> can
								use feature{" "}
								<span className="font-medium text-t1">{feature?.name}</span>
							</p>
						}
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
							<SheetSection title="Price" className="space-y-8">
								<div>
									<PriceTiers />
									<UsageReset showBillingLabel={true} />
								</div>
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

			{/* Footer stays at bottom */}
			{showFooter && <SheetFooterActions />}
		</div>
	);
}
