/**
 * Update-subscription `discounts` entries accept an optional `action`.
 *
 * Contract:
 *   - Omitted action means add, so existing `{ reward_id }` callers are unchanged.
 *   - `{ action: "remove", reward_id }` removes; removal by promotion code is rejected.
 *   - Adding and removing the same reward in one request is rejected.
 */

import { describe, expect, test } from "bun:test";
import { UpdateSubscriptionV0ParamsSchema } from "@api/billing/updateSubscription/updateSubscriptionV0Params";
import { UpdateSubscriptionV1ParamsSchema } from "@api/billing/updateSubscription/updateSubscriptionV1Params";
import chalk from "chalk";

const schemas = [
	[
		"V0",
		UpdateSubscriptionV0ParamsSchema,
		{ customer_id: "cus", product_id: "pro" },
	],
	[
		"V1",
		UpdateSubscriptionV1ParamsSchema,
		{ customer_id: "cus", plan_id: "pro" },
	],
] as const;

const parseDiscounts = ({
	schema,
	params,
	discounts,
}: {
	schema: (typeof schemas)[number][1];
	params: (typeof schemas)[number][2];
	discounts: unknown[];
}) => schema.safeParse({ ...params, discounts });

describe(chalk.yellowBright("update subscription discount actions"), () => {
	test.each(schemas)(
		"%s treats an entry without action as an addition",
		(_, schema, params) => {
			const result = parseDiscounts({
				schema,
				params,
				discounts: [{ reward_id: "launch_30" }],
			});

			expect(result.success).toBe(true);
			expect(result.data?.discounts).toEqual([
				{ action: "add", reward_id: "launch_30" },
			]);
		},
	);

	test.each(schemas)(
		"%s accepts explicit add and remove entries together",
		(_, schema, params) => {
			const result = parseDiscounts({
				schema,
				params,
				discounts: [
					{ action: "add", promotion_code: "WELCOME10" },
					{ action: "remove", reward_id: "launch_30" },
				],
			});

			expect(result.success).toBe(true);
			expect(result.data?.discounts).toEqual([
				{ action: "add", promotion_code: "WELCOME10" },
				{ action: "remove", reward_id: "launch_30" },
			]);
		},
	);

	test.each(schemas)(
		"%s rejects removal without a reward_id",
		(_, schema, params) => {
			for (const discount of [
				{ action: "remove" },
				{ action: "remove", promotion_code: "WELCOME10" },
				{
					action: "remove",
					reward_id: "launch_30",
					promotion_code: "WELCOME10",
				},
			]) {
				expect(
					parseDiscounts({ schema, params, discounts: [discount] }).success,
				).toBe(false);
			}
		},
	);

	test.each(schemas)(
		"%s rejects adding and removing the same reward",
		(_, schema, params) => {
			const result = parseDiscounts({
				schema,
				params,
				discounts: [
					{ reward_id: "launch_30" },
					{ action: "remove", reward_id: "launch_30" },
				],
			});

			expect(result.success).toBe(false);
		},
	);
});
