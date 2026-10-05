/** set_plans sets proration and the billing cycle anchor per phase; create_schedule keeps them on the request and maps them onto the first phase. */

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

const resyncFirstPhase = {
	starts_at: OLD_START_MS,
	billing_cycle_anchor: OLD_PERIOD_END_MS,
	proration_behavior: "none" as const,
	plans: [{ plan_id: "pro" }],
};

const resyncRequest = {
	customer_id: "cus_123",
	ends_at: 1_790_000_000_000,
	phases: [resyncFirstPhase],
};

const laterPhase = (fields: Record<string, unknown>) => ({
	starts_at: OLD_PERIOD_END_MS,
	plans: [{ plan_id: "pro" }],
	...fields,
});

describe(chalk.yellowBright("SetPlansParamsV0Schema"), () => {
	test("accepts a first phase with a timestamp anchor, any proration and ends_at", () => {
		const parsed = SetPlansParamsV0Schema.parse({
			...resyncRequest,
			phases: [{ ...resyncFirstPhase, proration_behavior: "bill_difference" }],
		});

		expect(parsed.phases[0]).toMatchObject({
			billing_cycle_anchor: OLD_PERIOD_END_MS,
			proration_behavior: "bill_difference",
		});
		expect(parsed.ends_at).toBe(1_790_000_000_000);
	});

	test("accepts phase_start and prorate_immediately or none on a later phase", () => {
		const parsed = SetPlansParamsV0Schema.parse({
			...resyncRequest,
			phases: [
				resyncFirstPhase,
				laterPhase({
					billing_cycle_anchor: "phase_start",
					proration_behavior: "none",
				}),
			],
		});

		expect(parsed.phases[1]).toMatchObject({
			billing_cycle_anchor: "phase_start",
			proration_behavior: "none",
		});
	});

	test("rejects bill_difference and a timestamp anchor on a later phase", () => {
		const result = SetPlansParamsV0Schema.safeParse({
			...resyncRequest,
			phases: [
				resyncFirstPhase,
				laterPhase({
					billing_cycle_anchor: OLD_PERIOD_END_MS,
					proration_behavior: "bill_difference",
				}),
			],
		});

		expect(result.error?.issues.map((issue) => issue.path)).toEqual([
			["phases", 1, "proration_behavior"],
			["phases", 1, "billing_cycle_anchor"],
		]);
	});

	test("create_schedule keeps the first phase's billing on the request", () => {
		const result = CreateScheduleParamsV0Schema.safeParse({
			customer_id: "cus_123",
			phases: [resyncFirstPhase],
		});

		expect(result.error?.issues.map((issue) => issue.message)).toEqual([
			"proration_behavior cannot be set on the first phase. Use the top-level billing_behavior instead.",
			"A timestamp billing_cycle_anchor cannot be set on the first phase. Use the top-level billing_cycle_anchor instead.",
		]);
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
	test("moves billing_behavior and the anchor onto the first phase and retains unlisted plans", () => {
		const legacy: CreateScheduleParamsV0 = CreateScheduleParamsV0Schema.parse({
			customer_id: "cus_123",
			billing_behavior: "none",
			billing_cycle_anchor: "now",
			phases: [{ starts_at: OLD_START_MS, plans: [{ plan_id: "pro" }] }],
		});

		expect(createScheduleParamsToSetPlansParams({ params: legacy })).toEqual({
			customer_id: "cus_123",
			redirect_mode: "if_required",
			undeclared_plans: "retain",
			phases: [
				{
					starts_at: OLD_START_MS,
					plans: [{ plan_id: "pro" }],
					proration_behavior: "none",
					billing_cycle_anchor: "phase_start",
				},
			],
		});
	});

	test("passes set_plans params through unchanged, policy included", () => {
		const params = SetPlansParamsV0Schema.parse({
			...resyncRequest,
			undeclared_plans: "end",
		});

		expect(createScheduleParamsToSetPlansParams({ params })).toEqual({
			customer_id: "cus_123",
			ends_at: 1_790_000_000_000,
			redirect_mode: "if_required",
			undeclared_plans: "end",
			phases: [resyncFirstPhase],
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
