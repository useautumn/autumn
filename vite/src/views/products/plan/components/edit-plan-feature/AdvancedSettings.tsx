/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
import {
	BillingInterval,
	FeatureUsageType,
	isFeaturePriceItem,
	itemToBillingInterval,
	UsageModel,
} from "@autumn/shared";
import { SheetAccordion, SheetAccordionItem } from "@autumn/ui";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	getFeatureCreditSystem,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { useHasEntityFeatureId } from "../../hooks/useHasEntityFeatureId";
import { EntityFeatureConfig } from "./advanced-settings/EntityFeatureConfig";
import { ProrationConfig } from "./advanced-settings/ProrationConfig";
import { ResetIntervalConfig } from "./advanced-settings/ResetIntervalConfig";
import { RolloverConfig } from "./advanced-settings/RolloverConfig";
import { UsageLimit } from "./advanced-settings/UsageLimit";

export function AdvancedSettings() {
	const { features } = useFeaturesQuery();
	const { item } = useProductItemContext();
	const { hasEntityFeatureId } = useHasEntityFeatureId();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });
	const isPriced = isFeaturePriceItem(item);

	// Check if there are other continuous use features (for entity feature config)
	const hasOtherContinuousFeatures = features.some(
		(f) =>
			f.config?.usage_type === FeatureUsageType.Continuous &&
			f.id !== item.feature_id,
	);

	// Determine what will show in Advanced section
	const showUsageLimits = isPriced;
	const showRollover = hasCreditSystem || usageType === FeatureUsageType.Single;
	const showEntityFeature = hasEntityFeatureId && hasOtherContinuousFeatures;
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

	// Hide Advanced section if nothing will render inside it
	const hasAnyContent =
		showUsageLimits ||
		showRollover ||
		showEntityFeature ||
		showProration ||
		showResetInterval;

	if (!hasAnyContent) return null;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem
				value="advanced"
				title="Advanced"
				// description="Additional configuration options for this feature"
			>
				<div className="space-y-6 pt-2 pb-10 [>&_.advanced-input-width]:w-xs">
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
