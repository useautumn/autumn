/**
 * multiUpdate / update subscription params: subscription_params bag +
 * refund_last_payment refinements.
 *
 * Contract:
 *   New types/fields:
 *     updates[].subscription_params?: Record<string, unknown>
 *     update.subscription_params?: Record<string, unknown>
 *   Kept:
 *     refund_last_payment cannot pair with proration_behavior
 *     refund_last_payment requires cancel_immediately
 *   Removed:
 *     cancellation_details / Autumn reason+details rename
 */

import { describe, expect, test } from "bun:test";
import {
	ExtMultiUpdateParamsV0Schema,
	type MultiUpdateItemV0,
	type MultiUpdateParamsV0,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { multiUpdateItemToParams } from "@/internal/billing/v2/actions/multiUpdate/setup/setupMultiUpdateItemParams";
import chalk from "chalk";

const parseMultiUpdate = (updates: Array<Record<string, unknown>>) =>
	ExtMultiUpdateParamsV0Schema.safeParse({
		customer_id: "cus_123",
		updates,
	});

const stripeSubscriptionParams = {
	cancellation_details: {
		feedback: "too_expensive",
		comment: "Switching to a competitor",
	},
};

describe(chalk.yellowBright("multiUpdate cancel param schema"), () => {
	test("rejects refund_last_payment with proration_behavior", () => {
		const result = parseMultiUpdate([
			{
				plan_id: "pro",
				cancel_action: "cancel_immediately",
				refund_last_payment: "full",
				proration_behavior: "prorate_immediately",
			},
		]);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.message).toInclude(
			"Cannot pass both proration_behavior and refund_last_payment",
		);
	});

	test("rejects refund_last_payment unless cancel_immediately", () => {
		const result = parseMultiUpdate([
			{
				plan_id: "pro",
				cancel_action: "cancel_end_of_cycle",
				refund_last_payment: "full",
			},
		]);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.message).toInclude(
			"refund_last_payment requires cancel_action to be 'cancel_immediately'",
		);
	});

	test("accepts refund_last_payment on immediate cancel", () => {
		const result = parseMultiUpdate([
			{
				plan_id: "pro",
				cancel_action: "cancel_immediately",
				refund_last_payment: "full",
			},
		]);

		expect(result.success).toBe(true);
	});

	test("accepts subscription_params on end-of-cycle cancel", () => {
		const result = parseMultiUpdate([
			{
				plan_id: "pro",
				cancel_action: "cancel_end_of_cycle",
				subscription_params: stripeSubscriptionParams,
			},
		]);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.updates[0]?.subscription_params).toEqual(
			stripeSubscriptionParams,
		);
	});

	test("accepts subscription_params on immediate cancel", () => {
		const result = parseMultiUpdate([
			{
				plan_id: "pro",
				cancel_action: "cancel_immediately",
				refund_last_payment: "prorated",
				subscription_params: stripeSubscriptionParams,
			},
		]);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.updates[0]?.subscription_params).toEqual(
			stripeSubscriptionParams,
		);
	});
});

describe(chalk.yellowBright("update subscription param schema"), () => {
	test("V1 accepts subscription_params", () => {
		const result = UpdateSubscriptionV1ParamsSchema.safeParse({
			customer_id: "cus_123",
			plan_id: "pro",
			cancel_action: "cancel_end_of_cycle",
			subscription_params: stripeSubscriptionParams,
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.subscription_params).toEqual(stripeSubscriptionParams);
	});

	test("V0 accepts subscription_params", () => {
		const result = UpdateSubscriptionV0ParamsSchema.safeParse({
			customer_id: "cus_123",
			product_id: "pro",
			cancel_action: "cancel_end_of_cycle",
			subscription_params: stripeSubscriptionParams,
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.subscription_params).toEqual(stripeSubscriptionParams);
	});
});

describe(chalk.yellowBright("multiUpdateItemToParams"), () => {
	test("copies subscription_params onto update params", () => {
		const params = {
			customer_id: "cus_123",
		} as MultiUpdateParamsV0;
		const item = {
			plan_id: "pro",
			cancel_action: "cancel_end_of_cycle",
			subscription_params: stripeSubscriptionParams,
		} as MultiUpdateItemV0;

		expect(
			multiUpdateItemToParams({ params, item }).subscription_params,
		).toEqual(stripeSubscriptionParams);
	});
});
