/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
import { FeatureUsageType, isFeaturePriceItem } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { notNullish } from "@/utils/genUtils";
import {
	getFeatureCreditSystem,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { useHasEntityFeatureId } from "../../hooks/useHasEntityFeatureId";
import { EntityFeatureConfig } from "./advanced-settings/EntityFeatureConfig";
import { ProrationConfig } from "./advanced-settings/ProrationConfig";
import { RolloverConfig } from "./advanced-settings/RolloverConfig";
import { UsageLimit } from "./advanced-settings/UsageLimit";

export function AdvancedSettings() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();
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
	const showResetUsage = usageType === FeatureUsageType.Single;
	const showUsageLimits = isPriced;
	const showRollover = hasCreditSystem || usageType === FeatureUsageType.Single;
	const showEntityFeature = hasEntityFeatureId && hasOtherContinuousFeatures;
	// Proration shows for priced features (simplified check)
	const showProration = isPriced;

	// Hide Advanced section if nothing will render inside it
	const hasAnyContent =
		showResetUsage ||
		showUsageLimits ||
		showRollover ||
		showEntityFeature ||
		showProration;

	if (!hasAnyContent) return null;

	// Rollover logic (unused but kept for reference)
	const _showRolloverConfig =
		(hasCreditSystem || usageType === FeatureUsageType.Single) &&
		item.interval !== null &&
		item.included_usage &&
		Number(item.included_usage) > 0;

	// const defaultRollover: RolloverConfig = {
	// 	duration: RolloverExpiryDurationType.Month,
	// 	length: 1 as number,
	// 	max: null,
	// };

	// const setRolloverConfigKey = (
	// 	key: keyof RolloverConfig,
	// 	value: null | number | RolloverExpiryDurationType,
	// ) => {
	// 	setItem({
	// 		...item,
	// 		config: {
	// 			...(item.config || {}),
	// 			rollover: {
	// 				...(item.config?.rollover || defaultRollover),
	// 				[key]: value,
	// 			},
	// 		},
	// 	});
	// };

	// const setRolloverConfig = (rollover: RolloverConfig | null) => {
	// 	const newConfig = { ...(item.config || {}) };
	// 	if (rollover === null) {
	// 		delete newConfig.rollover;
	// 	} else {
	// 		newConfig.rollover = rollover;
	// 	}
	// 	setItem({
	// 		...item,
	// 		config: newConfig,
	// 	});
	// };

	// const rollover = item.config?.rollover as RolloverConfig;
	// const hasRollover = item.config?.rollover != null;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem
				value="advanced"
				title="Advanced"
				// description="Additional configuration options for this feature"
			>
				<div className="space-y-6 pt-2 pb-10 [>&_.advanced-input-width]:w-xs">
					{/* Reset existing usage when plan is enabled */}
					{usageType === FeatureUsageType.Single && (
						<AreaCheckbox
							title="Reset existing usage when plan is enabled"
							description="When coming from another plan, this will reset the customer's feature usage to 0."
							checked={!!item.reset_usage_when_enabled}
							// hide={usageType === FeatureUsageType.Continuous}
							disabled={
								usageType === FeatureUsageType.Continuous ||
								notNullish(item.config?.rollover)
							}
							onCheckedChange={(checked) =>
								setItem({
									...item,
									reset_usage_when_enabled: checked,
								})
							}
						/>
					)}

					{/* Usage Limits */}
					{
						//if feature is priced, show usage limit
						isFeaturePriceItem(item) && <UsageLimit />
					}

					{/* Rollover */}
					<RolloverConfig />

					{/* Entity Feature Config */}
					{hasEntityFeatureId && <EntityFeatureConfig />}

					{/* Proration Config */}
					<ProrationConfig />
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
