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
	const refundBehavior = formValues.refundBehavior;
	const refundAmount = formValues.refundAmount;

	const isFullRefund =
		cancelAction === "cancel_immediately" &&
		refundBehavior === "refund" &&
		refundAmount === "full";

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const refundPreview = previewData?.refund;

	const totals = useMemo(() => {
		if (!previewData) return [];

		const result = [];

		// For any refund mode (full or prorated) with preview data, use the exact amount
		if (refundBehavior === "refund" && refundPreview) {
			if (refundPreview.invoice.current_refunded_amount > 0) {
				result.push({
					label: "Previously Refunded",
					amount: -refundPreview.invoice.current_refunded_amount,
					variant: "secondary" as const,
				});
			}

			result.push({
				label: "Refund Amount",
				amount: -refundPreview.amount,
				variant: "primary" as const,
			});

			return result;
		}

		let totalLabel = "Total Due Now";
		if (previewData.total < 0) {
			if (refundBehavior === "refund") {
				totalLabel = "Refund Amount";
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
	}, [previewData, cancelAction, refundBehavior, refundPreview]);

	if (error) {
		return (
			<SheetSection title="Pricing Preview" withSeparator>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	// For full refund, show only totals — no prorated line items
	if (isFullRefund) {
		return (
			<LineItemsPreview
				title="Pricing Preview"
				isLoading={isLoading}
				lineItems={[]}
				currency={previewData?.currency}
				totals={totals}
			/>
		);
	}

	return (
		<LineItemsPreview
			title="Pricing Preview"
			isLoading={isLoading}
			lineItems={previewData?.line_items}
			currency={previewData?.currency}
			totals={totals}
			filterZeroAmounts
		/>
	);
}
