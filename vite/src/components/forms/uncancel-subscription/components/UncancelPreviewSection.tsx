import type { AxiosError } from "axios";
import { format } from "date-fns";
import { useMemo } from "react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";

export function UncancelPreviewSection() {
	const { previewQuery } = useUpdateSubscriptionFormContext();

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const totals = useMemo(() => {
		if (!previewData) return [];

		const result = [];

		if (previewData.next_cycle) {
			result.push({
				label: "Next Billing Cycle",
				amount: previewData.next_cycle.total,
				variant: "primary" as const,
				badge: previewData.next_cycle.starts_at
					? format(new Date(previewData.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}

		return result;
	}, [previewData]);

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
