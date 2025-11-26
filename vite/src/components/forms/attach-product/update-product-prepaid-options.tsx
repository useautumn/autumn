import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import {
	useAttachProductStore,
	useSubscriptionById,
} from "@/hooks/stores/useSubscriptionStore";
import type { UseAttachProductForm } from "./use-attach-product-form";

export function UpdateProductPrepaidOptions({
	form,
}: {
	form: UseAttachProductForm;
}) {
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);
	const itemId = useSheetStore((s) => s.itemId);

	const { productV2: product } = useSubscriptionById({ itemId });

	const prepaidItems = usePrepaidItems({
		product: product ?? customizedProduct ?? undefined,
	});

	if (prepaidItems.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			<div className="text-sm font-semibold text-foreground">
				Prepaid Quantities
			</div>

			<div className="space-y-2">
				{prepaidItems.map((item) => (
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
				))}
			</div>
		</div>
	);
}
