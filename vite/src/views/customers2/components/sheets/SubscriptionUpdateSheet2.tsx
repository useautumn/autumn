import type { FullCusProduct, ProductItem, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";

import { useMemo } from "react";
import {
	EditPlanSection,
	UpdateSubscriptionFooter,
	type UpdateSubscriptionFormContext,
	UpdateSubscriptionFormProvider,
	UpdateSubscriptionPreviewSection,
	useUpdateSubscriptionFormContext,
} from "@/components/forms/update-subscription-v2";
import { InlinePlanEditor } from "@/components/v2/inline-custom-plan-editor/InlinePlanEditor";
import {
	LayoutGroup,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";

import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

function SheetContent() {
	const {
		formContext,
		hasNoBillingChanges,
		showPlanEditor,
		productWithFormItems,
		handlePlanEditorSave,
		handlePlanEditorCancel,
	} = useUpdateSubscriptionFormContext();

	const { customerProduct } = formContext;

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				<SheetHeader
					title="Update Subscription"
					description={`Update ${customerProduct.product.name} for this customer`}
					breadcrumbs={[
						{
							name: customerProduct.product.name,
							sheet: "subscription-detail",
						},
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

				<EditPlanSection />
				<UpdateSubscriptionPreviewSection />
				<UpdateSubscriptionFooter />

				{productWithFormItems && (
					<InlinePlanEditor
						product={productWithFormItems}
						onSave={handlePlanEditorSave}
						onCancel={handlePlanEditorCancel}
						isOpen={showPlanEditor}
					/>
				)}
			</div>
		</LayoutGroup>
	);
}

export function SubscriptionUpdateSheet2() {
	const itemId = useSheetStore((s) => s.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();
	const axiosInstance = useAxiosInstance();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const { setIsInlineEditorOpen } = useCustomerContext();

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });
	const { prepaidItems } = usePrepaidItems({ product: productV2 });

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

	const formContext = useMemo(
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

	if (!formContext) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Update Subscription" description="Loading..." />
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	return (
		<UpdateSubscriptionFormProvider
			formContext={formContext}
			originalItems={productV2?.items as ProductItem[] | undefined}
			onPlanEditorOpen={() => setIsInlineEditorOpen(true)}
			onPlanEditorClose={() => setIsInlineEditorOpen(false)}
			onInvoiceCreated={(invoiceId) => {
				const invoiceLink = getStripeInvoiceLink({
					stripeInvoice: invoiceId,
					env,
					accountId: stripeAccount?.id,
				});
				window.open(invoiceLink, "_blank");
			}}
			onCheckoutRedirect={(checkoutUrl) => {
				window.location.href = checkoutUrl;
			}}
			onSuccess={closeSheet}
		>
			<SheetContent />
		</UpdateSubscriptionFormProvider>
	);
}
