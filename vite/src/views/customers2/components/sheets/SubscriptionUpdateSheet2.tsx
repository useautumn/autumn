import {
	type FrontendProduct,
	type FullCusProduct,
	getProductItemDisplay,
	type ProductItem,
	type ProductV2,
	productV2ToFrontendProduct,
	UsageModel,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useMemo, useState } from "react";
import { useUpdateSubscriptionPreview } from "@/components/forms/update-subscription/use-update-subscription-preview";
import {
	EditPlanSection,
	FreeTrialSection,
	getFreeTrial,
	PlanVersionSection,
	PrepaidQuantitySection,
	UpdateSubscriptionFooter,
	type UpdateSubscriptionFormContext,
	UpdateSubscriptionPreviewSection,
	UpdateSubscriptionSummary,
	useHasSubscriptionChanges,
	useUpdateSubscriptionForm,
	useUpdateSubscriptionMutation,
	useUpdateSubscriptionRequestBody,
} from "@/components/forms/update-subscription-v2";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { itemToFeature } from "@/utils/product/productItemUtils/convertItem";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";

function SheetContent({
	updateSubscriptionFormContext,
	originalItems,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	originalItems: FrontendProduct["items"] | undefined;
}) {
	const {
		customerProduct,
		prepaidItems,
		numVersions,
		currentVersion,
		product,
	} = updateSubscriptionFormContext;
	const { closeSheet } = useSheetStore();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const [showPlanEditor, setShowPlanEditor] = useState(false);
	const { setIsInlineEditorOpen } = useCustomerContext();

	const form = useUpdateSubscriptionForm({ updateSubscriptionFormContext });
	const { features } = useFeaturesQuery();

	const formValues = useStore(form.store, (state) => state.values);
	const { prepaidOptions } = formValues;

	const defaultValues = form.options.defaultValues;
	const initialPrepaidOptions = defaultValues?.prepaidOptions ?? {};

	const hasChanges = useHasSubscriptionChanges({
		formValues,
		initialPrepaidOptions,
		prepaidItems,
		customerProduct,
		currentVersion,
		originalItems,
		features,
	});

	// Compute extended prepaid items that includes both original prepaid items
	// and any new prepaid items added through the inline editor
	const extendedPrepaidItems = useMemo(() => {
		if (!formValues.items) return prepaidItems;

		// Get IDs of original prepaid items
		const originalPrepaidIds = new Set(
			prepaidItems.map((item) => item.feature_id),
		);

		// Find new prepaid items from form that aren't in the original list
		const newPrepaidItems = formValues.items.filter(
			(item) =>
				item.usage_model === UsageModel.Prepaid &&
				item.feature_id &&
				!originalPrepaidIds.has(item.feature_id),
		);

		// Enrich new prepaid items with feature info
		const enrichedNewItems = newPrepaidItems.map((item) => {
			const feature = itemToFeature({ item, features });
			const display = getProductItemDisplay({
				item,
				features,
				currency: "usd",
			});
			return { ...item, feature, display };
		});

		return [...prepaidItems, ...enrichedNewItems];
	}, [prepaidItems, formValues.items, features]);

	const productWithFormItems = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;

		const baseFrontendProduct = productV2ToFrontendProduct({
			product: product as ProductV2,
		});

		if (formValues.items) {
			return {
				...baseFrontendProduct,
				items: formValues.items,
			};
		}

		return baseFrontendProduct;
	}, [product, formValues.items]);

	const { buildRequestBody } = useUpdateSubscriptionRequestBody({
		updateSubscriptionFormContext,
		form,
	});

	const previewQuery = useUpdateSubscriptionPreview({
		updateSubscriptionFormContext,
		prepaidOptions,
		freeTrial: getFreeTrial({
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
			trialCardRequired: formValues.trialCardRequired,
		}),
		items: formValues.items,
		version: formValues.version,
	});

	const { handleConfirm, handleInvoiceUpdate, isPending } =
		useUpdateSubscriptionMutation({
			updateSubscriptionFormContext,
			buildRequestBody,
			onInvoiceCreated: (invoiceId) => {
				const invoiceLink = getStripeInvoiceLink({
					stripeInvoice: invoiceId,
					env,
					accountId: stripeAccount?.id,
				});
				window.open(invoiceLink, "_blank");
			},
			onCheckoutRedirect: (checkoutUrl) => {
				window.open(checkoutUrl, "_blank");
			},
			onSuccess: () => {
				closeSheet();
			},
		});

	// Handler to open the inline plan editor
	const handleEditPlan = () => {
		if (!productWithFormItems) return;
		setShowPlanEditor(true);
		setIsInlineEditorOpen(true);
	};

	const handlePlanEditorSave = (items: ProductItem[]) => {
		form.setFieldValue("items", items);
		setShowPlanEditor(false);
		setIsInlineEditorOpen(false);
	};

	const handlePlanEditorCancel = () => {
		setShowPlanEditor(false);
		setIsInlineEditorOpen(false);
	};

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title="Update Subscription"
				description={`Update ${customerProduct.product.name} for this customer`}
				breadcrumbs={[
					{ name: customerProduct.product.name, sheet: "subscription-detail" },
				]}
				itemId={customerProduct.id}
			/>

			<PlanVersionSection
				form={form}
				numVersions={numVersions}
				currentVersion={currentVersion}
			/>

			<EditPlanSection
				hasCustomizations={formValues.items !== null}
				onEditPlan={handleEditPlan}
			/>

			<PrepaidQuantitySection form={form} prepaidItems={extendedPrepaidItems} />

			<FreeTrialSection form={form} customerProduct={customerProduct} />

			<UpdateSubscriptionSummary
				form={form}
				prepaidItems={prepaidItems}
				customerProduct={customerProduct}
				currentVersion={currentVersion}
				currency={previewQuery.data?.currency}
				originalItems={originalItems}
			/>

			<UpdateSubscriptionPreviewSection
				isLoading={previewQuery.isLoading}
				previewData={previewQuery.data}
				error={
					previewQuery.error
						? getBackendErr(
								previewQuery.error as AxiosError,
								"Failed to load preview",
							)
						: undefined
				}
			/>

			<UpdateSubscriptionFooter
				isPending={isPending}
				hasChanges={hasChanges}
				onConfirm={handleConfirm}
				onInvoiceUpdate={handleInvoiceUpdate}
			/>

			{showPlanEditor && productWithFormItems && (
				<InlinePlanEditor
					product={productWithFormItems}
					productName={customerProduct.product.name}
					onSave={handlePlanEditorSave}
					onCancel={handlePlanEditorCancel}
				/>
			)}
		</div>
	);
}

