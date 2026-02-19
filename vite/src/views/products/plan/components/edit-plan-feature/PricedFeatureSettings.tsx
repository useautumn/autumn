import {
	BillingInterval,
	itemToBillingInterval,
	nullish,
	ProductItemInterval,
	TiersType,
	UsageModel,
} from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PricedFeatureSettings() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const isOneOff = itemToBillingInterval({ item }) === BillingInterval.OneOff;
	const isVolumeBased =
		item.tiers_type === TiersType.VolumeBased && (item.tiers?.length ?? 0) > 1;

	const handleUsageModelChange = (value: string) => {
		const usageModel = value as UsageModel;
		setItem({
			...item,
			usage_model: usageModel,
			interval:
				usageModel === UsageModel.PayPerUse && nullish(item.interval)
					? ProductItemInterval.Month
					: item.interval,
		});
	};

	return (
		<div>
			<FormLabel>Billing Method</FormLabel>
			<RadioGroup
				value={item.usage_model}
				onValueChange={handleUsageModelChange}
				className="space-y-0"
			>
				<AreaRadioGroupItem
					value={UsageModel.PayPerUse}
					label="Usage-based"
					description={"Bill for how much the customer uses"}
					disabledReason={
						isVolumeBased
							? "Volume-based pricing requires prepaid billing."
							: isOneOff
								? "Usage based prices must have an interval."
								: undefined
					}
				/>
				<AreaRadioGroupItem
					value={UsageModel.Prepaid}
					label="Prepaid"
					description="Purchase a fixed quantity upfront"
				/>
			</RadioGroup>
		</div>
	);
}
