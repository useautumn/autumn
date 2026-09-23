import { expect } from "bun:test";
import type { BillingPreviewResponse } from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";

export const expectNextCycleHasNoRefundLines = ({
	preview,
	startsAt,
	total,
	toleranceMs = 1000,
}: {
	preview: Pick<BillingPreviewResponse, "next_cycle">;
	startsAt?: number;
	total?: number;
	toleranceMs?: number;
}) => {
	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		startsAt,
		total,
		toleranceMs,
	});
	if (!nextCycle) return;

	const refundLines = nextCycle.line_items.filter((lineItem) =>
		lineItem.description.startsWith("Unused "),
	);
	expect(
		refundLines.map((lineItem) => lineItem.description),
		"Next cycle should not credit a plan that ran its full period",
	).toEqual([]);

	const negativeLines = nextCycle.line_items.filter(
		(lineItem) => lineItem.total < 0,
	);
	expect(
		negativeLines.map((lineItem) => lineItem.description),
		"Next cycle should not contain negative line items",
	).toEqual([]);

	const sum = nextCycle.line_items.reduce(
		(running, lineItem) => running + lineItem.total,
		0,
	);
	expect(nextCycle.total, "Next cycle total should sum its line items").toEqual(
		sum,
	);
};

export const expectNextCycleHasRefundLines = ({
	preview,
}: {
	preview: Pick<BillingPreviewResponse, "next_cycle">;
}) => {
	const nextCycle = preview.next_cycle;
	expect(nextCycle, "Next cycle should be defined").toBeDefined();
	if (!nextCycle) return;

	const refundLines = nextCycle.line_items.filter((lineItem) =>
		lineItem.description.startsWith("Unused "),
	);
	expect(
		refundLines.length,
		"A mid-cycle transition still has unused time to credit",
	).toBeGreaterThan(0);
};
