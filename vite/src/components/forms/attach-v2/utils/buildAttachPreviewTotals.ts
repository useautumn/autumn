import type { AttachPreviewResponse } from "@autumn/shared";
import { ms } from "@autumn/shared";
import { format } from "date-fns";

const FUTURE_START_TOLERANCE_MS = ms.minutes(1);

export interface AttachPreviewTotal {
	label: string;
	amount: number;
	variant: "primary" | "secondary";
	badge?: string;
}

const formatDate = (unixMs: number) => format(new Date(unixMs), "MMM d, yyyy");

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

	const isFutureStart =
		startDate !== null && startDate > now + FUTURE_START_TOLERANCE_MS;

	if (isFutureStart) {
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
