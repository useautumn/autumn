import { UsageModel } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAttachProductFormContext } from "./attach-product-form-context";

export function AttachProductPrepaidOptions() {
	const form = useAttachProductFormContext();
	const { products } = useProductsQuery();
	const { productId } = useStore(form.store, (state) => state.values);

	const activeProducts = products.filter((p) => !p.archived);

	const product = activeProducts.find((p) => p.id === productId);

	const prepaidFeatures = product
		? (
				product.items?.filter(
					(productItem) =>
						productItem.usage_model === UsageModel.Prepaid &&
						productItem.feature_id,
				) || []
			).map((productItem) => ({
				product_name: product.name,
				feature_id: productItem.feature_id as string,
				feature_type: productItem.feature_type,
				price: productItem.price || 0,
				billing_units: productItem.billing_units || 1,
				tiers: productItem.tiers,
			}))
		: [];

	if (prepaidFeatures.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			<div className="text-sm font-semibold text-foreground">
				Select Prepaid Quantity
			</div>
			<p className="text-sm text-t2">
				Select the quantity for prepaid features added by attached plans
			</p>

			<div className="space-y-2">
				<div className="grid grid-cols-[1fr_auto] gap-2">
					<div className="text-xs font-medium text-t3">Feature</div>
					<div className="text-xs font-medium text-t3">Quantity</div>
				</div>

				{prepaidFeatures.map((feature) => {
					return (
						<div
							key={feature.feature_id}
							className="grid grid-cols-[1fr_auto] gap-2 items-center"
						>
							<div className="text-sm text-foreground">
								{feature.product_name}
							</div>

							<form.AppField name={`prepaidOptions.${feature.feature_id}`}>
								{(quantityField) => (
									<quantityField.QuantityField
										label=""
										placeholder="0"
										min={0}
									/>
								)}
							</form.AppField>
						</div>
					);
				})}
			</div>
		</div>
	);
}
