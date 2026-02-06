import type { FullCusProduct, ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import { BillingBehaviorSection } from "@/components/forms/cancel-subscription/components/BillingBehaviorSection";
import { CancelPreviewSection } from "@/components/forms/cancel-subscription/components/CancelPreviewSection";
import { UncancelFooter } from "@/components/forms/uncancel-subscription/components/UncancelFooter";
import { UncancelPreviewSection } from "@/components/forms/uncancel-subscription/components/UncancelPreviewSection";
import {
	type UpdateSubscriptionFormContext,
	UpdateSubscriptionFormProvider,
	useUpdateSubscriptionFormContext,
} from "@/components/forms/update-subscription-v2";
import {
	LayoutGroup,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { usePrepaidItems } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

function SheetContent() {
	const { formContext, formValues } = useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isCancelMode = formValues.cancelAction === "cancel_immediately";

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				<SheetHeader
					title={isCancelMode ? "Cancel Subscription" : "Uncancel Subscription"}
					description={
						isCancelMode
							? `Cancel ${customerProduct.product.name} immediately`
							: `Resume ${customerProduct.product.name} for this customer`
					}
					breadcrumbs={[
						{
							name: customerProduct.product.name,
							sheet: "subscription-detail",
						},
					]}
					itemId={customerProduct.id}
				/>

				{!isCancelMode && (
					<div className="px-4 pt-4">
						<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
							This subscription is scheduled to cancel on{" "}
							{formatUnixToDateTime(customerProduct.canceled_at).date}.
							Uncancelling will resume normal billing.
						</InfoBox>
					</div>
				)}

				<BillingBehaviorSection />
				{isCancelMode ? <CancelPreviewSection /> : <UncancelPreviewSection />}
				<UncancelFooter />
			</div>
		</LayoutGroup>
	);
}

export function SubscriptionUncancelSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();

	const { cusProduct, productV2 } = useSubscriptionById({ itemId });
	const { prepaidItems } = usePrepaidItems({ product: productV2 });

	const currentVersion = cusProduct?.product?.version ?? 1;

	const formContext = useMemo(
		(): UpdateSubscriptionFormContext | null =>
			cusProduct && customer
				? {
						customerId: customer.id ?? customer.internal_id,
						product: productV2 as ProductV2 | undefined,
						entityId: cusProduct.entity_id ?? undefined,
						customerProduct: cusProduct as FullCusProduct,
						prepaidItems,
						numVersions: 1,
						currentVersion,
					}
				: null,
		[customer, cusProduct, productV2, prepaidItems, currentVersion],
	);

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Uncancel Subscription"
					description="Loading subscription..."
				/>
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	if (!formContext) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Uncancel Subscription" description="Loading..." />
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	return (
		<UpdateSubscriptionFormProvider
			formContext={formContext}
			originalItems={undefined}
			defaultOverrides={{ cancelAction: "uncancel" }}
			onSuccess={closeSheet}
		>
			<SheetContent />
		</UpdateSubscriptionFormProvider>
	);
}
