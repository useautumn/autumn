import {
	type FrontendProductItem,
	getFeaturePriceItemDisplay,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import {
	usePrepaidItems,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import type { UseAttachProductForm } from "./use-attach-product-form";

export function UpdateProductPrepaidOptions({
	form,
}: {
	form: UseAttachProductForm;
}) {
	const storeProduct = useProductStore((s) => s.product);
	const itemId = useSheetStore((s) => s.itemId);

	const { org } = useOrg();
	const { productV2 } = useSubscriptionById({ itemId });

	// Use store product if it has a real ID, otherwise use productV2 from subscription
	const product = storeProduct?.id ? storeProduct : (productV2 ?? undefined);

	const { prepaidItems } = usePrepaidItems({ product });

	if (prepaidItems.length === 0) {
		return null;
	}

	console.log("prepaidItems", prepaidItems);

	return (
		<div className="space-y-3 p-4 pb-0">
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
										step={item.billing_units ?? 1}
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
