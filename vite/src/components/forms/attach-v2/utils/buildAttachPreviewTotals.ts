import type { AttachPreviewResponse } from "@autumn/shared";
import { addMinutes, format, isAfter } from "date-fns";

const FUTURE_START_TOLERANCE_MINUTES = 1;

export interface AttachPreviewTotal {
	label: string;
	amount: number;
	variant: "primary" | "secondary";
	badge?: string;
}

const formatDate = (unixMs: number) => format(new Date(unixMs), "MMM d, yyyy");

export const isFutureStartDate = (
	startDate: number | null,
	now = Date.now(),
): startDate is number =>
	startDate !== null &&
	isAfter(startDate, addMinutes(now, FUTURE_START_TOLERANCE_MINUTES));

/**
 * Builds the totals rows for the Attach pricing preview.
 * Future startDate → single "Total Due [date]" row using the next-cycle amount.
 * Otherwise → "Total Due Now" + optional "Next Cycle" row.
 */
export function buildAttachPreviewTotals({
	previewData,
	startDate,
	now = Date.now(),
}: {
	previewData: AttachPreviewResponse | null | undefined;
	startDate: number | null;
	now?: number;
}): AttachPreviewTotal[] {
	if (!previewData) return [];

	if (isFutureStartDate(startDate, now)) {
		return [
			{
				label: `Total Due ${formatDate(startDate)}`,
				amount: Math.max(previewData.next_cycle?.total ?? previewData.total, 0),
				variant: "primary",
			},
		];
	}

	const totals: AttachPreviewTotal[] = [
		{
			label: "Total Due Now",
			amount: Math.max(previewData.total, 0),
			variant: "primary",
		},
	];

	if (previewData.next_cycle) {
		totals.push({
			label: "Next Cycle",
			amount: previewData.next_cycle.total,
			variant: "secondary",
			badge: previewData.next_cycle.starts_at
				? formatDate(previewData.next_cycle.starts_at)
				: undefined,
		});
	}

	return totals;
}
