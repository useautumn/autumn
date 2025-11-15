import { UsageModel } from "@autumn/shared";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Input } from "@/components/v2/inputs/Input";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import type {
	PrepaidOption,
	ProductFormItem,
} from "./attach-product-form-schema";

interface PrepaidOptionsFieldProps {
	field: AnyFieldApi;
}

export function AttachProductPrepaidOptions({
	field,
}: PrepaidOptionsFieldProps) {
	const { products } = useProductsQuery();

	const activeProducts = products.filter((p) => !p.archived);
	const selectedProducts = field.form.state.values
		.products as ProductFormItem[];

	const prepaidFeatures = selectedProducts
		.filter((item: { productId: string }) => item.productId)
		.flatMap((item: { productId: string }) => {
			const product = activeProducts.find((p) => p.id === item.productId);
			if (!product) return [];

			const prepaidItems =
				product.items?.filter(
					(productItem) =>
						productItem.usage_model === UsageModel.Prepaid &&
						productItem.feature_id,
				) || [];

			return prepaidItems.map((productItem) => ({
				product_name: product.name,
				feature_id: productItem.feature_id as string,
				feature_type: productItem.feature_type,
				price: productItem.price || 0,
				billing_units: productItem.billing_units || 1,
				tiers: productItem.tiers,
			}));
		});

	const getFeatureQuantity = (featureId: string): number => {
		const option = field.state.value.find(
			(opt: PrepaidOption) => opt.feature_id === featureId,
		);
		return option?.quantity || 0;
	};

	const updateFeatureQuantity = ({
		featureId,
		quantity,
	}: {
		featureId: string;
		quantity: number;
	}) => {
		const currentOptions = field.state.value;
		const existingIndex = currentOptions.findIndex(
			(opt: PrepaidOption) => opt.feature_id === featureId,
		);

		if (existingIndex !== -1) {
			const updatedOptions = currentOptions.map(
				(opt: PrepaidOption, idx: number) =>
					idx === existingIndex ? { ...opt, quantity } : opt,
			);
			field.handleChange(updatedOptions);
		} else {
			field.handleChange([
				...currentOptions,
				{ feature_id: featureId, quantity },
			]);
		}
	};

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

				{prepaidFeatures.map(
					(feature: {
						feature_id: string;
						product_name: string;
						billing_units: number;
					}) => {
						const quantity = getFeatureQuantity(feature.feature_id);
						const displayQuantity = quantity / feature.billing_units;

						return (
							<div
								key={feature.feature_id}
								className="grid grid-cols-[1fr_auto] gap-2 items-center"
							>
								<div className="text-sm text-foreground">
									{feature.product_name}
								</div>

								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() =>
											updateFeatureQuantity({
												featureId: feature.feature_id,
												quantity: Math.max(0, quantity - feature.billing_units),
											})
										}
										className="flex h-input w-8 items-center justify-center rounded-md border border-border bg-background text-sm hover:bg-accent"
										aria-label="Decrease quantity"
									>
										−
									</button>

									<Input
										variant="headless"
										type="number"
										value={displayQuantity || ""}
										onChange={(e) => {
											const value = Number.parseInt(e.target.value) || 0;
											updateFeatureQuantity({
												featureId: feature.feature_id,
												quantity: value * feature.billing_units,
											});
										}}
										className="h-input w-16 text-center text-sm"
										min={0}
										aria-label={`Quantity for ${feature.product_name}`}
									/>

									<button
										type="button"
										onClick={() =>
											updateFeatureQuantity({
												featureId: feature.feature_id,
												quantity: quantity + feature.billing_units,
											})
										}
										className="flex h-input w-8 items-center justify-center rounded-md border border-border bg-background text-sm hover:bg-accent"
										aria-label="Increase quantity"
									>
										+
									</button>
								</div>
							</div>
						);
					},
				)}
			</div>
		</div>
	);
}
