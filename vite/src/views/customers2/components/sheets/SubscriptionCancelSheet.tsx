import {
	CusProductStatus,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";
import { useMemo } from "react";
import { CancelFooter } from "@/components/forms/cancel-subscription/components/CancelFooter";
import { CancelModeSection } from "@/components/forms/cancel-subscription/components/CancelModeSection";
import { CancelPreviewSection } from "@/components/forms/cancel-subscription/components/CancelPreviewSection";
import { RefundBehaviorSection } from "@/components/forms/cancel-subscription/components/RefundBehaviorSection";
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
	const { formContext } = useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isDefault = customerProduct.product.is_default;
	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;

	return (
		<LayoutGroup>
			<div className="flex flex-col h-full overflow-y-auto">
				<SheetHeader
					title="Cancel Subscription"
					description={`Cancel ${customerProduct.product.name} for this customer`}
					breadcrumbs={[
						{
							name: customerProduct.product.name,
							sheet: "subscription-detail",
						},
					]}
					itemId={customerProduct.id}
				/>

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
							This is the default plan. Cancelling it means this customer will
							be left without a plan.
						</InfoBox>
					</div>
				)}

				<CancelModeSection />
				<RefundBehaviorSection />
				<CancelPreviewSection />
				<CancelFooter />
			</div>
		</LayoutGroup>
	);
}

export function SubscriptionCancelSheet() {
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
		<UpdateSubscriptionFormProvider
			formContext={formContext}
			originalItems={undefined}
			defaultOverrides={{ cancelAction: "cancel_end_of_cycle" }}
			onSuccess={closeSheet}
		>
			<SheetContent />
		</UpdateSubscriptionFormProvider>
	);
}
