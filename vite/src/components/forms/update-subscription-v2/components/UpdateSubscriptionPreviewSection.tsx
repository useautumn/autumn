import type { PreviewUpdateSubscriptionResponse } from "@autumn/shared";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";

interface UpdateSubscriptionPreviewSectionProps {
	isLoading: boolean;
	previewData?: PreviewUpdateSubscriptionResponse | null;
}

export function UpdateSubscriptionPreviewSection({
	isLoading,
	previewData,
}: UpdateSubscriptionPreviewSectionProps) {
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
			});
		}
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
