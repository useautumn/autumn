import type { AttachPreviewResponse } from "@autumn/shared";

export { isFutureStartDate } from "@/components/forms/shared/utils/buildPreviewTotals";

import { isFutureStartDate } from "@/components/forms/shared/utils/buildPreviewTotals";

export const getAttachScheduledStartDate = ({
	startDate,
	previewData,
}: {
	startDate?: number | null;
	previewData: AttachPreviewResponse | null | undefined;
}): number | null => {
	if (startDate) return startDate;
	if (!previewData) return null;

	const incomingStartDate = previewData.incoming.find(
		(change) => change.effective_at !== null,
	)?.effective_at;
	if (incomingStartDate) return incomingStartDate;

	const outgoingStartDate = previewData.outgoing.find(
		(change) => change.effective_at !== null,
	)?.effective_at;
	return outgoingStartDate ?? previewData.next_cycle?.starts_at ?? null;
};

export const getAttachPreviewLineItems = ({
	previewData,
	startDate,
	now = Date.now(),
}: {
	previewData: AttachPreviewResponse | null | undefined;
	startDate: number | null;
	now?: number;
}) => {
	if (!previewData) return undefined;
	if (isFutureStartDate(startDate, now)) {
		return previewData.next_cycle?.line_items ?? previewData.line_items;
	}

	return previewData.line_items;
};
