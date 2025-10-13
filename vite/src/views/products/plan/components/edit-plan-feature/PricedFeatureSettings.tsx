import { nullish, ProductItemInterval, UsageModel } from "@autumn/shared";
import { RadioGroup } from "@/components/v2/radio-groups/RadioGroup";
import { AreaRadioGroupItem } from "@/components/v2/radio-groups/AreaRadioGroupItem";
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
		<div className="mt-6">
			<RadioGroup
				value={item.usage_model}
				onValueChange={handleUsageModelChange}
				className="space-y-4"
			>
				<AreaRadioGroupItem
					value={UsageModel.PayPerUse}
					label="Pay-per-use"
					description="Charge based on number of units used of this feature"
				/>
				<AreaRadioGroupItem
					value={UsageModel.Prepaid}
					label="Prepaid"
					description="Specify a quantity of this feature during checkout"
				/>
			</RadioGroup>
		</div>
	);
}
