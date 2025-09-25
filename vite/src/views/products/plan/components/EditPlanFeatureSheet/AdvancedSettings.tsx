/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
import {
	FeatureUsageType,
	type RolloverConfig,
	RolloverDuration,
} from "@autumn/shared";
import { InfinityIcon } from "@phosphor-icons/react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
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

export function AdvancedSettings() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });

	// Usage Limits logic
	const hasUsageLimit = item.usage_limit != null;

	// Rollover logic
	const showRolloverConfig =
		(hasCreditSystem || usageType === FeatureUsageType.Single) &&
		item.interval !== null &&
		item.included_usage &&
		Number(item.included_usage) > 0;

	const defaultRollover: RolloverConfig = {
		duration: RolloverDuration.Month,
		length: 1 as number,
		max: null,
	};

	const setRolloverConfigKey = (
		key: keyof RolloverConfig,
		value: null | number | RolloverDuration,
	) => {
		setItem({
			...item,
			config: {
				...(item.config || {}),
				rollover: {
					...(item.config?.rollover || defaultRollover),
					[key]: value,
				},
			},
		});
	};

	const setRolloverConfig = (rollover: RolloverConfig | null) => {
		const newConfig = { ...(item.config || {}) };
		if (rollover === null) {
			delete newConfig.rollover;
		} else {
			newConfig.rollover = rollover;
		}
		setItem({
			...item,
			config: newConfig,
		});
	};

	const rollover = item.config?.rollover as RolloverConfig;
	const hasRollover = item.config?.rollover != null;

	return (
		<SheetAccordion type="single" withSeparator={false} collapsible={true}>
			<SheetAccordionItem
				value="advanced"
				title="Advanced settings"
				description="Additional configuration options for this feature"
			>
				<div className="space-y-6 pt-2">
					<AreaCheckbox
						title="Reset existing usage when product is enabled"
						tooltip="A customer has used 20/100 credits on a free plan. Then they upgrade to a Pro plan with 500 credits. If this flag is enabled, they'll get 500 credits on upgrade. If false, they'll have 480."
						checked={!!item.reset_usage_when_enabled}
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
					<AreaCheckbox
						title="Usage limits"
						tooltip="Set maximum usage limits for this feature to prevent overages"
						checked={hasUsageLimit}
						onCheckedChange={(checked) => {
							let usage_limit: number | null;
							if (checked) {
								usage_limit = 100; // Default value
							} else {
								usage_limit = null;
							}
							setItem({
								...item,
								usage_limit: usage_limit,
							});
						}}
					>
						<div
							className="space-y-2"
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							<Input
								type="number"
								value={item.usage_limit || ""}
								className="w-32"
								onChange={(e) => {
									const value = e.target.value;
									const numValue =
										value === "" ? null : parseInt(value) || null;
									setItem({
										...item,
										usage_limit: numValue,
									});
								}}
								placeholder="e.g. 100"
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
					</AreaCheckbox>

					{/* Rollover */}
					{showRolloverConfig && (
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
											value={rollover?.max === null ? "" : rollover?.max}
											className="w-32"
											placeholder="Unlimited"
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
												value={rollover?.length || ""}
												onChange={(e) => {
													const value = e.target.value;
													const numValue =
														value === "" ? 1 : parseInt(value) || 1;
													setRolloverConfigKey("length", numValue);
												}}
												className="w-20"
												placeholder="1"
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
					)}
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
}
