import {
	type FrontendProduct,
	type FullCusProduct,
	type ProductItem,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";

import { useMemo, useState } from "react";
import { useUpdateSubscriptionPreview } from "@/components/forms/update-subscription/use-update-subscription-preview";
import {
	EditPlanSection,
	getFreeTrial,
	UpdateSubscriptionFooter,
	type UpdateSubscriptionFormContext,
	UpdateSubscriptionPreviewSection,
	useHasSubscriptionChanges,
	useUpdateSubscriptionForm,
	useUpdateSubscriptionMutation,
	useUpdateSubscriptionRequestBody,
} from "@/components/forms/update-subscription-v2";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import {
	useHasBillingChanges,
	usePrepaidItems,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";

import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

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

	// Only include prepaid options that have changed from their initial values
	const changedPrepaidOptions = useMemo(() => {
		const changed: Record<string, number> = {};
		for (const [featureId, quantity] of Object.entries(prepaidOptions)) {
			if (quantity !== initialPrepaidOptions[featureId]) {
				changed[featureId] = quantity;
			}
		}
		return Object.keys(changed).length > 0 ? changed : undefined;
	}, [prepaidOptions, initialPrepaidOptions]);

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

	const baseProduct = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;
		return productV2ToFrontendProduct({ product: product as ProductV2 });
	}, [product]);
	const newProduct = useMemo((): FrontendProduct | undefined => {
		if (!product) return undefined;

		const base = productV2ToFrontendProduct({ product: product as ProductV2 });
		const freeTrial = getFreeTrial({
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
		});

		return {
			...base,
			items: formValues.items ?? base.items,
			free_trial:
				freeTrial === null ? undefined : (freeTrial ?? base.free_trial),
		};
	}, [
		product,
		formValues.items,
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
	]);

	const hasBillingChanges = useHasBillingChanges({
		baseProduct: baseProduct as FrontendProduct,
		newProduct: newProduct as FrontendProduct,
	});

	const hasPrepaidQuantityChanges = changedPrepaidOptions !== undefined;

	const hasNoBillingChanges =
		hasChanges && !hasBillingChanges && !hasPrepaidQuantityChanges;

	const { buildRequestBody } = useUpdateSubscriptionRequestBody({
		updateSubscriptionFormContext,
		form,
	});

	const previewQuery = useUpdateSubscriptionPreview({
		updateSubscriptionFormContext,
		prepaidOptions: changedPrepaidOptions,
		freeTrial: getFreeTrial({
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
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

		// Initialize prepaid options to 0 for any new prepaid items
		const currentPrepaidOptions = form.store.state.values.prepaidOptions;
		const updatedPrepaidOptions = { ...currentPrepaidOptions };
		let hasNewPrepaidItems = false;

		for (const item of items) {
			if (
				item.usage_model === "prepaid" &&
				item.feature_id &&
				updatedPrepaidOptions[item.feature_id] === undefined
			) {
				updatedPrepaidOptions[item.feature_id] = 0;
				hasNewPrepaidItems = true;
			}
		}

		if (hasNewPrepaidItems) {
			form.setFieldValue("prepaidOptions", updatedPrepaidOptions);
		}

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

			<div
				className={cn(
					"grid px-4 transition-[grid-template-rows] duration-200 ease-out",
					!hasNoBillingChanges && "delay-75",
				)}
				style={{
					gridTemplateRows: hasNoBillingChanges ? "1fr" : "0fr",
				}}
			>
				<div className="overflow-hidden">
					<div
						className={cn(
							"pt-4 transition-opacity duration-150",
							hasNoBillingChanges ? "opacity-100 delay-75" : "opacity-0",
						)}
					>
						<InfoBox variant="success" classNames={{ infoBox: "w-full" }}>
							No changes to billing will be made
						</InfoBox>
					</div>
				</div>
			</div>

			<EditPlanSection
				hasCustomizations={formValues.items !== null}
				onEditPlan={handleEditPlan}
				product={productWithFormItems as ProductV2 | undefined}
				originalItems={originalItems}
				customerProduct={customerProduct}
				features={features}
				form={form}
				numVersions={numVersions}
				currentVersion={currentVersion}
				prepaidOptions={prepaidOptions}
				initialPrepaidOptions={initialPrepaidOptions}
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
				hasChanges={hasChanges}
			/>

			<UpdateSubscriptionFooter
				isPending={isPending}
				hasChanges={hasChanges}
				isLoading={previewQuery.isLoading}
				hasError={!!previewQuery.error}
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
