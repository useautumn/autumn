import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachPreviewLineItems } from "../utils/buildAttachPreviewTotals";

export function AttachPreviewSection() {
	const {
		previewQuery,
		formValues,
		additionalPlans,
		isAutoSelectingImmediateSchedule,
	} = useAttachFormContext();

	// Multi-plan attaches always start immediately.
	const startDate = additionalPlans.isMultiPlan ? null : formValues.startDate;

	return (
		<PreviewSection
			previewQuery={previewQuery}
			hidden={!formValues.productId}
			isLoading={previewQuery.isLoading || isAutoSelectingImmediateSchedule}
			suppressErrorWhileLoading
			startDate={startDate}
			lineItems={getAttachPreviewLineItems({
				previewData: previewQuery.data,
				startDate,
			})}
		/>
	);
}
