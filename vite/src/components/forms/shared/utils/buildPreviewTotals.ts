import { addMinutes, format, isAfter } from "date-fns";

export type PreviewTotalsInput = {
	total: number;
	next_cycle?: { total: number; starts_at?: number | null } | null;
	refund?: {
		amount: number;
		invoice: { current_refunded_amount: number };
	} | null;
} | null;

const FUTURE_START_TOLERANCE_MINUTES = 1;

export interface PreviewTotal {
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

export function buildPreviewTotals({
	previewData,
	startDate = null,
	refundBehavior = null,
	includeTotalDue = true,
	includeNextCycle = true,
	nextCycleVariant = "secondary",
	now = Date.now(),
}: {
	previewData: PreviewTotalsInput | undefined;
	startDate?: number | null;
	refundBehavior?: string | null;
	includeTotalDue?: boolean;
	includeNextCycle?: boolean;
	nextCycleVariant?: "primary" | "secondary";
	now?: number;
}): PreviewTotal[] {
	if (!previewData) return [];

	const refund = previewData.refund;
	if (refundBehavior === "refund" && refund) {
		const rows: PreviewTotal[] = [];
		if (refund.invoice.current_refunded_amount > 0) {
			rows.push({
				label: "Previously Refunded",
				amount: -refund.invoice.current_refunded_amount,
				variant: "secondary",
			});
		}
		rows.push({
			label: "Refund Amount",
			amount: -refund.amount,
			variant: "primary",
		});
		return rows;
	}

	if (isFutureStartDate(startDate, now)) {
		return [
			{
				label: `Total Due ${formatDate(startDate)}`,
				amount: Math.max(previewData.next_cycle?.total ?? previewData.total, 0),
				variant: "primary",
			},
		];
	}

	const rows: PreviewTotal[] = [];

	if (includeTotalDue) {
		const isCredit = previewData.total < 0;
		let label = "Total Due Now";
		if (isCredit && refundBehavior !== null) {
			label = refundBehavior === "refund" ? "Refund Amount" : "Credit Amount";
		}
		rows.push({
			label,
			amount:
				refundBehavior === null
					? Math.max(previewData.total, 0)
					: previewData.total,
			variant: "primary",
		});
	}

	if (includeNextCycle && previewData.next_cycle) {
		rows.push({
			label: "Next Cycle",
			amount: previewData.next_cycle.total,
			variant: nextCycleVariant,
			badge: previewData.next_cycle.starts_at
				? formatDate(previewData.next_cycle.starts_at)
				: undefined,
		});
	}

	return rows;
}
