import { UsageModel } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function PricedFeatureSettings() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const prepaid = item.usage_model === UsageModel.Prepaid;

	return (
		<div className="mt-6">
			<AreaCheckbox
				title="Prepaid"
				description="Quantity will be chosen during checkout."
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
