import { describe, expect, test } from "bun:test";
import type { Reward } from "@autumn/shared";
import { CouponDurationType, RewardType } from "@autumn/shared";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";
import { findBlockingDiscount } from "./validateInvoiceDiscounts";

const reward = ({
	id,
	type,
	durationType = CouponDurationType.OneOff,
}: {
	id: string;
	type: RewardType;
	durationType?: CouponDurationType;
}) =>
	({
		id,
		type,
		discount_config: { duration_type: durationType, discount_value: 10 },
	}) as Reward;

const form = (
	overrides: Partial<CreateInvoiceForm> = {},
): CreateInvoiceForm => ({
	plans: [],
	customLineItems: [],
	discounts: [],
	invoiceTemplateId: null,
	netTermsDays: null,
	taxRateId: null,
	periodStart: null,
	periodEnd: null,
	issueDay: null,
	dueDay: null,
	...overrides,
});

const plan = (overrides: Partial<CreateInvoiceForm["plans"][number]> = {}) => ({
	_id: "p1",
	planId: "pro",
	version: undefined,
	items: null,
	isCustom: false,
	featureQuantities: {},
	featureUsage: {},
	licenses: [],
	prorate: undefined,
	...overrides,
});

describe("findBlockingDiscount", () => {
	test("passes when rewards have not loaded", () => {
		expect(findBlockingDiscount({ form: form() })).toBeNull();
	});

	test("blocks a repeating coupon", () => {
		const reason = findBlockingDiscount({
			form: form({ discounts: [{ _id: "d1", reward_id: "monthly" }] }),
			rewardsById: new Map([
				[
					"monthly",
					reward({
						id: "monthly",
						type: RewardType.PercentageDiscount,
						durationType: CouponDurationType.Months,
					}),
				],
			]),
		});

		expect(reason).toContain("repeats monthly");
	});

	test("allows a fixed coupon at the invoice level", () => {
		const reason = findBlockingDiscount({
			form: form({
				discounts: [{ _id: "d1", reward_id: "fixed50" }],
				plans: [plan({ featureQuantities: { seats: 5 } })],
			}),
			rewardsById: new Map([
				["fixed50", reward({ id: "fixed50", type: RewardType.FixedDiscount })],
			]),
		});

		expect(reason).toBeNull();
	});
});
