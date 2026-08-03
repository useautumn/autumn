import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";

export function UncancelPreviewSection() {
	const { previewQuery } = useUpdateSubscriptionFormContext();

	return (
		<PreviewSection
			previewQuery={previewQuery}
			totalDue="none"
			nextCycleVariant="primary"
		/>
	);
}
