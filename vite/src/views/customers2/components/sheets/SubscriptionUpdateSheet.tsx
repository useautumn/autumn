import type {
	FrontendProduct,
	FullCusProduct,
	ProductV2,
} from "@autumn/shared";
import { ArrowLeft } from "@phosphor-icons/react";
import { useMemo } from "react";
import { UpdateProductActions } from "@/components/forms/attach-product/update-product-actions";
import { UpdateProductPrepaidOptions } from "@/components/forms/attach-product/update-product-prepaid-options";
import { UpdateProductSummary } from "@/components/forms/attach-product/update-product-summary";
import { useUpdateSubscriptionPreview } from "@/components/forms/update-subscription/use-update-subscription-preview";
import {
	type UseAttachProductForm,
	useAttachProductForm,
} from "@/components/forms/attach-product/use-attach-product-form";
import { FormWrapper } from "@/components/general/form/form-wrapper";
import { Button } from "@/components/v2/buttons/Button";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

const FormContent = ({
	productV2,
	cusProduct,
	form,
	customizedProduct,
}: {
	productV2: ProductV2;
	cusProduct: FullCusProduct;
	form: UseAttachProductForm;
	customizedProduct: FrontendProduct | undefined;
}) => {
	const { customer } = useCusQuery();
	const customerId = customer?.id ?? customer?.internal_id;
	const product = customizedProduct?.id
		? customizedProduct
		: (productV2 ?? undefined);
	const entityId = cusProduct?.entity_id ?? undefined;

	const prepaidOptions = form.state.values.prepaidOptions;
	const initialPrepaidOptions =
		form.options.defaultValues?.prepaidOptions ?? {};

	const previewQuery = useUpdateSubscriptionPreview({
		customerId,
		product,
		entityId,
		prepaidOptions: prepaidOptions ?? undefined,
		version: product?.version,
	});

	const { prepaidItems, isLoading } = usePrepaidItems({
		product,
	});

	if (isLoading) {
		return null;
	}

	if (prepaidItems.length > 0) {
		const hasUnsetPrepaidQuantity = prepaidItems.some((item) => {
			const quantity = prepaidOptions?.[item.feature_id as string];
			return quantity === undefined || quantity === null;
		});

		if (hasUnsetPrepaidQuantity) {
			return null;
		}

		const hasQuantityChanges = prepaidItems.some((item) => {
			const currentQuantity = prepaidOptions?.[item.feature_id as string];
			const initialQuantity =
				initialPrepaidOptions?.[item.feature_id as string];
			return currentQuantity !== initialQuantity;
		});

		if (!hasQuantityChanges && !customizedProduct?.id) {
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
	customizedProduct,
}: {
	cusProduct: FullCusProduct;
	productV2: ProductV2;
	itemId: string | null;
	customizedProduct: FrontendProduct | undefined;
}) {
	const product = customizedProduct?.id
		? customizedProduct
		: (productV2 ?? undefined);
	const { prepaidItems } = usePrepaidItems({ product });

	const subscriptionPrepaidValues = useMemo(
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

	const initialPrepaidOptions = useMemo(() => {
		if (prepaidItems.length === 0) {
			return {};
		}

		return prepaidItems.reduce(
			(acc, item) => {
				const featureId = item.feature_id as string;
				acc[featureId] = subscriptionPrepaidValues[featureId] ?? undefined;
				return acc;
			},
			{} as Record<string, number | undefined>,
		) as Record<string, number>;
	}, [prepaidItems, subscriptionPrepaidValues]);

	const form = useAttachProductForm({
		initialProductId: cusProduct?.product.id ?? undefined,
		initialPrepaidOptions,
	});

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
									<UpdateProductPrepaidOptions form={form} />
								)}
								<FormContent
									productV2={productV2}
									cusProduct={cusProduct}
									form={form}
									customizedProduct={customizedProduct}
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
	const sheetData = useSheetStore((s) => s.data);

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });

	const customizedProduct = sheetData?.customizedProduct as
		| FrontendProduct
		| undefined;

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
			customizedProduct={customizedProduct}
		/>
	);
}
