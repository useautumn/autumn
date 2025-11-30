import { nullish, ProductItemInterval, UsageModel } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PricedFeatureSettings() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

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
		<div className="mt-3">
			<FormLabel>Usage Model</FormLabel>
			<RadioGroup
				value={item.usage_model}
				onValueChange={handleUsageModelChange}
				className="space-y-0"
			>
				<AreaRadioGroupItem
					value={UsageModel.PayPerUse}
					label="Usage-based"
					description={"Bill for how much the customer has used"}
				/>
				<AreaRadioGroupItem
					value={UsageModel.Prepaid}
					label="Prepaid"
					description="Bill for a fixed upfront quantity during checkout"
				/>
			</RadioGroup>
		</div>
	);
}
