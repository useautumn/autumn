import { formatAmount } from "@autumn/shared";
import type { AxiosError } from "axios";
import { format } from "date-fns";
import { getPreviewCreditAmount } from "@/components/forms/shared/previewCreditUtils";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { PreviewErrorDisplay } from "./PreviewErrorDisplay";

export function UpdateSubscriptionPreviewSection() {
	const { previewQuery, hasChanges } = useUpdateSubscriptionFormContext();

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;
	const creditAmount = getPreviewCreditAmount({ previewData });
	const hasCreditIndicator = creditAmount > 0;
	const formattedCreditAmount = hasCreditIndicator
		? formatAmount({
				amount: Number(creditAmount.toFixed(2)),
				currency: previewData?.currency,
				minFractionDigits: 2,
				maxFractionDigits: 2,
				amountFormatOptions: {
					currencyDisplay: "narrowSymbol",
				},
			})
		: null;

	const totals = [];

	if (previewData) {
		totals.push({
			label: "Total Due Now",
			amount: Math.max(previewData.total, 0),
			variant: "primary" as const,
		});

		if (previewData.next_cycle) {
			totals.push({
				label: "Next Cycle",
				amount: previewData.next_cycle.total,
				variant: "secondary" as const,
				badge: previewData.next_cycle.starts_at
					? format(new Date(previewData.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}
	}

	if (!hasChanges) return null;

	if (error) {
		return (
			<SheetSection title="Pricing Preview" withSeparator>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	return (
		<>
			{previewData && hasCreditIndicator && !isLoading && (
				<SheetSection withSeparator={false} className="pb-0">
					<InfoBox variant="note">
						This update includes{" "}
						<span className="text-foreground font-medium">
							{formattedCreditAmount}
						</span>{" "}
						in invoice credits.
					</InfoBox>
				</SheetSection>
			)}
			<LineItemsPreview
				title="Pricing Preview"
				isLoading={isLoading}
				lineItems={previewData?.line_items}
				currency={previewData?.currency}
				totals={totals}
				filterZeroAmounts
			/>
		</>
	);
}
