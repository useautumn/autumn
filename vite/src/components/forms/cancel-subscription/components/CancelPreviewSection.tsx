import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { buildPreviewTotals } from "@/components/forms/shared/utils/buildPreviewTotals";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";

export function CancelPreviewSection() {
	const { previewQuery, formValues } = useUpdateSubscriptionFormContext();

	const cancelAction = formValues.cancelAction ?? "cancel_end_of_cycle";
	const { refundBehavior, refundAmount } = formValues;

	// A full refund replaces the invoice outright, so prorated line items would mislead.
	const isFullRefund =
		cancelAction === "cancel_immediately" &&
		refundBehavior === "refund" &&
		refundAmount === "full";

	return (
		<PreviewSection
			previewQuery={previewQuery}
			lineItems={isFullRefund ? [] : undefined}
			filterZeroAmounts={!isFullRefund}
			totals={buildPreviewTotals({
				previewData: previewQuery.data,
				refundBehavior: refundBehavior ?? "none",
				includeNextCycle: cancelAction === "cancel_end_of_cycle",
			})}
		/>
	);
}
