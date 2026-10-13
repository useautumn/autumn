import { expect } from "bun:test";
import {
	type AttachPreviewResponse,
	applyProration,
	type CreateScheduleParamsV0Input,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { Decimal } from "decimal.js";

export const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);

export const expectCloseToCents = ({
	actual,
	expected,
}: {
	actual: number;
	expected: number;
}) =>
	expect(
		Math.abs(actual - expected) < 0.01,
		`expected ${actual} to be within 0.01 of ${expected}`,
	).toBe(true);

export const proratedDelta = ({
	oldAmount,
	newAmount,
	start,
	end,
	transitionAt,
}: {
	oldAmount: number;
	newAmount: number;
	start: number;
	end: number;
	transitionAt: number;
}) =>
	new Decimal(
		applyProration({
			now: transitionAt,
			billingPeriod: { start, end },
			amount: newAmount,
		}),
	)
		.minus(
			applyProration({
				now: transitionAt,
				billingPeriod: { start, end },
				amount: oldAmount,
			}),
		)
		.toDecimalPlaces(2)
		.toNumber();

export const expectPreviewToMatchCreateSchedule = async ({
	autumnV1,
	params,
	expectedTotal,
	expectedLineItemTotals,
	assertPreview,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
	expectedTotal?: number;
	expectedLineItemTotals?: number[];
	assertPreview?: (preview: AttachPreviewResponse) => void;
}) => {
	const preview = await previewCreateSchedule({ autumnV1, params });

	if (expectedTotal !== undefined) {
		expect(preview.total).toBe(expectedTotal);
		expect(preview.subtotal).toBe(expectedTotal);
	}
	if (expectedLineItemTotals) {
		expect(
			sortNumbers(preview.line_items.map((lineItem) => lineItem.total)),
		).toEqual(sortNumbers(expectedLineItemTotals));
	}
	expect(
		preview.line_items.reduce((sum, lineItem) => sum + lineItem.total, 0),
	).toBe(preview.total);

	assertPreview?.(preview);

	const response = await autumnV1.billing.createSchedule(params);

	expect(response.status).toBe("created");
	expect(response.invoice?.total ?? 0).toBe(preview.total);
};
