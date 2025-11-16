import { FormWrapper } from "@/components/general/form/form-wrapper";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { AttachProductActions } from "./attach-product-actions";
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
	const form = useAttachProductForm();
	const { products, isLoading } = useProductsQuery();

	const activeProducts = products.filter((p) => !p.archived);

	if (isLoading) {
		return <div className="text-sm text-t3">Loading products...</div>;
	}

	return (
		<FormWrapper form={form}>
			<form.AppField name="products" mode="array">
				{(field) => <AttachProductSelection field={field} form={form} />}
			</form.AppField>

			<AttachProductPrepaidOptions form={form} />

			<form.Subscribe selector={(state) => state.values.products}>
				{(products) => (
					<AttachProductSummary
						selectedProducts={products}
						products={activeProducts}
					/>
				)}
			</form.Subscribe>

			<AttachProductActions
				form={form}
				customerId={customerId}
				onSuccess={onSuccess}
			/>
		</FormWrapper>
	);
}
