import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";

export function CancelPreviewSection() {
	const { previewQuery, formValues } = useUpdateSubscriptionFormContext();

	const cancelAction = formValues.cancelAction ?? "cancel_end_of_cycle";
	const { refundBehavior, refundAmount } = formValues;

	const isFullRefund =
		cancelAction === "cancel_immediately" &&
		refundBehavior === "refund" &&
		refundAmount === "full";

	return (
		<PreviewSection
			previewQuery={previewQuery}
			totalDue="row"
			showCreditNote={false}
			refundBehavior={refundBehavior ?? "none"}
			includeNextCycle={cancelAction === "cancel_end_of_cycle"}
			lineItems={isFullRefund ? [] : undefined}
			filterZeroAmounts={!isFullRefund}
		/>
	);
}
