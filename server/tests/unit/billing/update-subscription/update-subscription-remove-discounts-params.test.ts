/**
 * Update-subscription requests take additions in `discounts` and removals in `remove_discounts`.
 *
 * Contract:
 *   - `discounts` keeps its existing shape: `{ reward_id }` or `{ promotion_code }`, always added.
 *   - `remove_discounts: [{ reward_id }]` removes; a promotion code or missing reward_id is rejected.
 *   - A removal alone is a valid update.
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

const parse = ({
	schema,
	params,
	body,
}: {
	schema: (typeof schemas)[number][1];
	params: (typeof schemas)[number][2];
	body: Record<string, unknown>;
}) => schema.safeParse({ ...params, ...body });

describe(chalk.yellowBright("update subscription remove_discounts"), () => {
	test.each(schemas)(
		"%s keeps discounts additive and unchanged",
		(_, schema, params) => {
			const result = parse({
				schema,
				params,
				body: {
					discounts: [
						{ reward_id: "loyalty_10" },
						{ promotion_code: "WELCOME10" },
					],
				},
			});

			expect(result.success).toBe(true);
			expect(result.data?.discounts).toEqual([
				{ reward_id: "loyalty_10" },
				{ promotion_code: "WELCOME10" },
			]);
		},
	);

	test.each(schemas)("%s accepts a removal on its own", (_, schema, params) => {
		const result = parse({
			schema,
			params,
			body: { remove_discounts: [{ reward_id: "launch_30" }] },
		});

		expect(result.success).toBe(true);
		expect(result.data?.remove_discounts).toEqual([{ reward_id: "launch_30" }]);
	});

	test.each(schemas)(
		"%s rejects removals without a reward_id",
		(_, schema, params) => {
			for (const removal of [
				{},
				{ promotion_code: "WELCOME10" },
				{ reward_id: "launch_30", promotion_code: "WELCOME10" },
			]) {
				expect(
					parse({ schema, params, body: { remove_discounts: [removal] } })
						.success,
				).toBe(false);
			}
		},
	);

	test.each(schemas)(
		"%s rejects adding and removing the same reward",
		(_, schema, params) => {
			const result = parse({
				schema,
				params,
				body: {
					discounts: [{ reward_id: "launch_30" }],
					remove_discounts: [{ reward_id: "launch_30" }],
				},
			});

			expect(result.success).toBe(false);
		},
	);
});
