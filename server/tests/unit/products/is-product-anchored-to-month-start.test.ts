/**
 * `anchor_to_month_start` needs a monthly-or-longer cycle to anchor.
 *
 * Red (current):  a free plan whose only cycle is a weekly allowance is treated as
 *                 anchored, so its resets move off their weekday onto the 1st's grid.
 * Green (after):  paid plans decide by billing interval, free plans by reset interval;
 *                 weekly-only plans keep their own day.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	EntInterval,
	type FullProduct,
	isProductAnchoredToMonthStart,
} from "@autumn/shared";

const flaggedProduct = ({
	priceIntervals = [],
	resetIntervals = [],
	flag = true,
}: {
	priceIntervals?: BillingInterval[];
	resetIntervals?: EntInterval[];
	flag?: boolean;
}): FullProduct =>
	({
		config: { anchor_to_month_start: flag },
		prices: priceIntervals.map((interval) => ({
			config: { type: "fixed", interval, amount: 20 },
		})),
		entitlements: resetIntervals.map((interval) => ({ interval })),
	}) as unknown as FullProduct;

describe("is-product-anchored-to-month-start", () => {
	test("flag off is never anchored", () => {
		const product = flaggedProduct({
			priceIntervals: [BillingInterval.Month],
			flag: false,
		});
		expect(isProductAnchoredToMonthStart({ product })).toBe(false);
	});

	test("monthly price anchors", () => {
		const product = flaggedProduct({ priceIntervals: [BillingInterval.Month] });
		expect(isProductAnchoredToMonthStart({ product })).toBe(true);
	});

	test("weekly price keeps its own day", () => {
		const product = flaggedProduct({ priceIntervals: [BillingInterval.Week] });
		expect(isProductAnchoredToMonthStart({ product })).toBe(false);
	});

	test("free plan with a monthly allowance anchors", () => {
		const product = flaggedProduct({
			resetIntervals: [EntInterval.Week, EntInterval.Month],
		});
		expect(isProductAnchoredToMonthStart({ product })).toBe(true);
	});

	test("free plan with only weekly allowances keeps its own day", () => {
		const product = flaggedProduct({ resetIntervals: [EntInterval.Week] });
		expect(isProductAnchoredToMonthStart({ product })).toBe(false);
	});

	test("free plan with only lifetime allowances has nothing to anchor", () => {
		const product = flaggedProduct({ resetIntervals: [EntInterval.Lifetime] });
		expect(isProductAnchoredToMonthStart({ product })).toBe(false);
	});
});
