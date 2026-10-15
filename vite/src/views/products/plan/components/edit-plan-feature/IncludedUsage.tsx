import {
	BillingInterval,
	billingToItemInterval,
	EntInterval,
	entToItemInterval,
	getFeatureName,
	Infinite,
	isContUseItem,
} from "@autumn/shared";
import { IconCheckbox, Input } from "@autumn/ui";
import { InfinityIcon } from "@phosphor-icons/react";
import { useFormattedNumberInput } from "@/hooks/common/useFormattedNumberInput";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { UsageReset } from "./UsageReset";

export function IncludedUsage() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	const includedUsage = item?.included_usage;
	const includedUsageText =
		typeof includedUsage === "number" ? includedUsage.toString() : "";

	const includedUsageInputProps = useFormattedNumberInput({
		value: includedUsageText,
		onValueChange: (raw) => {
			if (!item) return;
			if (raw === "") {
				setItem({ ...item, included_usage: null });
				return;
			}
			const numValue = Number(raw);
			if (!Number.isNaN(numValue)) {
				setItem({ ...item, included_usage: numValue });
			}
		},
	});

	if (!item) return null;

	const isFeaturePrice = isFeaturePriceItem(item);
	const feature = features.find((f) => f.id === item.feature_id);

	return (
		<div className="space-y-4">
			<div className="w-full h-auto flex items-end gap-2">
				<div className="flex-1">
					<div className="text-tertiary-foreground text-sm block mb-2">
						Quantity of&nbsp;
						<span className="font-medium text-foreground">
							{getFeatureName({ feature, plural: true })}
						</span>
						{isFeaturePrice ? " granted before billing" : " that can be used"}
					</div>
					<div className="flex items-center gap-2">
						<Input
							key={`included-usage-${item.feature_id || item.price_id || "default"}`}
							{...includedUsageInputProps}
							placeholder="eg, 100"
							disabled={includedUsage === Infinite}
						/>
						<IconCheckbox
							hide={isFeaturePrice}
							icon={<InfinityIcon />}
							iconOrientation="left"
							variant="muted"
							size="default"
							checked={includedUsage === Infinite}
							onCheckedChange={(checked) => {
								if (checked) {
									// Unlimited defaults to one-off; the reset can still be set
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
