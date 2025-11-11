import {
	FeatureUsageType,
	type RolloverConfig as RolloverConfigType,
	RolloverDuration,
} from "@autumn/shared";
import { InfinityIcon } from "@phosphor-icons/react";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	getFeatureCreditSystem,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function RolloverConfig() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });

	// Rollover logic
	const showRolloverConfig =
		hasCreditSystem || usageType === FeatureUsageType.Single;

	const defaultRollover: RolloverConfigType = {
		duration: RolloverDuration.Month,
		length: 1 as number,
		max: null,
	};

	const setRolloverConfigKey = (
		key: keyof RolloverConfigType,
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

	const setRolloverConfig = (rollover: RolloverConfigType | null) => {
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

	const rollover = item.config?.rollover as RolloverConfigType;
	const hasRollover = item.config?.rollover != null;

	return (
		<>
			{showRolloverConfig ? (
				<AreaCheckbox
					title="Rollovers"
					tooltip="Rollovers carry unused credits to the next billing cycle. Set a maximum rollover amount and specify how many cycles before resetting."
					checked={hasRollover}
					disabled={!item.interval}
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
						className="space-y-4 w-xs max-w-full"
						// onClick={(e) => e.stopPropagation()}
						// onKeyDown={(e) => e.stopPropagation()}
					>
						<div className="space-y-2 w-full">
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
									className="flex-1"
									placeholder={
										rollover?.max === null ? "Unlimited" : "e.g. 100 credits"
									}
									disabled={rollover?.max === null}
									onChange={(e) => {
										const value = e.target.value;
										const numValue = value === "" ? 0 : parseInt(value) || 0;
										setRolloverConfigKey("max", numValue);
									}}
									onClick={(e) => e.stopPropagation()}
								/>
								<IconCheckbox
									icon={<InfinityIcon />}
									iconOrientation="center"
									variant="muted"
									size="default"
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
										value={rollover?.length === 0 ? "" : rollover?.length || ""}
										onChange={(e) => {
											const value = e.target.value;
											const numValue = value === "" ? 0 : parseInt(value) || 0;
											setRolloverConfigKey("length", numValue);
										}}
										className="w-16"
										placeholder="e.g. 1 month"
										onClick={(e) => e.stopPropagation()}
									/>
								)}
								<Select
									value={rollover?.duration}
									onValueChange={(value) => {
										setRolloverConfigKey("duration", value as RolloverDuration);
									}}
								>
									<SelectTrigger
										className="flex-1"
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
			) : null}
		</>
	);
}
