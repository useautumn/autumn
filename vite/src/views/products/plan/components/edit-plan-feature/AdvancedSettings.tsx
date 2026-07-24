/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
import {
	BillingInterval,
	FeatureUsageType,
	isFeaturePriceItem,
	itemToBillingInterval,
	UsageModel,
} from "@autumn/shared";
import { SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	getFeatureCreditSystem,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { EntityFeatureConfig } from "./advanced-settings/EntityFeatureConfig";
import { PooledBalanceConfig } from "./advanced-settings/PooledBalanceConfig";
import { ProrationConfig } from "./advanced-settings/ProrationConfig";
import { ResetIntervalConfig } from "./advanced-settings/ResetIntervalConfig";
import { RolloverConfig } from "./advanced-settings/RolloverConfig";
import { UsageLimit } from "./advanced-settings/UsageLimit";

export function AdvancedSettings() {
	const { features } = useFeaturesQuery();
	const { item } = useProductItemContext();
	const { product } = useProduct();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });
	const isPriced = isFeaturePriceItem(item);

	const showUsageLimits = isPriced;
	const showRollover = hasCreditSystem || usageType === FeatureUsageType.Single;
	// Deprecated in favor of licenses. Surface it whenever any item in the plan
	// uses an entity feature, so all items in such plans keep working.
	const showEntityFeature =
		item.entity_feature_id != null ||
		(product?.items?.some((planItem) => planItem?.entity_feature_id != null) ??
			false);
	// Proration shows for prepaid or continuous use features (not consumable + pay-per-use)
	const showProration =
		isPriced &&
		(item.usage_model === UsageModel.Prepaid ||
			usageType === FeatureUsageType.Continuous);

	// Consumable prepaid features can reset their granted balance on a different
	// cycle to billing (continuous-use balances don't reset).
	const showResetInterval =
		isPriced &&
		item.usage_model === UsageModel.Prepaid &&
		usageType === FeatureUsageType.Single &&
		itemToBillingInterval({ item }) !== BillingInterval.OneOff;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem
				value="advanced"
				title="Advanced"
				// description="Additional configuration options for this feature"
			>
				<div className="flex flex-col gap-6 pt-2 pb-10 [>&_.advanced-input-width]:w-xs">
					<PooledBalanceConfig />

					{/* Usage Limits */}
					{showUsageLimits && <UsageLimit />}

					{/* Rollover */}
					{showRollover && <RolloverConfig />}

					{/* Entity Feature Config */}
					{showEntityFeature && <EntityFeatureConfig />}

					{/* Proration Config */}
					{showProration && <ProrationConfig />}

					{/* Reset Interval Config */}
					{showResetInterval && <ResetIntervalConfig />}
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
