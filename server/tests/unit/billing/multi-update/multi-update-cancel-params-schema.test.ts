import { describe, expect, test } from "bun:test";
import { ExtMultiUpdateParamsV0Schema } from "@autumn/shared";
import chalk from "chalk";

const parseUpdates = (updates: Array<Record<string, unknown>>) =>
	ExtMultiUpdateParamsV0Schema.safeParse({
		customer_id: "cus_123",
		updates,
	});

describe(chalk.yellowBright("multiUpdate cancel param schema"), () => {
	test("rejects refund_last_payment with proration_behavior", () => {
		const result = parseUpdates([
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
		const result = parseUpdates([
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

	test("rejects cancellation_details on uncancel", () => {
		const result = parseUpdates([
			{
				plan_id: "pro",
				cancel_action: "uncancel",
				cancellation_details: { reason: "too_expensive" },
			},
		]);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.message).toInclude(
			"cancellation_details cannot be passed when cancel_action is 'uncancel'",
		);
	});

	test("rejects empty cancellation_details", () => {
		const result = parseUpdates([
			{
				plan_id: "pro",
				cancel_action: "cancel_end_of_cycle",
				cancellation_details: {},
			},
		]);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]?.message).toInclude(
			"cancellation_details requires reason or details",
		);
	});

	test("accepts refund_last_payment on immediate cancel", () => {
		const result = parseUpdates([
			{
				plan_id: "pro",
				cancel_action: "cancel_immediately",
				refund_last_payment: "full",
			},
		]);

		expect(result.success).toBe(true);
	});

	test("accepts cancellation_details on end-of-cycle cancel", () => {
		const result = parseUpdates([
			{
				plan_id: "pro",
				cancel_action: "cancel_end_of_cycle",
				cancellation_details: {
					reason: "too_expensive",
					details: "Switching to a competitor",
				},
			},
		]);

		expect(result.success).toBe(true);
	});
});
