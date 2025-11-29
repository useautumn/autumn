import type { FullCusProduct, ProductV2 } from "@autumn/shared";
import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { UpdateProductActions } from "@/components/forms/attach-product/update-product-actions";
import { UpdateProductPrepaidOptions } from "@/components/forms/attach-product/update-product-prepaid-options";
import { UpdateProductSummary } from "@/components/forms/attach-product/update-product-summary";
import { useAttachPreview } from "@/components/forms/attach-product/use-attach-preview";
import {
	type UseAttachProductForm,
	useAttachProductForm,
} from "@/components/forms/attach-product/use-attach-product-form";
import { FormWrapper } from "@/components/general/form/form-wrapper";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import {
	usePrepaidItems,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const FormContent = ({
	productV2,
	cusProduct,
	form,
}: {
	productV2: ProductV2;
	cusProduct: FullCusProduct;
	form: UseAttachProductForm;
}) => {
	const { customer } = useCusQuery();
	const customerId = customer?.id;
	const storeProduct = useProductStore((s) => s.product);
	const product = storeProduct?.id ? storeProduct : (productV2 ?? undefined);
	const entityId = cusProduct?.entity_id ?? undefined;
	const prepaidItems = usePrepaidItems({ product });

	const prepaidOptions = form.state.values.prepaidOptions;
	const initialPrepaidOptions = form.state.values.initialPrepaidOptions;

	const previewQuery = useAttachPreview({
		customerId,
		product,
		entityId,
		prepaidOptions: prepaidOptions ?? undefined,
		version: product?.version,
	});

	if (prepaidItems.length > 0) {
		const hasUnsetPrepaidQuantity = prepaidItems.some((item) => {
			const quantity = prepaidOptions?.[item.feature_id as string];
			return quantity === undefined || quantity === null;
		});

		if (hasUnsetPrepaidQuantity) {
			return null;
		}

		// Check if there are any changes from initial values
		const hasQuantityChanges = prepaidItems.some((item) => {
			const currentQuantity = prepaidOptions?.[item.feature_id as string];
			const initialQuantity =
				initialPrepaidOptions?.[item.feature_id as string];
			return currentQuantity !== initialQuantity;
		});

		if (!hasQuantityChanges && !storeProduct?.id) {
			return null;
		}
	}

	return (
		<>
			<UpdateProductSummary
				previewData={previewQuery.data}
				isLoading={previewQuery.isLoading}
				product={product}
				form={form}
			/>
			<UpdateProductActions
				product={product}
				customerId={customerId}
				entityId={entityId}
				previewData={previewQuery.data}
				isPreviewLoading={previewQuery.isLoading}
				form={form}
			/>
		</>
	);
};

function SheetContent({
	cusProduct,
	productV2,

	itemId,
}: {
	cusProduct: FullCusProduct;
	productV2: ProductV2;
	itemId: string | null;
}) {
	const storeProduct = useProductStore((s) => s.product);

	// Memoize initial prepaid options from cusProduct
	const initialPrepaidOptions = useMemo(
		() =>
			cusProduct.options.reduce(
				(acc, option) => {
					acc[option.feature_id] = option.quantity;
					return acc;
				},
				{} as Record<string, number>,
			),
		[cusProduct.options],
	);

	const form = useAttachProductForm({
		initialProductId: cusProduct?.product.id ?? undefined,
		initialPrepaidOptions,
	});

	const product = storeProduct?.id ? storeProduct : (productV2 ?? undefined);
	const prepaidItems = usePrepaidItems({ product });

	// This gets the prepaid items from the product, sees if there are existing quantities from the cusProduct/subscription, and sets them if so
	useEffect(() => {
		// Build prepaid options based on current product's prepaid items
		const newPrepaidOptions = prepaidItems.reduce(
			(acc, item) => {
				const featureId = item.feature_id as string;
				// Use initial value if this feature existed in original, otherwise undefined
				acc[featureId] = initialPrepaidOptions[featureId] ?? undefined;
				return acc;
			},
			{} as Record<string, number | undefined>,
		);

		form.setFieldValue(
			"prepaidOptions",
			newPrepaidOptions as Record<string, number>,
		);
	}, [prepaidItems, initialPrepaidOptions, form]);

	return (
		<FormWrapper form={form}>
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Subscription"
					description={`Update ${cusProduct.product.name} for this customer`}
					breadcrumbs={[
						{
							name: `${cusProduct.product.name}`,
							sheet: "subscription-detail",
						},
					]}
					itemId={itemId}
				/>

				<div className="flex-1 overflow-y-auto">
					<form.Subscribe
						selector={(state) => ({
							prepaidOptions: state.values.prepaidOptions,
						})}
					>
						{() => (
							<>
								{prepaidItems.length > 0 && (
									// <SheetSection className="" withSeparator={false}>
									<UpdateProductPrepaidOptions form={form} />
									// </SheetSection>
								)}
								<FormContent
									productV2={productV2}
									cusProduct={cusProduct}
									form={form}
								/>
							</>
						)}
					</form.Subscribe>
				</div>
			</div>
		</FormWrapper>
	);
}

export function SubscriptionUpdateSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });

	const sheetType = useSheetStore((s) => s.type);
	const resetProductStore = useProductStore((s) => s.reset);

	useEffect(() => {
		if (
			sheetType !== "subscription-detail" &&
			sheetType !== "subscription-update"
		) {
			resetProductStore();
		}
	}, [sheetType, resetProductStore]);

	// Load subscription's product into store on mount

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
						onClick={() => setSheet({ type: "subscription-detail", itemId })}
						className="mt-2 w-fit"
					>
						<ArrowLeft size={16} />
						Back to Details
					</Button>
				</SheetHeader>
			</div>
		);
	}

	if (!productV2) {
		return null;
	}

	return (
		<SheetContent
			cusProduct={cusProduct}
			productV2={productV2}
			itemId={itemId}
		/>
	);
}
