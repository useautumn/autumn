import type { AxiosError } from "axios";
import { format } from "date-fns";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import { PreviewErrorDisplay } from "./PreviewErrorDisplay";

export function UpdateSubscriptionPreviewSection() {
	const { previewQuery, hasChanges } = useUpdateSubscriptionFormContext();

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const totals = [];

	if (previewData) {
		totals.push({
			label: "Total Due Now",
			amount: previewData.total,
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
