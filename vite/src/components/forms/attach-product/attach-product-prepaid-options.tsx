import {
	type FrontendProductItem,
	getFeaturePriceItemDisplay,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	usePrepaidItems,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface PrepaidOptionsFieldProps {
	form: UseAttachProductForm;
}

export function AttachProductPrepaidOptions({
	form,
}: PrepaidOptionsFieldProps) {
	const storeProduct = useProductStore((s) => s.product);
	const { products = [] } = useProductsQuery();
	const selectedProductId = useStore(
		form.store,
		(state) => state.values.productId,
	);
	const { org } = useOrg();
	const product = storeProduct?.id
		? storeProduct
		: products.find((p) => p.id === selectedProductId && !p.archived);

	const { prepaidItems } = usePrepaidItems({ product });

	if (prepaidItems.length === 0 || !selectedProductId) {
		return null;
	}

	return (
		<div className="space-y-3 my-4">
			<div className="space-y-2">
				{prepaidItems.map((item) => {
					const display = getFeaturePriceItemDisplay({
						item: item as FrontendProductItem,
						feature: item.feature,
						currency: org?.default_currency || "USD",
						fullDisplay: true,
						amountFormatOptions: {
							currencyDisplay: "narrowSymbol",
						},
					});
					return (
						<div
							key={item.feature_id}
							className="grid grid-cols-[1fr_auto] gap-2 items-center"
						>
							<span className="text-sm text-foreground truncate">
								{display.primary_text}
								{display.secondary_text && ` ${display.secondary_text}`}
							</span>

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
