import type { AxiosError } from "axios";
import { format } from "date-fns";
import { useMemo } from "react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";

export function CancelPreviewSection() {
	const { previewQuery, formValues } = useUpdateSubscriptionFormContext();

	const cancelAction = formValues.cancelAction ?? "cancel_end_of_cycle";
	const refundBehavior = formValues.refundBehavior ?? "grant_invoice_credits";

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const showRefundToggle =
		cancelAction === "cancel_immediately" &&
		!!previewData &&
		previewData.total < 0;

	const totals = useMemo(() => {
		if (!previewData) return [];

		const result = [];

		let totalLabel = "Total Due Now";
		if (previewData.total < 0) {
			if (showRefundToggle) {
				totalLabel =
					refundBehavior === "refund_payment_method"
						? "Refund Amount"
						: "Credit Amount";
			} else {
				totalLabel = "Credit Amount";
			}
		}

		result.push({
			label: totalLabel,
			amount: previewData.total,
			variant: "primary" as const,
		});

		if (previewData.next_cycle && cancelAction === "cancel_end_of_cycle") {
			result.push({
				label: "Next Cycle",
				amount: previewData.next_cycle.total,
				variant: "secondary" as const,
				badge: previewData.next_cycle.starts_at
					? format(new Date(previewData.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}

		return result;
	}, [previewData, cancelAction, refundBehavior, showRefundToggle]);

	if (error) {
		return (
			<SheetSection title="Pricing Preview" withSeparator>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	return (
		<LineItemsPreview
			title="Pricing Preview"
			isLoading={isLoading}
			loadingText="Calculating totals"
			lineItems={previewData?.line_items}
			currency={previewData?.currency}
			totals={totals}
			filterZeroAmounts
		/>
	);
}
