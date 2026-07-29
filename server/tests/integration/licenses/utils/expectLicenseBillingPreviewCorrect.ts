import { expect } from "bun:test";
import type { BillingPreviewResponse } from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateProratedDiff,
	calculateProrationFromPeriod,
	getBillingPeriod,
} from "@tests/integration/billing/utils/proration";

type LicenseBillingPreview = Pick<
	BillingPreviewResponse,
	"total" | "next_cycle" | "line_items"
>;

export const expectLicenseAttachPreviewCorrect = ({
	preview,
	total,
}: {
	preview: LicenseBillingPreview;
	total: number;
}) => {
	expect(preview.total).toEqual(total);
	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});
};

const quantityLabel = (quantity: number) => `${quantity}x Base Price`;

/** Quantity updates bill previous vs new picture as a refund/charge pair;
 * a pair that nets to zero is dropped entirely, and a zero-quantity side
 * emits no line at all. Lines read like feature-usage lines:
 * "[Unused ]<name> - <qty>x Base Price (from ... to ...)". */
export const expectQuantityLineItemPairCorrect = ({
	preview,
	proratedOldTotal,
	proratedNewTotal,
	oldQuantity,
	newQuantity,
}: {
	preview: LicenseBillingPreview;
	proratedOldTotal: number;
	proratedNewTotal: number;
	oldQuantity?: number;
	newQuantity?: number;
}) => {
	if (Math.abs(proratedOldTotal - proratedNewTotal) <= 0.01) {
		expect(preview.line_items).toHaveLength(0);
		return;
	}

	// Line item totals are unrounded server-side; match to the cent.
	const findByTotal = (total: number) =>
		preview.line_items.find(
			(lineItem) => Math.abs(lineItem.total - total) <= 0.01,
		);
	const actualTotals = preview.line_items.map((lineItem) => lineItem.total);

	const expectedCount =
		(proratedOldTotal > 0 ? 1 : 0) + (proratedNewTotal > 0 ? 1 : 0);
	expect(actualTotals).toHaveLength(expectedCount);

	if (proratedOldTotal > 0) {
		const refund = findByTotal(-proratedOldTotal);
		expect(
			refund,
			`expected refund line with total ${-proratedOldTotal}, got [${actualTotals.join(", ")}]`,
		).toBeDefined();
		expect(refund?.description).toMatch(/^Unused /);
		if (oldQuantity !== undefined) {
			expect(refund?.description).toContain(
				`- ${quantityLabel(oldQuantity)} (from`,
			);
		}
	}

	if (proratedNewTotal > 0) {
		const charge = findByTotal(proratedNewTotal);
		expect(
			charge,
			`expected charge line with total ${proratedNewTotal}, got [${actualTotals.join(", ")}]`,
		).toBeDefined();
		expect(charge?.description).not.toMatch(/^Unused /);
		if (newQuantity !== undefined) {
			expect(charge?.description).toContain(
				`- ${quantityLabel(newQuantity)} (from`,
			);
		}
	}
};

export const expectLicenseUpdatePreviewCorrect = async ({
	preview,
	customerId,
	advancedTo,
	oldRecurringTotal,
	newRecurringTotal,
	expectQuantityLineItemPair = false,
}: {
	preview: LicenseBillingPreview;
	customerId: string;
	advancedTo: number;
	oldRecurringTotal: number;
	newRecurringTotal: number;
	/** On for license_quantities updates: asserts the previous/new pair.
	 * Pass quantities to also pin the line descriptions. */
	expectQuantityLineItemPair?:
		| boolean
		| { oldQuantity?: number; newQuantity?: number };
}) => {
	const [expectedTotal, { billingPeriod }] = await Promise.all([
		calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: oldRecurringTotal,
			newAmount: newRecurringTotal,
		}),
		getBillingPeriod({ customerId }),
	]);

	expect(preview.total).toEqual(expectedTotal);
	if (expectQuantityLineItemPair) {
		const pairQuantities =
			typeof expectQuantityLineItemPair === "object"
				? expectQuantityLineItemPair
				: {};
		expectQuantityLineItemPairCorrect({
			preview,
			proratedOldTotal: calculateProrationFromPeriod({
				billingPeriod,
				advancedTo,
				amount: oldRecurringTotal,
			}),
			proratedNewTotal: calculateProrationFromPeriod({
				billingPeriod,
				advancedTo,
				amount: newRecurringTotal,
			}),
			...pairQuantities,
		});
	}
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: billingPeriod.end,
		total: newRecurringTotal,
		toleranceMs: 1000,
	});
};
