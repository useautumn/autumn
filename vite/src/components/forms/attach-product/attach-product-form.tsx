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
	const storeProduct = useProductStore((s) => s.product);

	// Use customized product if it exists and has changes, otherwise find by form productId
	const product = storeProduct?.id
		? storeProduct
		: products.find((p) => p.id === productId && !p.archived);

	const prepaidItems = usePrepaidItems({ product });
	const prepaidOptions = form.state.values.prepaidOptions;

	const { entityId } = useEntity();

	// Call preview once here and pass data down to children
	const previewQuery = useAttachPreview({
		customerId,
		product,
		entityId: entityId ?? undefined,
		prepaidOptions: prepaidOptions ?? undefined,
		version: product?.version,
	});

	// Check if there are prepaid items and if any are not set (undefined/null)
	// Note: 0 is a valid quantity value
	if (prepaidItems.length > 0) {
		const hasUnsetPrepaidQuantity = prepaidItems.some((item) => {
			const quantity = prepaidOptions?.[item.feature_id as string];
			return quantity === undefined || quantity === null;
		});

		if (hasUnsetPrepaidQuantity) {
			return null;
		}
	}

	if (!form.state.values.productId || !product) {
		return null;
	}

	return (
		<>
			<AttachProductSummary
				previewData={previewQuery.data}
				isLoading={previewQuery.isLoading}
				product={product}
			/>

			<AttachProductActions
				form={form}
				product={product}
				customerId={customerId}
				onSuccess={onSuccess}
				previewData={previewQuery.data}
				isPreviewLoading={previewQuery.isLoading}
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
	}, [customerId, setCustomerId]);

	useEffect(() => {
		// Reset product store when productId changes (unless it matches itemId from customization)
		const subscription = form.store.subscribe(() => {
			const productId = form.store.state.values.productId;
			if (productId && productId !== itemId) {
				resetProductStore();
			}
		});

		return () => subscription();
	}, [form.store, itemId, resetProductStore]);

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
					prepaidOptions: state.values.prepaidOptions,
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
