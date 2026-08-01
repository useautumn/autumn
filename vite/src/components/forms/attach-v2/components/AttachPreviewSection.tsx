import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { buildPreviewTotals } from "@/components/forms/shared/utils/buildPreviewTotals";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachPreviewLineItems } from "../utils/buildAttachPreviewTotals";

export function AttachPreviewSection() {
	const { previewQuery, formValues, isAutoSelectingImmediateSchedule } =
		useAttachFormContext();

	const { startDate } = formValues;
	const previewData = previewQuery.data;

	return (
		<PreviewSection
			previewQuery={previewQuery}
			hidden={!formValues.productId}
			isLoading={previewQuery.isLoading || isAutoSelectingImmediateSchedule}
			suppressErrorWhileLoading
			lineItems={getAttachPreviewLineItems({ previewData, startDate })}
			totals={buildPreviewTotals({ previewData, startDate })}
		/>
	);
}
