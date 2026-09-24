import { describe, expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { assignInvoiceDiscounts } from "@/internal/invoices/actions/create/evaluate/assignInvoiceDiscounts";

// Two lines under plan "pro", one under plan "support".
const lines = [
	{ lineId: "li_pro_base", planKey: "pro" },
	{ lineId: "li_pro_usage", planKey: "pro" },
	{ lineId: "li_support_base", planKey: "support" },
];

describe("assignInvoiceDiscounts", () => {
	test("invoice-level discounts apply to the invoice, not to lines", () => {
		const assigned = assignInvoiceDiscounts({
			lines,
			invoiceDiscounts: [discounts.tenPercentOff()],
			planDiscounts: {},
		});
		expect(assigned.invoiceCouponIds).toEqual(["coupon_10_percent"]);
		expect(assigned.lineCouponIds).toEqual({});
	});

	test("a percent discount nested under a plan lands on each of that plan's lines only", () => {
		const assigned = assignInvoiceDiscounts({
			lines,
			invoiceDiscounts: [],
			planDiscounts: { pro: [discounts.twentyPercentOff()] },
		});
		expect(assigned.lineCouponIds).toEqual({
			li_pro_base: ["coupon_20_percent"],
			li_pro_usage: ["coupon_20_percent"],
		});
		expect(assigned.lineCouponIds.li_support_base).toBeUndefined();
	});

	test("a fixed-amount discount nested under a plan with one line lands on that line", () => {
		const assigned = assignInvoiceDiscounts({
			lines,
			invoiceDiscounts: [],
			planDiscounts: { support: [discounts.tenDollarsOff()] },
		});
		expect(assigned.lineCouponIds).toEqual({
			li_support_base: ["coupon_10_off"],
		});
	});

	test("a fixed-amount discount nested under a plan with several lines is rejected", () => {
		expect(() =>
			assignInvoiceDiscounts({
				lines,
				invoiceDiscounts: [],
				planDiscounts: { pro: [discounts.tenDollarsOff()] },
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});

	test("invoice-level and nested discounts can coexist", () => {
		const assigned = assignInvoiceDiscounts({
			lines,
			invoiceDiscounts: [discounts.tenPercentOff()],
			planDiscounts: { pro: [discounts.twentyPercentOff()] },
		});
		expect(assigned.invoiceCouponIds).toEqual(["coupon_10_percent"]);
		expect(Object.keys(assigned.lineCouponIds)).toEqual([
			"li_pro_base",
			"li_pro_usage",
		]);
	});
});
