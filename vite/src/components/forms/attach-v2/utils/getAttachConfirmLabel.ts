import { addHours, isAfter } from "date-fns";
import { isFutureStartDate } from "./buildAttachPreviewTotals";

export function getAttachConfirmLabel({
	previewData,
	startDate,
	now,
}: {
	previewData:
		| {
				redirect_to_checkout: boolean;
				total: number;
				outgoing?: { effective_at: number | null }[];
		  }
		| null
		| undefined;
	startDate: number | null;
	now?: number;
}) {
	if (!previewData) return "Attach Plan";
	if (isFutureStartDate(startDate, now)) return "Preview Schedule";
	if (previewData.redirect_to_checkout) return "Generate Checkout URL";

	const sixHoursFromNow = addHours(now ?? Date.now(), 6);
	const isScheduled = previewData.outgoing?.some(
		(change) =>
			change.effective_at !== null &&
			isAfter(change.effective_at, sixHoursFromNow),
	);
	if (isScheduled) return "Schedule Change";
	if (previewData.total <= 0) return "Attach Plan";
	return "Charge Customer";
}
