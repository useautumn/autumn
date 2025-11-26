import type { FrontendProduct } from "@autumn/shared";
import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect } from "react";
import { UpdateProductActions } from "@/components/forms/attach-product/update-product-actions";
import { UpdateProductPrepaidOptions } from "@/components/forms/attach-product/update-product-prepaid-options";
import { UpdateProductSummary } from "@/components/forms/attach-product/update-product-summary";
import { useAttachPreview } from "@/components/forms/attach-product/use-attach-preview";
import { useAttachProductForm } from "@/components/forms/attach-product/use-attach-product-form";
import { FormWrapper } from "@/components/general/form/form-wrapper";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import {
	useAttachProductStore,
	useSubscriptionById,
} from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function SubscriptionUpdateSheet() {
	const { customer } = useCusQuery();
	const itemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	// Get edited product from store
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);
	const setCustomerId = useAttachProductStore((s) => s.setCustomerId);
	const setFormValues = useAttachProductStore((s) => s.setFormValues);
	const setProductId = useAttachProductStore((s) => s.setProductId);
	const productId = useAttachProductStore((s) => s.productId);
	const setCustomizedProduct = useAttachProductStore(
		(s) => s.setCustomizedProduct,
	);

	const { cusProduct, productV2: product } = useSubscriptionById({ itemId });

	setProductId(cusProduct?.product.id ?? "");

	const { isLoading: isPreviewLoading } = useAttachPreview();

	const handleBackToDetail = () => {
		setSheet({ type: "subscription-detail", itemId });

		setCustomizedProduct({
			product: product as unknown as FrontendProduct,
		});
	};
	const form = useAttachProductForm({
		initialProductId: cusProduct?.id ?? undefined,
	});

	useEffect(() => {
		if (!customer?.id && !customer?.internal_id) return;

		const customerId = customer.id || customer.internal_id;
		setCustomerId(customerId);

		// Subscribe to form changes
		const subscription = form.store.subscribe(() => {
			const values = form.store.state.values;

			// Sync form values to store
			setFormValues({
				productId: values.productId ?? productId,
				prepaidOptions: values.prepaidOptions ?? {},
			});
		});

		return () => subscription();
	}, [customer, form.store, setCustomerId, setFormValues, productId]);
	// const cusProduct = useMemo(() => {
	// 	if (!itemId || !customer?.customer_products) return null;
	// 	return customer.customer_products.find(
	// 		(p: FullCusProduct) =>
	// 			p.id === itemId || p.internal_product_id === itemId,
	// 	);
	// }, [itemId, customer?.customer_products]);

	// const entity = customer?.entities?.find(
	// 	(e: Entity) =>
	// 		e.internal_id === cusProduct?.internal_entity_id ||
	// 		e.id === cusProduct?.entity_id,
	// );

	// const customerId = customer?.id || customer?.internal_id;
	// const entityId = entity ? entity.id || entity.internal_id : undefined;

	// Get prepaid items from the customized product
	const prepaidItems = usePrepaidItems({
		product: product ?? undefined,
	});

	// Create form with prepopulated values

	// Initialize store and form on mount
	// useEffect(() => {
	// 	if (customerId && customizedProduct) {
	// 		setCustomerId(customerId);
	// 		setFormValues({
	// 			productId: customizedProduct.id,
	// 			prepaidOptions: initialPrepaidOptions,
	// 		});

	// 		// Set form values
	// 		form.setFieldValue("productId", customizedProduct.id);
	// 		form.setFieldValue("prepaidOptions", initialPrepaidOptions);
	// 	}
	// }, [
	// 	customerId,
	// 	customizedProduct,
	// 	setCustomerId,
	// 	setFormValues,
	// 	initialPrepaidOptions,
	// ]);

	// Sync form changes to store

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Plan"
					description="Loading plan information..."
				>
					<Button
						variant="skeleton"
						size="sm"
						onClick={handleBackToDetail}
						className="mt-2 w-fit"
					>
						<ArrowLeft size={16} />
						Back to Details
					</Button>
				</SheetHeader>
			</div>
		);
	}

	return (
		<FormWrapper form={form}>
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Plan"
					description={`Update ${cusProduct.product.name} for this customer`}
				>
					<Button
						variant="skeleton"
						size="sm"
						onClick={handleBackToDetail}
						className="mt-2 w-fit"
					>
						<ArrowLeft size={16} />
						Back to Details
					</Button>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto">
					{prepaidItems.length > 0 && (
						<SheetSection title="Prepaid Quantities" withSeparator={false}>
							<UpdateProductPrepaidOptions form={form} />
						</SheetSection>
					)}
					<UpdateProductSummary />
					<UpdateProductActions
						customerId={customer?.id || customer?.internal_id}
						entityId={cusProduct.entity_id ?? undefined}
						isPreviewLoading={isPreviewLoading}
					/>
				</div>
			</div>
		</FormWrapper>
	);
}
function resetProductStore() {
	throw new Error("Function not implemented.");
}
