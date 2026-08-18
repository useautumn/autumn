import { test } from "bun:test";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectPerCustomerLaneWithRejections,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

// Plan versions accumulate across runs, so every test mints its own plan id to
// keep `version: 2` deterministic.
const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

type OperationCase = {
	name: string;
	code:
		| "proration_enabled"
		| "feature_quantity_strategy"
		| "deprecated_update_items"
		| "base_price_customize"
		| "priced_add_item"
		| "unsupported_remove_items"
		| "unsupported_plan_filter";
	buildOperation: ({ planId }: { planId: string }) => Operations;
};

const versionOperation = ({
	planId,
	extras,
}: {
	planId: string;
	extras: Record<string, unknown>;
}): Operations =>
	({
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: planId, custom: false },
				version: 2,
				...extras,
			},
		],
	}) as Operations;

const cases: OperationCase[] = [
	{
		name: "proration remains per-customer",
		code: "proration_enabled",
		buildOperation: ({ planId }) =>
			versionOperation({ planId, extras: { proration: true } }),
	},
	{
		name: "quantity strategy remains per-customer",
		code: "feature_quantity_strategy",
		buildOperation: ({ planId }) =>
			versionOperation({
				planId,
				extras: {
					feature_quantities_strategy: [
						{
							feature_id: TestFeature.Messages,
							strategy: "round_to_lowest_price",
						},
					],
				},
			}),
	},
	{
		name: "deprecated update_items remains per-customer",
		code: "deprecated_update_items",
		buildOperation: ({ planId }) =>
			versionOperation({
				planId,
				extras: {
					customize: {
						update_items: [
							{
								filter: { feature_id: TestFeature.Messages },
								included: 250,
							},
						],
					},
				},
			}),
	},
	{
		name: "customize.price remains per-customer",
		code: "base_price_customize",
		buildOperation: ({ planId }) =>
			versionOperation({
				planId,
				extras: {
					customize: {
						price: { amount: 25, interval: BillingInterval.Month },
					},
				},
			}),
	},
	{
		name: "priced add_items remains per-customer",
		code: "priced_add_item",
		buildOperation: ({ planId }) =>
			versionOperation({
				planId,
				extras: {
					customize: {
						add_items: [itemsV2.prepaidMessages({ amount: 7 })],
					},
				},
			}),
	},
	{
		name: "billing-method remove matcher remains per-customer",
		code: "unsupported_remove_items",
		buildOperation: ({ planId }) =>
			versionOperation({
				planId,
				extras: {
					customize: {
						remove_items: [
							{
								feature_id: TestFeature.Messages,
								billing_method: BillingMethod.Prepaid,
							},
						],
					},
				},
			}),
	},
	{
		name: "plan item matcher remains per-customer",
		code: "unsupported_plan_filter",
		buildOperation: ({ planId }) =>
			({
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							plan_id: planId,
							custom: false,
							item: { feature_id: TestFeature.Messages },
						},
						version: 2,
					},
				],
			}) as Operations,
	},
];

for (const [index, scenario] of cases.entries()) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint inputs ${index + 1}: ${scenario.name}`)}`,
		async () => {
			const id = uniqueStem(`batch-vr-input-${index + 1}`);
			const customerId = `${id}-customer`;
			const plan = products.base({
				id: `${id}-plan`,
				items: [items.monthlyMessages({ includedUsage: 100 })],
			});
			const { autumnV2_3, ctx } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.billing.attach({ productId: plan.id })],
			});

			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [itemsV2.monthlyMessages({ included: 200 })],
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${id}-migration`,
				filter: {
					customer: {
						plan: { plan_id: plan.id, version: 1, custom: false },
					},
				},
				operations: scenario.buildOperation({ planId: plan.id }),
			});

			expectPerCustomerLaneWithRejections({
				result,
				codes: [scenario.code],
			});
		},
	);
}
