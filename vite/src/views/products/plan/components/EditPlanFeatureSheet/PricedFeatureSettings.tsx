import { UsageModel } from "@autumn/shared";
import { LongCheckbox } from "@/components/v2/checkboxes/LongCheckbox";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PricedFeatureSettings() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const prepaid = item.usage_model === UsageModel.Prepaid;
	
	return (
		<div className="mt-6">
			<LongCheckbox
				title="Prepaid"
				subtitle="Quantity will be chosen during checkout."
				checked={prepaid}
				onCheckedChange={(checked) => {
					const newUsageModel = checked
						? UsageModel.Prepaid
						: UsageModel.PayPerUse;
					setItem({ ...item, usage_model: newUsageModel });
				}}
			/>
		</div>
	);
}
