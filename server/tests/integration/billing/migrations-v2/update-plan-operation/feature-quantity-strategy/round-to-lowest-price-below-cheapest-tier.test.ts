/**
 * Regression coverage for `round_to_lowest_price` when a customer's current
 * spend doesn't clear even the new ladder's cheapest paid tier (e.g. they're
 * sitting entirely within their old included allowance, paying $0). Before this
 * fix, `pickLowestPriceTier` threw in this case; it should instead resolve to
 * the new item's `included` amount only — no purchase.
 */

import { test } from "bun:test";
import type { ApiCustomerV5, CreatePlanItemParamsV1 } from "@autumn/shared";
import {
	BillingInterval,
	BillingMethod,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

/** New tier ladder — cheapest paid tier is $10, above the customer's current $0 spend. */
const NEW_TIER_ITEM: CreatePlanItemParamsV1 = {
	feature_id: TestFeature.Messages,
	reset: { interval: ResetInterval.Month },
	included: 50,
	price: {
		billing_method: BillingMethod.Prepaid,
		tier_behavior: TierBehavior.VolumeBased,
		interval: BillingInterval.Month,
		billing_units: 1,
		tiers: [
			{ to: 200, amount: 0, flat_amount: 10 },
			{ to: "inf", amount: 0, flat_amount: 40 },
		],
	},
};

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: round_to_lowest_price resolves to included amount instead of throwing when below the cheapest new tier")}`,
	async () => {
		const customerId = "migration-fqs-below-cheapest-tier";
		const pro = products.pro({
			items: [
				items.volumePrepaidMessages({
					includedUsage: 100,
					billingUnits: 1,
					tiers: [
						{ to: 500, amount: 0, flat_amount: 20 },
						{ to: "inf", amount: 0, flat_amount: 50 },
					],
				}),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			// No prepaid options → 0 purchased beyond the 100 included, so current
			// spend is $0 — below the new ladder's cheapest paid tier ($10).
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							remove_items: [
								{
									feature_id: TestFeature.Messages,
									billing_method: BillingMethod.Prepaid,
								},
							],
							add_items: [NEW_TIER_ITEM],
						},
						feature_quantities_strategy: [
							{
								feature_id: TestFeature.Messages,
								strategy: "round_to_lowest_price",
							},
						],
						proration: true,
					},
				],
			},
		});

		const customerV5 =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		expectBalanceCorrect({
			customer: customerV5,
			featureId: TestFeature.Messages,
			remaining: 50,
			usage: 0,
			planId: pro.id,
		});
	},
);
