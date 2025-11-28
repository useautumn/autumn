import { FormWrapper } from "@/components/general/form/form-wrapper";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { AttachProductActions } from "./attach-product-actions";
import { AttachProductFormProvider } from "./attach-product-form-context";
import { AttachProductPrepaidOptions } from "./attach-product-prepaid-options";
import { AttachProductSelection } from "./attach-product-selection";
import { AttachProductSummary } from "./attach-product-summary";
import { useAttachProductForm } from "./use-attach-product-form";

export function AttachProductForm({
	customerId,
	onSuccess,
}: {
	customerId: string;
	onSuccess?: () => void;
}) {
	const itemId = useSheetStore((s) => s.itemId);
	const form = useAttachProductForm({
		initialProductId: itemId || undefined,
		initialCustomerId: customerId || undefined,
	});
	const { products, isLoading } = useProductsQuery();

	if (isLoading) {
		return <div className="text-sm text-t3">Loading products...</div>;
	}

	return (
		<AttachProductFormProvider form={form}>
			<FormWrapper form={form}>
				<AttachProductSelection />

				<AttachProductPrepaidOptions />

				<AttachProductSummary products={products} />

				<AttachProductActions onSuccess={onSuccess} />
			</FormWrapper>
		</AttachProductFormProvider>
	);
}