export function SubscriptionUpdateSheet2() {
	const itemId = useSheetStore((s) => s.itemId);
	const { customer } = useCusQuery();
	const axiosInstance = useAxiosInstance();

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });

	const { prepaidItems } = usePrepaidItems({ product: productV2 });

	// Fetch numVersions for the product
	const { data: productData } = useQuery({
		queryKey: ["product-versions", productV2?.id],
		queryFn: async () => {
			if (!productV2?.id) return null;
			const { data } = await axiosInstance.get(
				`/products/${productV2.id}/data`,
			);
			return data;
		},
		enabled: !!productV2?.id,
	});

	const numVersions = productData?.numVersions ?? productV2?.version ?? 1;
	const currentVersion = cusProduct?.product?.version ?? 1;

	const updateSubscriptionFormContext = useMemo(
		(): UpdateSubscriptionFormContext | null =>
			cusProduct && productV2
				? {
						customerId: customer?.id ?? customer?.internal_id,
						product: productV2 as ProductV2,
						entityId: cusProduct?.entity_id ?? undefined,
						customerProduct: cusProduct as FullCusProduct,
						prepaidItems,
						numVersions,
						currentVersion,
					}
				: null,
		[
			customer,
			cusProduct,
			productV2,
			prepaidItems,
			numVersions,
			currentVersion,
		],
	);

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Subscription"
					description="Loading subscription..."
				/>
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	if (!productV2) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Update Subscription"
					description="Loading product..."
				/>
				<div className="p-4 text-sm text-t3">Loading product data...</div>
			</div>
		);
	}

	if (!updateSubscriptionFormContext) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Update Subscription" description="Loading..." />
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	return (
		<SheetContent
			updateSubscriptionFormContext={updateSubscriptionFormContext}
			originalItems={productV2?.items}
		/>
	);
}
