import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useAttachProductStore } from "@/hooks/stores/useSubscriptionStore";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface PrepaidOptionsFieldProps {
	form: UseAttachProductForm;
}

export function AttachProductPrepaidOptions({
	form,
}: PrepaidOptionsFieldProps) {
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);
	const { products = [] } = useProductsQuery();
	const selectedProductId = form.state.values.productId;

	// Use customizedProduct if available, otherwise find from products by productId
	const product =
		customizedProduct ??
		products.find((p) => p.id === selectedProductId && !p.archived);

	const prepaidItems = usePrepaidItems({ product });

	if (prepaidItems.length === 0 || !selectedProductId) {
		return null;
	}

	return (
		<div className="space-y-3">
			<div className="text-sm font-semibold text-foreground">
				Prepaid Quantities
			</div>

			<div className="space-y-2">
				{prepaidItems.map((item) => {
					return (
						<div
							key={item.feature_id}
							className="grid grid-cols-[1fr_auto] gap-2 items-center"
						>
							<div className="text-sm text-foreground">
								{item.display?.primary_text}
							</div>

							<form.AppField name={`prepaidOptions.${item.feature_id}`}>
								{(quantityField) => (
									<quantityField.QuantityField
										label=""
										placeholder="0"
										min={0}
										hideFieldInfo={true}
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
