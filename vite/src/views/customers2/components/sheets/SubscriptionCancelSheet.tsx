import type { FullCusProduct } from "@autumn/shared";
import { useMemo } from "react";
import { CancelFooter } from "@/components/forms/cancel-subscription/components/CancelFooter";
import { CancelModeSection } from "@/components/forms/cancel-subscription/components/CancelModeSection";
import { CancelPreviewSection } from "@/components/forms/cancel-subscription/components/CancelPreviewSection";
import { RefundBehaviorSection } from "@/components/forms/cancel-subscription/components/RefundBehaviorSection";
import {
	type CancelSubscriptionFormContext,
	CancelSubscriptionProvider,
	useCancelSubscriptionContext,
} from "@/components/forms/cancel-subscription/context/CancelSubscriptionContext";
import { SheetHeader } from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

function SheetContent() {
	const { formContext, isScheduled, isDefault } =
		useCancelSubscriptionContext();
	const { customerProduct } = formContext;

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title="Cancel Subscription"
				description={`Cancel ${customerProduct.product.name} for this customer`}
				breadcrumbs={[
					{ name: customerProduct.product.name, sheet: "subscription-detail" },
				]}
				itemId={customerProduct.id}
			/>

			{/* Info boxes for special cases */}
			{isScheduled && (
				<div className="px-4 pt-4">
					<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
						This plan is scheduled to start on{" "}
						{formatUnixToDateTime(customerProduct.starts_at).date}. Cancelling
						will remove this schedule.
					</InfoBox>
				</div>
			)}

			{isDefault && (
				<div className="px-4 pt-4">
					<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
						This is the default plan. Cancelling it means this customer will be
						left without a plan.
					</InfoBox>
				</div>
			)}

			<CancelModeSection />
			<RefundBehaviorSection />
			<CancelPreviewSection />
			<CancelFooter />
		</div>
	);
}

export function SubscriptionCancelSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();

	const { cusProduct } = useSubscriptionById({ itemId });

	const formContext = useMemo(
		(): CancelSubscriptionFormContext | null =>
			cusProduct && customer
				? {
						customerId: customer.id ?? customer.internal_id,
						productId: cusProduct.product.id,
						entityId: cusProduct.entity_id ?? undefined,
						customerProductId: cusProduct.id,
						customerProduct: cusProduct as FullCusProduct,
					}
				: null,
		[customer, cusProduct],
	);

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Cancel Subscription"
					description="Loading subscription..."
				/>
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	if (!formContext) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Cancel Subscription" description="Loading..." />
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	return (
		<CancelSubscriptionProvider
			formContext={formContext}
			onSuccess={closeSheet}
		>
			<SheetContent />
		</CancelSubscriptionProvider>
	);
}
