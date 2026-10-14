/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
import {
	BillingInterval,
	FeatureUsageType,
	isAnyCreditSystem,
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
import { ExpiryConfig } from "./advanced-settings/ExpiryConfig";
import { FeatureOverrideConfig } from "./advanced-settings/FeatureOverrideConfig";
import { PooledBalanceConfig } from "./advanced-settings/PooledBalanceConfig";
import { ProrationConfig } from "./advanced-settings/ProrationConfig";
import { ResetIntervalConfig } from "./advanced-settings/ResetIntervalConfig";
import { RolloverConfig } from "./advanced-settings/RolloverConfig";
import { ThresholdBillingConfig } from "./advanced-settings/ThresholdBillingConfig";
import { showsThresholdBilling } from "./advanced-settings/thresholdBillingItem";
import { UsageLimit } from "./advanced-settings/UsageLimit";

export function AdvancedSettings() {
	const { features } = useFeaturesQuery();
	const { item } = useProductItemContext();
	const { product } = useProduct();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });
	const isPriced = isFeaturePriceItem(item);
	const isOneOff = itemToBillingInterval({ item }) === BillingInterval.OneOff;

	const showUsageLimits = isPriced;
	const showThresholdBilling = showsThresholdBilling({ item });
	const showRollover = hasCreditSystem || usageType === FeatureUsageType.Single;
	const showExpiry =
		isPriced && item.usage_model === UsageModel.Prepaid && isOneOff;
	const showFeatureOverride = isAnyCreditSystem(
		features.find((feature) => feature.id === item.feature_id)?.type,
	);
	const showEntityFeature =
		item.entity_feature_id != null ||
		(product?.items?.some((planItem) => planItem?.entity_feature_id != null) ??
			false);
	const showProration =
		isPriced &&
		!isOneOff &&
		(item.usage_model === UsageModel.Prepaid ||
			usageType === FeatureUsageType.Continuous);

	const showResetInterval =
		isPriced &&
		item.usage_model === UsageModel.Prepaid &&
		usageType === FeatureUsageType.Single &&
		!isOneOff;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem value="advanced" title="Advanced">
				<div className="flex flex-col gap-6 pt-2 pb-10 [>&_.advanced-input-width]:w-xs">
					<PooledBalanceConfig />

					{showUsageLimits && <UsageLimit />}

					{showThresholdBilling && <ThresholdBillingConfig />}

					{showRollover && <RolloverConfig />}

					{showExpiry && <ExpiryConfig />}

					{showFeatureOverride && <FeatureOverrideConfig />}

					{showEntityFeature && <EntityFeatureConfig />}

					{showProration && <ProrationConfig />}

					{showResetInterval && <ResetIntervalConfig />}
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
