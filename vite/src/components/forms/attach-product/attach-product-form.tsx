import type { ProductV2 } from "@autumn/shared";
import { useEffect } from "react";
import { FormWrapper } from "@/components/general/form/form-wrapper";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAttachProductStore } from "@/hooks/stores/useAttachProductStore";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { AttachProductActions } from "./attach-product-actions";
import { AttachProductPrepaidOptions } from "./attach-product-prepaid-options";
import { AttachProductSelection } from "./attach-product-selection";
import { AttachProductSummary } from "./attach-product-summary";
import { useAttachPreview } from "./use-attach-preview";
import type { UseAttachProductForm } from "./use-attach-product-form";
import { useAttachProductForm } from "./use-attach-product-form";

interface FormContentProps {
	productId: string;
	products: ProductV2[];
	customerId: string;
	form: UseAttachProductForm;
	onSuccess?: () => void;
}

function FormContent({
	productId,
	products,
	customerId,
	form,
	onSuccess,
}: FormContentProps) {
	const { isLoading: isPreviewLoading } = useAttachPreview();

	return (
		<>
			<AttachProductSummary
				productId={productId}
				products={products}
				customerId={customerId}
			/>

			<AttachProductActions
				form={form}
				customerId={customerId}
				onSuccess={onSuccess}
				isPreviewLoading={isPreviewLoading}
			/>
		</>
	);
}

export function AttachProductForm({
	customerId,
	onSuccess,
}: {
	customerId: string;
	onSuccess?: () => void;
}) {
	const itemId = useSheetStore((s) => s.itemId); // The productId being customized
	const form = useAttachProductForm({ initialProductId: itemId || undefined });
	const { products, isLoading } = useProductsQuery();
	const resetProductStore = useProductStore((s) => s.reset);

	// Get store setters
	const setFormValues = useAttachProductStore((s) => s.setFormValues);
	const setCustomerId = useAttachProductStore((s) => s.setCustomerId);

	const activeProducts = products.filter((p) => !p.archived);

	// Set customerId in store when component mounts
	useEffect(() => {
		setCustomerId(customerId);
	}, [customerId, setCustomerId]);

	// Sync form values to store whenever they change
	useEffect(() => {
		const subscription = form.store.subscribe(() => {
			const values = form.store.state.values;
			const productId = values.productId;

			// Sync to store
			setFormValues({
				productId: values.productId,
				prepaidOptions: values.prepaidOptions || {},
				customerId,
			});

			// Reset product store when productId changes (unless it matches itemId from customization)
			if (productId && productId !== itemId) {
				resetProductStore();
			}
		});

		return () => subscription();
	}, [form.store, itemId, resetProductStore, setFormValues, customerId]);

	if (isLoading) {
		return <div className="text-sm text-t3">Loading products...</div>;
	}

	return (
		<FormWrapper form={form}>
			<AttachProductSelection form={form} customerId={customerId} />

			<AttachProductPrepaidOptions form={form} />

			<form.Subscribe
				selector={(state) => ({
					productId: state.values.productId,
				})}
			>
				{(values) => (
					<FormContent
						productId={values.productId}
						products={activeProducts}
						customerId={customerId}
						form={form}
						onSuccess={onSuccess}
					/>
				)}
			</form.Subscribe>
		</FormWrapper>
	);
}
