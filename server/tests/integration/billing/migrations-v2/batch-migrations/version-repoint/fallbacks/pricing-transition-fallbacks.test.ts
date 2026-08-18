import { test } from "bun:test";
import type { CreatePlanItemParamsV1Input, ProductV2 } from "@autumn/shared";
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

type PricingCase = {
	name: string;
	code:
		| "base_price_transition"
		| "paid_entitlement_transition"
		| "priced_remove_item";
	fromItems: ProductV2["items"];
	// The target version is minted via /plans.update, whose base price is a
	// top-level field rather than an item.
	toPrice?: ReturnType<typeof itemsV2.monthlyPrice> | null;
	toItems: CreatePlanItemParamsV1Input[];
};

const pricingCases: PricingCase[] = [
	{
		name: "added base price",
		code: "base_price_transition",
		fromItems: [items.dashboard()],
		toPrice: itemsV2.monthlyPrice({ amount: 20 }),
		toItems: [itemsV2.dashboard()],
	},
	{
		name: "removed base price",
		code: "base_price_transition",
		fromItems: [items.monthlyPrice({ price: 20 }), items.dashboard()],
		toPrice: null,
		toItems: [itemsV2.dashboard()],
	},
	{
		name: "replaced base price",
		code: "base_price_transition",
		fromItems: [items.monthlyPrice({ price: 20 }), items.dashboard()],
		toPrice: itemsV2.monthlyPrice({ amount: 30 }),
		toItems: [itemsV2.dashboard()],
	},
	{
		name: "same base amount with a new billing identity",
		code: "base_price_transition",
		fromItems: [items.monthlyPrice({ price: 20 }), items.dashboard()],
		toPrice: itemsV2.annualPrice({ amount: 20 }),
		toItems: [itemsV2.dashboard()],
	},
	{
		name: "added paid entitlement",
		code: "paid_entitlement_transition",
		fromItems: [items.dashboard()],
		toItems: [itemsV2.dashboard(), itemsV2.prepaidMessages({ amount: 8 })],
	},
	{
		name: "removed paid entitlement",
		code: "priced_remove_item",
		fromItems: [items.dashboard(), items.prepaidMessages({ price: 8 })],
		toItems: [itemsV2.dashboard()],
	},
	{
		name: "replaced paid entitlement",
		code: "paid_entitlement_transition",
		fromItems: [items.dashboard(), items.prepaidMessages({ price: 8 })],
		toItems: [itemsV2.dashboard(), itemsV2.prepaidMessages({ amount: 12 })],
	},
];

for (const [index, scenario] of pricingCases.entries()) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint pricing ${index + 1}: ${scenario.name}`)}`,
		async () => {
			const id = uniqueStem(`batch-vr-pricing-${index + 1}`);
			const customerId = `${id}-customer`;
			const plan = products.base({
				id: `${id}-plan`,
				items: scenario.fromItems,
			});
			const { autumnV2_3, ctx } = await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: false, paymentMethod: "success" }),
					s.products({ list: [plan] }),
				],
				actions: [s.billing.attach({ productId: plan.id })],
			});

			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: scenario.toItems,
				...(scenario.toPrice !== undefined ? { price: scenario.toPrice } : {}),
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
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, custom: false },
							version: 2,
						},
					],
				},
			});

			expectPerCustomerLaneWithRejections({
				result,
				codes: [scenario.code],
			});
		},
	);
}
