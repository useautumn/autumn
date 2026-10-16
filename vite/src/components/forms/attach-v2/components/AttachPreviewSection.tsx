import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { useAttachFormContext } from "../context/AttachFormProvider";
import {
	getAttachPreviewLineItems,
	isFutureStartDate,
} from "../utils/buildAttachPreviewTotals";

export function AttachPreviewSection() {
	const {
		previewQuery,
		formValues,
		additionalPlans,
		isAutoSelectingImmediateSchedule,
		lineEdits,
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
			lineEdits={
				lineEdits.enabled && !isFutureStartDate(startDate, Date.now())
					? lineEdits
					: undefined
			}
			lineItems={getAttachPreviewLineItems({
				previewData: previewQuery.data,
				startDate,
			})}
		/>
	);
}
