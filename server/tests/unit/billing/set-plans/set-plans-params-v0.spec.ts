/** set_plans params accept proration_behavior, a timestamp anchor and ends_at but reject billing_behavior, which create_schedule maps onto proration_behavior. */

import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	type CreateScheduleParamsV0,
	CreateScheduleParamsV0Schema,
	SetPlansParamsV0Schema,
} from "@autumn/shared";
import chalk from "chalk";
import { createScheduleParamsToSetPlansParams } from "@/internal/billing/v2/actions/setPlans/utils/createScheduleParamsToSetPlansParams";
import { buildStripeNewSubscriptionAnchorParams } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeNewSubscriptionAnchorParams";

const OLD_START_MS = 1_780_000_000_000;
const OLD_PERIOD_END_MS = 1_782_000_000_000;
const NOW_MS = 1_781_000_000_000;

const resyncRequest = {
	customer_id: "cus_123",
	billing_cycle_anchor: OLD_PERIOD_END_MS,
	proration_behavior: "none",
	ends_at: 1_790_000_000_000,
	phases: [{ starts_at: OLD_START_MS, plans: [{ plan_id: "pro" }] }],
};

describe(chalk.yellowBright("SetPlansParamsV0Schema"), () => {
	test("accepts a timestamp anchor, proration_behavior and ends_at", () => {
		const parsed = SetPlansParamsV0Schema.parse(resyncRequest);

		expect(parsed).toMatchObject({
			billing_cycle_anchor: OLD_PERIOD_END_MS,
			proration_behavior: "none",
			ends_at: 1_790_000_000_000,
			redirect_mode: "if_required",
		});
	});

	test("accepts anchor now", () => {
		const parsed = SetPlansParamsV0Schema.parse({
			...resyncRequest,
			billing_cycle_anchor: "now",
		});

		expect(parsed.billing_cycle_anchor).toBe("now");
	});

	test("rejects billing_behavior and points to proration_behavior", () => {
		const result = SetPlansParamsV0Schema.safeParse({
			customer_id: "cus_123",
			billing_behavior: "none",
			phases: [{ starts_at: "now", plans: [{ plan_id: "pro" }] }],
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(["billing_behavior"]);
		expect(result.error?.issues[0]?.message).toBe(
			"billing_behavior is not supported by set_plans. Use proration_behavior instead.",
		);
	});

	test("keeps the phase timing rules", () => {
		expect(() =>
			SetPlansParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{ starts_at: 1_000, plans: [{ plan_id: "base" }] },
					{ starts_at: 1_000, plans: [{ plan_id: "pro" }] },
				],
			}),
		).toThrow("Phase starts_at values must be strictly increasing");
	});

	test("rejects an empty stripe_subscription_id instead of editing every subscription", () => {
		const result = SetPlansParamsV0Schema.safeParse({
			...resyncRequest,
			stripe_subscription_id: "",
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(["stripe_subscription_id"]);
	});
});

describe(chalk.yellowBright("createScheduleParamsToSetPlansParams"), () => {
	test("renames legacy billing_behavior and retains plans create_schedule doesn't list", () => {
		const legacy: CreateScheduleParamsV0 = CreateScheduleParamsV0Schema.parse({
			customer_id: "cus_123",
			billing_behavior: "none",
			billing_cycle_anchor: "now",
			phases: [{ starts_at: OLD_START_MS, plans: [{ plan_id: "pro" }] }],
		});

		expect(createScheduleParamsToSetPlansParams({ params: legacy })).toEqual({
			customer_id: "cus_123",
			proration_behavior: "none",
			billing_cycle_anchor: "now",
			redirect_mode: "if_required",
			undeclared_plans: "retain",
			phases: [{ starts_at: OLD_START_MS, plans: [{ plan_id: "pro" }] }],
		});
	});

	test("passes set_plans params through unchanged, policy included", () => {
		const params = SetPlansParamsV0Schema.parse({
			...resyncRequest,
			undeclared_plans: "end",
		});

		expect(createScheduleParamsToSetPlansParams({ params })).toEqual({
			customer_id: "cus_123",
			billing_cycle_anchor: OLD_PERIOD_END_MS,
			proration_behavior: "none",
			ends_at: 1_790_000_000_000,
			redirect_mode: "if_required",
			undeclared_plans: "end",
			phases: [{ starts_at: OLD_START_MS, plans: [{ plan_id: "pro" }] }],
		});
	});
});

describe(chalk.yellowBright("buildStripeNewSubscriptionAnchorParams"), () => {
	test("anchors a new subscription on a future anchor with proration none", () => {
		const billingContext = {
			billingCycleAnchorMs: OLD_PERIOD_END_MS,
			currentEpochMs: NOW_MS,
			requestedProrationBehavior: "none",
		} as BillingContext;

		expect(buildStripeNewSubscriptionAnchorParams({ billingContext })).toEqual({
			billing_cycle_anchor: OLD_PERIOD_END_MS / 1000,
			proration_behavior: "none",
		});
	});
});
