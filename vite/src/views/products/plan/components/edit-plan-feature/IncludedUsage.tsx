import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import {
	InputGroup,
	InputGroupInput,
	InputGroupText,
} from "@/components/v2/inputs/InputGroup";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	BillingInterval,
	billingToItemInterval,
	EntInterval,
	entToItemInterval,
	getFeatureName,
	Infinite,
	isAiCreditSystem,
	isContUseItem,
} from "@autumn/shared";
import { InfinityIcon } from "@phosphor-icons/react";
import { UsageReset } from "./UsageReset";

export function IncludedUsage() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const includedUsage = item.included_usage;

	const isFeaturePrice = isFeaturePriceItem(item);
	const feature = features.find((f) => f.id === item.feature_id);

	// Helper function to get the display value for the input
	const getInputValue = () => {
		if (includedUsage === Infinite) {
			return "Unlimited";
		}
		if (includedUsage === null || includedUsage === undefined) {
			return "";
		}
		return includedUsage.toString();
	};

	return (
		<div className="space-y-4">
			<div className="w-full h-auto flex items-end gap-2">
				<div className="flex-1">
					<div className="text-tertiary-foreground text-sm block mb-2">
						{isAiCreditSystem(feature?.type)
							? `USD budget ${isFeaturePrice ? "granted before billing" : "allocated to this plan"}`
							: <>Quantity of&nbsp;<span className="font-medium text-foreground">{getFeatureName({ feature, plural: true })}</span>{isFeaturePrice ? " granted before billing" : " that can be used"}</>
						}
					</div>
					<div className="flex items-center gap-2">
					{isAiCreditSystem(feature?.type) ? (
						<InputGroup data-disabled={includedUsage === Infinite}>
								<InputGroupText>$</InputGroupText>
								<InputGroupInput
									key={`included-usage-${item.feature_id || item.price_id || "default"}`}
									placeholder="eg. 10.00"
									value={getInputValue()}
									onChange={(e) => {
										const value = e.target.value.trim();

										if (value === "") {
											setItem({ ...item, included_usage: null });
										} else {
											const numValue = Number(value);
											if (!Number.isNaN(numValue)) {
												setItem({ ...item, included_usage: numValue });
											}
										}
									}}
									disabled={includedUsage === Infinite}
									type="number"
								/>
							</InputGroup>
						) : (
							<Input
								key={`included-usage-${item.feature_id || item.price_id || "default"}`}
								placeholder="eg, 100"
								value={getInputValue()}
								onChange={(e) => {
									const value = e.target.value.trim();

									if (value === "") {
										setItem({ ...item, included_usage: null });
									} else {
										const numValue = Number(value);
										if (!Number.isNaN(numValue)) {
											setItem({ ...item, included_usage: numValue });
										}
									}
								}}
								disabled={includedUsage === Infinite}
								type="number"
							/>
						)}
						<IconCheckbox
							hide={isFeaturePrice}
							icon={<InfinityIcon />}
							iconOrientation="left"
							variant="muted"
							size="default"
							checked={includedUsage === Infinite}
							onCheckedChange={(checked) => {
								if (checked) {
									// Set to unlimited
									setItem({
										...item,
										included_usage: Infinite,
										interval: null,
									});
								} else {
									// Uncheck unlimited - set to default monthly interval
									const defaultInterval = isFeaturePrice
										? billingToItemInterval({
												billingInterval: BillingInterval.Month,
											})
										: entToItemInterval({
												entInterval: EntInterval.Month,
											});
									setItem({
										...item,
										included_usage: 1,
										interval:
											item.interval === null ? defaultInterval : item.interval,
									});
								}
							}}
							className="py-1 w-26 text-subtle gap-2"
						>
							Unlimited
						</IconCheckbox>
					</div>
				</div>
			</div>

			{/* Only show Usage Reset dropdown for included billing type */}
			{!isFeaturePrice && !isContUseItem({ item, features }) && <UsageReset />}
		</div>
	);
}
