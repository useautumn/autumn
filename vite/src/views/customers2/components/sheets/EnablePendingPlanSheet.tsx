import type {
	BillingResponse,
	FullCusProduct,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { cp, LATEST_VERSION } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useMemo, useState } from "react";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { useBillingMutation } from "@/components/forms/shared/hooks/useBillingMutation";
import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";
import { useUpdateSubscriptionPreview } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionPreview";
import {
	SheetBody,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSubscriptionById } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export function EnablePendingPlanSheet() {
	const itemId = useSheetStore((state) => state.itemId);
	const { closeSheet } = useSheetStore();
	const { customer } = useCusQuery();
	const { cusProduct, productV2 } = useSubscriptionById({ itemId });
	const [resetBillingCycle, setResetBillingCycle] = useState(false);

	const requestBody = useMemo<UpdateSubscriptionV1ParamsInput | null>(() => {
		if (!customer || !cusProduct) return null;

		return {
			customer_id: customer.id ?? customer.internal_id,
			entity_id: cusProduct.entity_id ?? undefined,
			customer_product_id: cusProduct.id,
			plan_id: productV2?.id ?? cusProduct.product.id,
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: true,
			},
			billing_cycle_anchor: resetBillingCycle ? "now" : undefined,
		};
	}, [customer, cusProduct, productV2, resetBillingCycle]);

	const previewQuery = useUpdateSubscriptionPreview({
		requestBody,
		enabled: !!requestBody,
		apiVersion: LATEST_VERSION,
	});
	const mutation = useBillingMutation<
		UpdateSubscriptionV1ParamsInput,
		BillingResponse
	>({
		customerId: requestBody?.customer_id,
		path: BILLING_OPERATIONS.updateSubscription.path,
		buildRequestBody: () => requestBody,
		apiVersion: LATEST_VERSION,
		successMessage: "Plan enabled successfully",
		errorMessage: "Failed to enable plan",
		onSuccess: closeSheet,
	});

	if (!cusProduct) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Enable Plan" description="Loading plan..." />
			</div>
		);
	}

	const replacementPlan = customer?.customer_products.find(
		(live: FullCusProduct) =>
			cp(live)
				.hasActiveStatus()
				.onEntity({
					internalEntityId: cusProduct.internal_entity_id ?? undefined,
				})
				.onStripeSubscription({
					stripeSubscriptionId: cusProduct.subscription_ids?.[0],
				}).valid,
	);
	const previewReady =
		!!previewQuery.data && !previewQuery.isLoading && !previewQuery.error;

	return (
		<SheetBody>
			<SheetHeader
				title="Enable Plan"
				description={`Enable ${cusProduct.product.name} now`}
				breadcrumbs={[
					{
						name: cusProduct.product.name,
						sheet: "subscription-detail",
					},
				]}
				itemId={cusProduct.id}
			/>

			<SheetSection>
				<InfoBox variant="note" classNames={{ infoBox: "w-full" }}>
					This plan will become active now.
				</InfoBox>
				{replacementPlan && (
					<div className="pt-3 text-sm text-secondary-foreground">
						{replacementPlan.product.name} will end when this plan becomes
						active.
					</div>
				)}
			</SheetSection>

			{replacementPlan && (
				<SheetSection>
					<BillingCycleAnchorConfigRow
						enabled={resetBillingCycle}
						mode="now"
						customAnchor={null}
						allowCustomAnchor={false}
						onEnabledChange={setResetBillingCycle}
						onModeChange={() => {}}
						onCustomAnchorChange={() => {}}
					/>
				</SheetSection>
			)}

			<PreviewSection previewQuery={previewQuery} includeNextCycle={false} />

			<SheetFooter>
				<Button variant="secondary" className="w-full" onClick={closeSheet}>
					Cancel
				</Button>
				<Button
					variant="primary"
					className="w-full"
					disabled={!previewReady || !requestBody}
					isLoading={mutation.isPending}
					onClick={() => mutation.mutate({ useInvoice: false })}
				>
					Enable now
				</Button>
			</SheetFooter>
		</SheetBody>
	);
}
