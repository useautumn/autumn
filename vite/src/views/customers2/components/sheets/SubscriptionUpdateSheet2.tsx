import type {
	FrontendProduct,
	FullCusProduct,
	ProductV2,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { useUpdateSubscriptionPreview } from "@/components/forms/update-subscription/use-update-subscription-preview";
import {
	FreeTrialSection,
	getFreeTrial,
	PrepaidQuantitySection,
	UpdateSubscriptionFooter,
	type UpdateSubscriptionFormContext,
	UpdateSubscriptionPreviewSection,
	UpdateSubscriptionSummary,
	useUpdateSubscriptionForm,
	useUpdateSubscriptionMutation,
	useUpdateSubscriptionRequestBody,
} from "@/components/forms/update-subscription-v2";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

function SheetContent({
	updateSubscriptionFormContext,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
}) {
	const { customerProduct, prepaidItems } = updateSubscriptionFormContext;
	const { closeSheet } = useSheetStore();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const form = useUpdateSubscriptionForm({ updateSubscriptionFormContext });

	const formValues = useStore(form.store, (state) => state.values);
	const { prepaidOptions } = formValues;

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

			<PrepaidQuantitySection form={form} prepaidItems={prepaidItems} />

			<FreeTrialSection form={form} customerProduct={customerProduct} />

			<UpdateSubscriptionSummary
				form={form}
				prepaidItems={prepaidItems}
				customerProduct={customerProduct}
				currency={previewQuery.data?.currency}
			/>

			<UpdateSubscriptionPreviewSection
				isLoading={previewQuery.isLoading}
				previewData={previewQuery.data}
			/>

			<UpdateSubscriptionFooter
				isPending={isPending}
				onConfirm={handleConfirm}
				onInvoiceUpdate={handleInvoiceUpdate}
			/>
		</div>
	);
}

export function SubscriptionUpdateSheet2() {
	const itemId = useSheetStore((s) => s.itemId);
	const sheetData = useSheetStore((s) => s.data);
	const { customer } = useCusQuery();

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });

	const customizedProduct = sheetData?.customizedProduct as
		| FrontendProduct
		| undefined;

	const product = customizedProduct?.id ? customizedProduct : productV2;
	const { prepaidItems } = usePrepaidItems({ product });

	const updateSubscriptionFormContext = useMemo(
		(): UpdateSubscriptionFormContext | null =>
			cusProduct && productV2
				? {
						customerId: customer?.id ?? customer?.internal_id,
						product: product as ProductV2,
						entityId: cusProduct?.entity_id ?? undefined,
						customerProduct: cusProduct as FullCusProduct,
						customizedProduct,
						prepaidItems,
					}
				: null,
		[customer, product, cusProduct, productV2, customizedProduct, prepaidItems],
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
		/>
	);
}
