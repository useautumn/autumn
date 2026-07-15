import type { AxiosError } from "axios";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import {
	buildAttachPreviewTotals,
	getAttachPreviewLineItems,
} from "../utils/buildAttachPreviewTotals";

export function AttachPreviewSection() {
	const { previewQuery, formValues, isAutoSelectingImmediateSchedule } =
		useAttachFormContext();

	const hasProductSelected = !!formValues.productId;

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const totals = buildAttachPreviewTotals({
		previewData,
		startDate: formValues.startDate,
	});
	const lineItems = getAttachPreviewLineItems({
		previewData,
		startDate: formValues.startDate,
	});

	if (!hasProductSelected) return null;

	if (error && !isLoading && !isAutoSelectingImmediateSchedule) {
		return (
			<SheetSection title="Pricing Preview" withSeparator>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	return (
		<LineItemsPreview
			title="Pricing Preview"
			isLoading={isLoading || isAutoSelectingImmediateSchedule}
			lineItems={lineItems}
			currency={previewData?.currency}
			totals={totals}
			filterZeroAmounts
		/>
	);
}
