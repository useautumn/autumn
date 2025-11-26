import type { Entity, FullCustomer, ProductV2 } from "@autumn/shared";
import { useEffect } from "react";
import { FormWrapper } from "@/components/general/form/form-wrapper";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	usePrepaidItems,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import {
	useAttachProductStore,
	useEntity,
} from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
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
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);

	// Use customizedProduct if available, otherwise find from products by productId
	const product =
		customizedProduct ??
		products.find((p) => p.id === productId && !p.archived);

	const prepaidItems = usePrepaidItems({ product });
	const prepaidOptions = useAttachProductStore((s) => s.prepaidOptions);

	//get is loading from useAttachPreview
	const { isLoading } = useAttachPreview();

	// Check if there are prepaid items and if any are not set (undefined/null)
	// Note: 0 is a valid quantity value
	if (prepaidItems.length > 0) {
		const hasUnsetPrepaidQuantity = prepaidItems.some((item) => {
			const quantity = prepaidOptions[item.feature_id as string];
			return quantity === undefined || quantity === null;
		});

		if (hasUnsetPrepaidQuantity) {
			return null;
		}
	}

	if (!form.state.values.productId) {
		return null;
	}

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
	const form = useAttachProductForm({ initialProductId: itemId || undefined }); //load from cusplaneditorbar if its being customized
	const { products, isLoading } = useProductsQuery();
	const resetProductStore = useProductStore((s) => s.reset);

	// Get store setters
	const setFormValues = useAttachProductStore((s) => s.setFormValues);
	const setCustomerId = useAttachProductStore((s) => s.setCustomerId);

	const activeProducts = products.filter((p) => !p.archived);

	const { entityId } = useEntity();
	const { customer } = useCusQuery();

	const entities = (customer as FullCustomer).entities || [];

	const fullEntity = entities.find(
		(e: Entity) => e.id === entityId || e.internal_id === entityId,
	);

	useEffect(() => {
		// Set customerId on mount
		setCustomerId(customerId);

		// Subscribe to form changes
		const subscription = form.store.subscribe(() => {
			const values = form.store.state.values;
			const productId = values.productId;

			// Sync form values to store (no need to pass customerId again)
			setFormValues({
				productId: values.productId,
				prepaidOptions: values.prepaidOptions ?? {},
			});

			// Reset product store when productId changes (unless it matches itemId from customization)
			if (productId && productId !== itemId) {
				resetProductStore();
			}
		});

		return () => subscription();
	}, [
		customerId,
		form.store,
		itemId,
		resetProductStore,
		setFormValues,
		setCustomerId,
	]);

	if (isLoading) {
		return <div className="text-sm text-t3">Loading products...</div>;
	}

	return (
		<FormWrapper form={form}>
			<AttachProductSelection form={form} customerId={customerId} />
			{entityId ? (
				<InfoBox variant="info">
					Attaching plan to entity{" "}
					<span className="font-semibold">
						{fullEntity?.name || fullEntity?.id}
					</span>
				</InfoBox>
			) : entities.length > 0 ? (
				<InfoBox variant="info">
					Attaching plan to customer - all entities will get access
				</InfoBox>
			) : null}

			<form.Subscribe
				selector={(state) => ({ productId: state.values.productId })}
			>
				{() => <AttachProductPrepaidOptions form={form} />}
			</form.Subscribe>

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
