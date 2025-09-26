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
import { RolloverConfig } from "./advanced-settings/RolloverConfig";
import { UsageLimit } from "./advanced-settings/UsageLimit";

export function AdvancedSettings() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });

	// Rollover logic
	const showRolloverConfig =
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
				<div className="space-y-6 pt-2 pb-10">
					{/* Reset existing usage when product is enabled */}
					<AreaCheckbox
						title="Reset existing usage when product is enabled"
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

					{/* Usage Limits */}
					<UsageLimit />

					{/* Rollover */}
					<RolloverConfig />
					{/* {showRolloverConfig && (
						<AreaCheckbox
							title="Rollovers"
							tooltip="Rollovers carry unused credits to the next billing cycle. Set a maximum rollover amount and specify how many cycles before resetting."
							checked={hasRollover}
							onCheckedChange={(checked) => {
								if (checked) {
									setItem({
										...item,
										reset_usage_when_enabled: true,
										config: {
											...(item.config || {}),
											rollover: defaultRollover,
										},
									});
								} else {
									setRolloverConfig(null);
								}
							}}
						>
							<div
								className="space-y-4"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<div className="space-y-2">
									<FormLabel>Maximum rollover amount</FormLabel>
									<div className="flex items-center gap-2">
										<Input
											type="number"
											value={
												rollover?.max === null
													? ""
													: rollover?.max === 0
														? ""
														: rollover?.max
											}
											className="w-32"
											placeholder={
												rollover?.max === null
													? "Unlimited"
													: "e.g. 100 credits"
											}
											disabled={rollover?.max === null}
											onChange={(e) => {
												const value = e.target.value;
												const numValue =
													value === "" ? 0 : parseInt(value) || 0;
												setRolloverConfigKey("max", numValue);
											}}
											onClick={(e) => e.stopPropagation()}
										/>
										<IconCheckbox
											icon={<InfinityIcon />}
											iconOrientation="center"
											variant="muted"
											checked={rollover?.max === null}
											onCheckedChange={(checked) =>
												setRolloverConfigKey("max", checked ? null : 0)
											}
										/>
									</div>
								</div>

								<div className="space-y-2">
									<FormLabel>Rollover duration</FormLabel>
									<div className="flex items-center gap-2">
										{rollover?.duration === RolloverDuration.Month && (
											<Input
												type="number"
												value={
													rollover?.length === 0 ? "" : rollover?.length || ""
												}
												onChange={(e) => {
													const value = e.target.value;
													const numValue =
														value === "" ? 0 : parseInt(value) || 0;
													setRolloverConfigKey("length", numValue);
												}}
												className="w-32"
												placeholder="e.g. 1 month"
												onClick={(e) => e.stopPropagation()}
											/>
										)}
										<Select
											value={rollover?.duration}
											onValueChange={(value) => {
												setRolloverConfigKey(
													"duration",
													value as RolloverDuration,
												);
											}}
										>
											<SelectTrigger
												className="w-32"
												onClick={(e) => e.stopPropagation()}
											>
												<SelectValue placeholder="Select duration" />
											</SelectTrigger>
											<SelectContent>
												{Object.values(RolloverDuration).map((duration) => (
													<SelectItem key={duration} value={duration}>
														{duration}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							</div>
						</AreaCheckbox>
					)} */}
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
