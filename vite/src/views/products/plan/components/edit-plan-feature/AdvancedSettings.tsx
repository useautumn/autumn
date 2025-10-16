/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
import { FeatureUsageType } from "@autumn/shared";
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

	// Rollover logic
	const _showRolloverConfig =
		(hasCreditSystem || usageType === FeatureUsageType.Single) &&
		item.interval !== null &&
		item.included_usage &&
		Number(item.included_usage) > 0;

	// const defaultRollover: RolloverConfig = {
	// 	duration: RolloverDuration.Month,
	// 	length: 1 as number,
	// 	max: null,
	// };

	// const setRolloverConfigKey = (
	// 	key: keyof RolloverConfig,
	// 	value: null | number | RolloverDuration,
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
				title="Advanced settings"
				description="Additional configuration options for this feature"
			>
				<div className="space-y-6 pt-2 pb-10 [>&_.advanced-input-width]:w-xs">
					{/* Reset existing usage when product is enabled */}
					<AreaCheckbox
						title="Reset existing usage when product is enabled"
						description="When coming from another product, this will reset the customer's feature usage to 0."
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

					{/* Usage Limits */}
					<UsageLimit />

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
