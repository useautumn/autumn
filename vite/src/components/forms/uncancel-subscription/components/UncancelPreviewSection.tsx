import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { buildPreviewTotals } from "@/components/forms/shared/utils/buildPreviewTotals";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";

export function UncancelPreviewSection() {
	const { previewQuery } = useUpdateSubscriptionFormContext();

	return (
		<PreviewSection
			previewQuery={previewQuery}
			totals={buildPreviewTotals({
				previewData: previewQuery.data,
				includeTotalDue: false,
				nextCycleVariant: "primary",
			})}
		/>
	);
}
